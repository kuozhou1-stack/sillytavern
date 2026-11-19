import { parseCharacterBatch, selectedCharacters } from './character-batch';
import { sha256 } from '../../../运行/browser-crypto';

declare const __CHENGWAN_CHARACTER_CATALOG_URL__: string;
// 正式构建注入固定提交的公开地址；本地监听继续使用本地资源。
export const defaultCharacterCatalogUrl = typeof __CHENGWAN_CHARACTER_CATALOG_URL__ === 'string'
  ? __CHENGWAN_CHARACTER_CATALOG_URL__
  : 'http://localhost:5500/dist/瓦罗兰/角色资源/index.json';
const Entry = z.object({ id: z.string().min(1), name: z.string().min(1), tier: z.enum(['主要', '次要']),
  identity: z.string().nullable(), race: z.string().nullable() });
const Manifest = z.object({ format: z.literal('符文都市角色名录/1'), data: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), entries: z.array(Entry) });
export type CharacterCatalog = z.infer<typeof Manifest> & { url: string; dataUrl: string };
const cachedData = new Map<string, Promise<Record<string, any>>>();
type Fetcher = typeof fetch;

export async function loadCharacterCatalog(input: string, request: Fetcher = fetch): Promise<CharacterCatalog> {
  const url = new URL(input.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error('角色库链接须为 HTTP 或 HTTPS 地址');
  const response = await request(url.href, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw Error('角色名录读取失败：HTTP ' + response.status);
  const manifest = Manifest.parse(await response.json());
  if (new Set(manifest.entries.map(entry => entry.id)).size !== manifest.entries.length) throw Error('角色名录包含重复ID');
  const dataUrl = new URL(manifest.data, url);
  if (dataUrl.origin !== url.origin) throw Error('角色资料与名录须放在同一站点');
  return { ...manifest, url: url.href, dataUrl: dataUrl.href };
}

export async function catalogCharacters(catalog: CharacterCatalog, ids: string[], existingIds: string[], request: Fetcher = fetch) {
  const selected = [...new Set(ids)], available = new Set(catalog.entries.map(entry => entry.id));
  if (selected.some(id => !available.has(id))) throw Error('选中的角色已不在当前名录');
  if (!selected.length) return [];
  const key = catalog.dataUrl + ':' + catalog.sha256;
  let loading = cachedData.get(key);
  if (!loading) {
    loading = (async () => {
      const response = await request(catalog.dataUrl, { cache: 'force-cache', signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw Error('角色资料读取失败：HTTP ' + response.status);
      const bytes = await response.arrayBuffer();
      const digest = await sha256(bytes);
      if (digest !== catalog.sha256) throw Error('角色资料版本与名录不一致，请重新读取名录');
      const data = JSON.parse(new TextDecoder().decode(bytes));
      if (data.format !== '符文都市角色资源/1' || !data.characters || typeof data.characters !== 'object') throw Error('角色资源格式不兼容');
      return data.characters;
    })();
    cachedData.set(key, loading);
  }
  let data: Record<string, any>;
  try { data = await loading; } catch (error) { cachedData.delete(key); throw error; }
  const rows = parseCharacterBatch(selected.map(id => ({ name: id, text: JSON.stringify(data[id]) })), existingIds);
  for (const [index, row] of rows.entries()) {
    if (!row.result.success) throw Error((catalog.entries.find(entry => entry.id === selected[index])?.name ?? '角色') + '：' + row.result.error);
    if (row.result.charId !== selected[index]) throw Error('角色资料身份与名录不一致');
  }
  return selectedCharacters(rows);
}
