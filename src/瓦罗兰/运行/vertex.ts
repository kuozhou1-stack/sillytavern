import { browserPreferenceScope } from './shared-preferences';
import type { ApiProfile } from './settings';

export type VertexProfile = { projectId: string; region: string; vertexCredentialId: string };
export type VertexThinkingLevel = ApiProfile['vertexThinkingLevel'];
export type VertexRequestProfile = VertexProfile & { vertexThinkingLevel?: VertexThinkingLevel };
const tokenUrl = 'https://oauth2.googleapis.com/token';
const scope = 'https://www.googleapis.com/auth/cloud-platform';
type Credential = { email: string; keyId: string; signingKey: CryptoKey };

function browserCrypto() {
  const crypto = window.parent.crypto;
  if (!crypto?.subtle) throw Error('Vertex 服务账号需要通过 localhost 或 HTTPS 打开酒馆');
  return crypto.subtle;
}

// Both the desktop and the runtime script use the Tavern origin and the signed-in account.
async function credentialStore<T>(
  mode: IDBTransactionMode, action: (store: IDBObjectStore, account: string) => IDBRequest<T>,
): Promise<T> {
  const account = await browserPreferenceScope();
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.parent.indexedDB.open('valoran-vertex-credentials', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('credentials');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction('credentials', mode);
      const request = action(transaction.objectStore('credentials'), account);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error ?? Error('浏览器无法读写 Vertex 凭据'));
    });
  } finally { db.close(); }
}

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export async function importVertexServiceAccount(text: string) {
  // JSON parser errors can include excerpts of the uploaded credential.
  let account;
  try { account = JSON.parse(text); }
  catch { throw Error('服务账号文件不是有效的 JSON'); }
  if (account?.type !== 'service_account' || typeof account.project_id !== 'string' || !account.project_id.trim()
    || typeof account.client_email !== 'string' || !account.client_email.trim()
    || typeof account.private_key_id !== 'string' || !account.private_key_id.trim() || typeof account.private_key !== 'string')
    throw Error('请选择 Google Cloud 下载的服务账号 JSON 密钥文件');
  const crypto = browserCrypto();
  let signingKey: CryptoKey;
  try {
    const pem = account.private_key.match(/^\s*-----BEGIN PRIVATE KEY-----([A-Za-z0-9+/=\s]+)-----END PRIVATE KEY-----\s*$/);
    if (!pem) throw Error();
    const der = Uint8Array.from(atob(pem[1].replace(/\s/g, '')), c => c.charCodeAt(0));
    signingKey = await crypto.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  } catch { throw Error('服务账号的 RSA 私钥格式无效，请重新导入 Google Cloud 的 JSON 文件'); }
  const email = account.client_email.trim(), keyId = account.private_key_id.trim();
  const id = base64url(new Uint8Array(await crypto.digest('SHA-256', new TextEncoder().encode(email + '/' + keyId))));
  await credentialStore('readwrite', (store, handle) => store.put({ email, keyId, signingKey } satisfies Credential, [handle, id]));
  return { projectId: account.project_id.trim() as string, vertexCredentialId: id };
}

function vertexOrigin(region: string) {
  // A location is a single Google hostname label, never a user-supplied base URL.
  if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(region)) throw Error('Vertex 区域无效，请填写 global 或 Google Cloud 区域名称');
  return region === 'global' ? 'https://aiplatform.googleapis.com' : `https://${region}-aiplatform.googleapis.com`;
}

function googleModelId(model: string) {
  return model.trim().replace(/^(?:publishers\/google\/models\/|google\/)/, '');
}

function modelFamily(model: string) {
  return googleModelId(model).replace(/@[^/]+$/, '').replace(/-(?:(?:preview|exp)(?:-customtools|-[\d-]+)?|\d{3})$/, '');
}

// Model Garden lists model IDs, but its PublisherModel resource has no thinking-level field.
// Families and levels: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/thinking
export function vertexThinkingLevels(model: string): readonly VertexThinkingLevel[] {
  const family = modelFamily(model);
  if (['gemini-4-neon', 'gemini-4-hydrogen'].includes(family)) return ['default', 'low', 'medium', 'high', 'xhigh'];
  if ([
    'gemini-4-argon', 'gemini-4-carbon', 'gemini-4-argon-cyber-permissive', 'gemini-4-carbon-cyber-permissive',
    'gemini-3.8-flash', 'gemini-3.8-flash-cyber', 'gemini-3.7-flash', 'gemini-3.1-pro',
    'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro',
  ].includes(family))
    return ['default', 'low', 'medium', 'high'];
  if (['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3-flash'].includes(family))
    return ['default', 'minimal', 'low', 'medium', 'high'];
  if (family === 'gemini-3-pro') return ['default', 'low', 'high'];
  if (['gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image'].includes(family)) return ['default', 'minimal', 'high'];
  if (family === 'gemini-3-pro-image') return ['default', 'high'];
  return ['default'];
}

export function vertexConnection({ projectId, region, vertexCredentialId, model, vertexThinkingLevel = 'default' }: VertexRequestProfile & { model: string }) {
  return { source: 'vertexai', model, vertex: { projectId, region, vertexCredentialId, vertexThinkingLevel } };
}

export function applyVertexGenerationOptions(payload: Record<string, any>, model: string, level: VertexThinkingLevel = 'default') {
  if (!vertexThinkingLevels(model).includes(level)) throw Error(`当前 Vertex 模型不支持 ${level} 思考强度，请重新选择`);
  // SillyTavern forwards custom_include_body to the actual OpenAI-compatible HTTP body.
  // Its top-level reasoning_effort is otherwise derived from the global preset.
  delete payload.reasoning_effort;
  delete payload.top_k;
  const family = modelFamily(model);
  if (/^gemini-(?:4-|3\.[5-8]-flash)/.test(family)) {
    for (const key of ['temperature', 'top_p', 'presence_penalty', 'frequency_penalty', 'n']) delete payload[key];
  }
  if (level === 'default') return;
  const options = family.startsWith('gemini-2.5-') ? { reasoning_effort: level }
    : { extra_body: { google: { thinking_config: { thinking_level: level.toUpperCase() } } } };
  payload.custom_include_body = JSON.stringify(options);
}

async function accessToken(profile: VertexProfile, signal?: AbortSignal) {
  const crypto = browserCrypto();
  const credential: Credential | undefined = await credentialStore('readonly', (store, handle) => store.get([handle, profile.vertexCredentialId]));
  if (!credential) throw Error('当前浏览器没有这份 Vertex 服务账号密钥，请在该 API 配置中重新导入 JSON');
  const encode = (value: object) => base64url(new TextEncoder().encode(JSON.stringify(value)));
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'RS256', typ: 'JWT', kid: credential.keyId });
  const claims = encode({ iss: credential.email, scope, aud: tokenUrl, iat: now, exp: now + 3600 });
  const unsigned = header + '.' + claims;
  const signature = await crypto.sign('RSASSA-PKCS1-v1_5', credential.signingKey, new TextEncoder().encode(unsigned));
  const response = await fetch(tokenUrl, {
    method: 'POST', credentials: 'omit', redirect: 'error', signal,
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + base64url(new Uint8Array(signature)) }),
  });
  if (!response.ok) throw Error(`Vertex 服务账号认证失败（HTTP ${response.status}），请检查密钥是否有效及设备时间`);
  let data;
  try { data = await response.json(); }
  catch {
    signal?.throwIfAborted();
    throw Error('Google 认证响应不是有效的 JSON');
  }
  if (typeof data?.access_token !== 'string' || !data.access_token) throw Error('Google 认证响应缺少访问令牌');
  return data.access_token as string;
}

export async function listVertexModels(profile: VertexProfile, signal?: AbortSignal): Promise<string[]> {
  const url = new URL('/v1beta1/publishers/google/models', vertexOrigin(profile.region));
  url.searchParams.set('pageSize', '100');
  const token = await accessToken(profile, signal);
  const models = new Set<string>();
  let next: string | undefined;
  do {
    if (next) url.searchParams.set('pageToken', next);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, 'x-goog-user-project': profile.projectId },
      cache: 'no-store', credentials: 'omit', redirect: 'error', signal,
    });
    if (!response.ok) throw Error(`读取 Vertex 模型目录失败（HTTP ${response.status}），请检查项目、区域与 Vertex AI 权限`);
    const data = await response.json();
    for (const entry of data.publisherModels ?? []) {
      const id = /^publishers\/google\/models\/(gemini-[^/@]+)(?:@[^/@]+)?$/.exec(entry.name)?.[1];
      if (id && !/-(?:embedding|image|tts|live|audio)(?:-|$)/i.test(id)) models.add(id);
    }
    next = data.nextPageToken;
  } while (next);
  return [...models].sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
}

export async function vertexTransport(profile: VertexProfile, model: string, signal: AbortSignal) {
  const origin = vertexOrigin(profile.region);
  const key = await accessToken(profile, signal);
  const project = encodeURIComponent(profile.projectId);
  return {
    url: `${origin}/v1/projects/${project}/locations/${profile.region}/endpoints/openapi`,
    model: 'google/' + googleModelId(model),
    key,
  };
}
