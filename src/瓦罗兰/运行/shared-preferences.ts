import { klona } from 'klona';

export type SharedPreference = 'api-variable' | 'api-phone' | 'api-information';
const filename = (key: SharedPreference) => `valoran-v1-${key}.json`;
const serverUrl = (path: string) => new URL(path, window.parent.location.href).href;

let account: Promise<string> | undefined;
export function browserPreferenceScope(): Promise<string> {
  account ??= fetch(serverUrl('/api/users/me'), {
    credentials: 'same-origin', headers: SillyTavern.getRequestHeaders(),
  }).then(async response => {
    if (!response.ok) throw Error(`读取酒馆账号失败（HTTP ${response.status}）`);
    return z.object({ handle: z.string().min(1) }).parse(await response.json()).handle;
  }).catch(error => { account = undefined; throw error; });
  return account;
}

/** 与澄湾使用同一酒馆用户文件机制，文件名及浏览器命名空间独立。 */
export async function readSharedPreference(key: SharedPreference): Promise<unknown | null> {
  const response = await fetch(serverUrl(`/user/files/${filename(key)}`), {
    credentials: 'same-origin', cache: 'no-store',
  });
  if (response.status === 404) return null;
  if (!response.ok) throw Error(`读取酒馆共用配置失败（HTTP ${response.status}）`);
  const record = await response.json();
  if (record?.version !== 1 || !Object.hasOwn(record, 'value')) throw Error('酒馆共用配置格式不兼容');
  return record.value;
}

export async function saveSharedPreference(key: SharedPreference, value: unknown): Promise<void> {
  const plain = klona(value);
  const bytes = new TextEncoder().encode(JSON.stringify({ version: 1, value: plain }));
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32768)
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
  const response = await fetch(serverUrl('/api/files/upload'), {
    method: 'POST', credentials: 'same-origin', headers: SillyTavern.getRequestHeaders(),
    body: JSON.stringify({ name: filename(key), data: btoa(chunks.join('')) }),
  });
  if (!response.ok) throw Error(`保存酒馆共用配置失败（HTTP ${response.status}）`);
  if (!_.isEqual(await readSharedPreference(key), plain)) throw Error('酒馆共用配置保存后读回不一致，请重新保存');
}
