import { formatTimeObj, resolveEntityName } from './entity';

export const isRecordTime = (value: any) =>
  !!value && typeof value === 'object' && ['年', '月', '日'].every(k => typeof value[k] === 'number');
export function hasRecordValue(value: any): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.some(hasRecordValue);
  if (typeof value === 'object')
    return Object.entries(value).some(([key, v]) => !key.startsWith('_') && hasRecordValue(v));
  return true;
}
export const recordEntries = (value: any): [string, any][] =>
  Object.entries(value ?? {}).filter(([key, v]) => !key.startsWith('_') && hasRecordValue(v));
export const isRecordReference = (key = '') =>
  /id$/i.test(key) || ['参与者', '对象', '人物', '地点', '账户', '组织'].includes(key);
export function recordScalar(value: any, state: any, reference = false): string {
  if (!hasRecordValue(value)) return '未知';
  if (isRecordTime(value)) return formatTimeObj(value);
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'object') return '暂无可读内容';
  const text = String(value);
  const resolved = resolveEntityName(state, text);
  if (resolved !== text) return resolved;
  if (reference || /^(char|loc|acc|account|org|usr|npc|cog|event)_/.test(text)) return '关联资料未知';
  return text;
}
export function recordLabel(key: string, value: any, index: number, state: any, reference = false): string {
  const title =
    value &&
    typeof value === 'object' &&
    ['名称', '姓名', '标题', '主题'].map(k => value[k]).find(v => typeof v === 'string' && v.trim());
  if (title) return title;
  const resolved = resolveEntityName(state, key);
  if (resolved !== key) return resolved;
  if (reference || !/^[\p{Script=Han}]+(?:id)?$/u.test(key)) return `记录 ${index + 1}`;
  return key.replace(/id$/i, '');
}
