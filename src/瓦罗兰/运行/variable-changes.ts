/** Read-only account of a story settlement. Paths, rather than importance, determine groups. */
export type VariableChange = {
  path: string;
  label: string;
  before: string;
  after: string;
  delta: string;
  important: boolean;
};
export type StorySettlement = {
  floor: number;
  swipe: number;
  commitId: string;
  version: number;
  baseFloor: number;
  baseSwipe: number;
  baseVersion: number;
  changes: VariableChange[];
  replayId?: string;
};
export type ChangeGroup = { key: string; label: string; rows: VariableChange[] };
export type StoryChangeStatus = {
  state: 'receiving' | 'pending' | 'failed' | 'saved' | 'unknown';
  note: string;
  changes: VariableChange[];
  groups: ChangeGroup[];
};

type Dict = Record<string, unknown>;
const record = (value: unknown): value is Dict => value !== null && typeof value === 'object' && !Array.isArray(value);
const parts = (path: string) => path.slice(1).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'));
const pointer = (path: string[]) => '/' + path.map(part => part.replace(/~/g, '~0').replace(/\//g, '~1')).join('/');
const meaningful = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;
const title = (value: unknown) => {
  if (!record(value)) return undefined;
  return meaningful(value.名称) ?? meaningful(value.姓名) ?? meaningful(value.显示名称) ?? meaningful(value.昵称) ?? meaningful(value.标题);
};
const readableReference = (value: unknown, before: Dict, after: Dict): unknown => {
  if (typeof value !== 'string' || !value) return value;
  for (const source of [after, before]) {
    for (const root of ['角色', '地点', '组织', '事件', '约定']) {
      const collection = source[root];
      if (record(collection)) {
        const found = title(collection[value]);
        if (found) return found;
      }
    }
    const player = record(source.玩家) ? source.玩家 : undefined;
    const funds = record(player?.资金) ? player.资金 : undefined;
    const accounts = record(funds?.账户) ? funds.账户 : undefined;
    const account = title(accounts?.[value]);
    if (account) return account;
  }
  return value;
};
const fieldName = (key: string) => key.endsWith('id') && key.length > 2 ? key.slice(0, -2) : key;
const display = (value: unknown, exists: boolean): string => {
  if (!exists) return '未记录';
  if (value === null) return '未知';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'string') return value === '' ? '空文本' : value;
  if (Array.isArray(value)) return value.length ? `${value.length} 项` : '空列表';
  if (record(value)) return Object.keys(value).length ? `${Object.keys(value).length} 项` : '空记录';
  return String(value);
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Compare the saved snapshots; never parse or execute the model's JSONPatch here. */
export function savedChanges(before: Dict, after: Dict): VariableChange[] {
  const rows: VariableChange[] = [];
  const walk = (old: unknown, next: unknown, path: string[], oldExists: boolean, nextExists: boolean, names: string[]) => {
    if (oldExists && nextExists && same(old, next)) return;
    if ((Array.isArray(old) || !oldExists) && (Array.isArray(next) || !nextExists) &&
        (Array.isArray(old) || Array.isArray(next))) {
      const left = Array.isArray(old) ? old : [];
      const right = Array.isArray(next) ? next : [];
      if (left.length || right.length) {
        for (let i = 0; i < Math.max(left.length, right.length); i++)
          walk(left[i], right[i], [...path, String(i)], i < left.length, i < right.length, [...names, `第 ${i + 1} 项`]);
        return;
      }
    }
    if ((record(old) || !oldExists) && (record(next) || !nextExists) && (record(old) || record(next))) {
      const left = record(old) ? old : {};
      const right = record(next) ? next : {};
      const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
      if (keys.size) {
        for (const key of keys) {
          if (key.startsWith('_') || key === '$internal') continue;
          const named = (['角色', '地点', '组织', '事件', '约定'].includes(path[0]) && path.length === 1) ||
            (path[0] === '玩家' && path.includes('账户'))
            ? title(right[key]) ?? title(left[key])
            : undefined;
          walk(left[key], right[key], [...path, key], Object.hasOwn(left, key), Object.hasOwn(right, key), [...names, named ?? fieldName(key)]);
        }
        return;
      }
    }
    if (!path.length) return;
    const numeric = oldExists && nextExists && typeof old === 'number' && typeof next === 'number' && Number.isFinite(old) && Number.isFinite(next);
    const difference = numeric ? next - old : 0;
    const root = path[0];
    const important = (root === '玩家' && /^(当前状态|资金|身份)$/.test(path[1] ?? '')) ||
      (root === '世界' && path[1] === '当前时间') ||
      (root === '角色' && /^(当前状态|关系)$/.test(path[2] ?? ''));
    rows.push({
      path: pointer(path),
      label: names.join(' · '),
      before: display(path.at(-1)?.endsWith('id') ? readableReference(old, before, after) : old, oldExists),
      after: display(path.at(-1)?.endsWith('id') ? readableReference(next, before, after) : next, nextExists),
      delta: numeric && difference !== 0 ? `${difference > 0 ? '+' : ''}${Number(difference.toFixed(6))}` : '',
      important,
    });
  };
  walk(before, after, [], true, true, []);
  return rows.sort((a, b) => Number(b.important) - Number(a.important));
}

export function groupVariableChanges(rows: VariableChange[]): ChangeGroup[] {
  const groups = new Map<string, ChangeGroup>();
  for (const row of rows) {
    const path = parts(row.path);
    const depth = ['角色', '地点', '组织', '事件', '约定', '手机', '玩家'].includes(path[0]) && path[1] ? 2 : 1;
    const key = pointer(path.slice(0, depth));
    let group = groups.get(key);
    if (!group) {
      const friendly = depth === 2 && ['角色', '地点', '组织', '事件', '约定'].includes(path[0])
        ? row.label.split(' · ')[1] ?? path[1]
        : path.slice(0, depth).join(' · ');
      group = { key, label: friendly, rows: [] };
      groups.set(key, group);
    }
    group.rows.push(row);
  }
  return [...groups.values()];
}

export function storyChangeStatus(input: {
  floor: number;
  swipe: number;
  data?: Dict;
  previous?: { floor: number; swipe: number; data: Dict };
  settlement?: StorySettlement;
  pending: boolean;
  failed: boolean;
  receiving: boolean;
}): StoryChangeStatus {
  const make = (state: StoryChangeStatus['state'], note: string, changes: VariableChange[] = []): StoryChangeStatus =>
    ({ state, note, changes, groups: groupVariableChanges(changes) });
  if (input.receiving) return make('receiving', '正文接收中，尚未开始变量结算。');
  if (input.pending) return make(input.failed ? 'failed' : 'pending', input.failed
    ? '正文已保留，变量结算失败；请从瓦洛兰输入区重试。'
    : '正文已保留，等待读取并保存变量。');
  const data = input.data;
  const system = record(data?._系统) ? data._系统 : undefined;
  if (!data || !system || system.楼层id !== input.floor || String(system.候选回复id) !== String(input.swipe))
    return make('unknown', '所选候选尚无可确认的本楼变量。');
  const saved = input.settlement;
  const receipts = record(system.提交记录) ? system.提交记录 : {};
  if (saved && saved.floor === input.floor && saved.swipe === input.swipe &&
      ((input.previous?.floor === saved.baseFloor && input.previous?.swipe === saved.baseSwipe) ||
       (saved.baseFloor === input.floor && saved.baseSwipe === input.swipe)) &&
      typeof saved.commitId === 'string' && record(receipts[saved.commitId]) &&
      (receipts[saved.commitId] as Dict).数据版本 === saved.version &&
      typeof system.数据版本 === 'number' && system.数据版本 >= saved.version &&
      Array.isArray(saved.changes))
    return make('saved', saved.changes.length ? '本轮正文结算已保存；后续手机操作不计入。' : '本轮已保存，变量无变化。', saved.changes);
  const previous = input.previous;
  const previousSystem = record(previous?.data?._系统) ? previous.data._系统 : undefined;
  if (previous && previousSystem && typeof previousSystem.数据版本 === 'number' &&
      system.数据版本 === previousSystem.数据版本 + 1) {
    const changes = savedChanges(previous.data, data);
    return make('saved', changes.length ? '依据所选候选与上一已结算楼层的保存值。' : '本轮已保存，变量无变化。', changes);
  }
  return make('unknown', '历史楼层缺少本轮结算记录，无法排除后续手机或其他操作。');
}
