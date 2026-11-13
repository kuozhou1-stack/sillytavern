import type { State } from './core';

export type StateChange = { path: string[]; after?: any };
export type CommitReplay = {
  changes: StateChange[]; dependencies: StateChange[]; records: State['_系统']['提交记录']; archived?: string[];
};
export class MissingCommitReplay extends Error {}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const record = (value: any) => _.isPlainObject(value);

/** 提交的实际变更值，用于重算同楼正文；不把展示文字当作重放数据。 */
export function committedChanges(before: State, after: State): StateChange[] {
  const changes: StateChange[] = [];
  const visit = (left: any, right: any, path: string[], leftExists = true, rightExists = true) => {
    if (_.isEqual(left, right) && leftExists === rightExists) return;
    if (path[0] === '_系统' && ['提交记录', '数据版本', '分支id', '楼层id', '候选回复id'].includes(path[1])) return;
    if (record(left) && record(right)) {
      for (const key of new Set([...Object.keys(left), ...Object.keys(right)]))
        visit(left[key], right[key], [...path, key], Object.hasOwn(left, key), Object.hasOwn(right, key));
    } else changes.push({ path, ...(rightExists ? { after: clone(right) } : {}) });
  };
  visit(before, after, []);
  return changes;
}

export function replayAfterStory(
  state: State, story: { version: number; replay?: CommitReplay } | undefined,
  archived: (id: string, version: number) => string | undefined = () => undefined,
): CommitReplay | undefined {
  if (!story) return;
  const rows = Object.entries(state._系统.提交记录)
    .filter(([, receipt]) => receipt.数据版本 > story.version)
    .sort((a, b) => a[1].数据版本 - b[1].数据版本);
  if (!rows.length) return story.replay;
  const payloads = rows.map(([id, receipt]) => receipt.变更JSON ?? archived(id, receipt.数据版本));
  if (payloads.some(payload => !payload))
    throw new MissingCommitReplay('此正文之后还有已确认操作，旧记录没有完整重放依据，无法无损重算。已保留原正文和变量；可从前一楼层创建聊天分支后重玩。');
  const Changes = z.array(z.object({ path: z.array(z.string()).min(1), after: z.any().optional() }));
  const changes = [...(story.replay?.changes ?? []), ...payloads.flatMap(payload => Changes.parse(JSON.parse(payload!)))];
  return makeCommitReplay(state, { ...story.replay?.records, ...Object.fromEntries(rows) }, changes);
}

export function makeCommitReplay(state: State, records: CommitReplay['records'], changes: StateChange[]): CommitReplay {
  const dependencies = new Map<string, StateChange>();
  const collections: string[][] = [
    ['手机', '账号'], ['手机', '会话'], ['手机', '群'], ['手机', '摘要'], ['手机', '_接收侧记录'],
    ...['消息', '帖子', '评论', '点赞', '转发'].map(kind => ['手机', '原文', kind]),
    ['角色'], ['_系统', '来源档案'],
  ];
  const retain = (path: string[]) => {
    const key = JSON.stringify(path);
    if (dependencies.has(key) || !_.has(state, path)) return;
    const value = clone(_.get(state, path));
    dependencies.set(key, { path, after: value });
    scan(value);
  };
  const retainId = (id: any) => {
    if (typeof id !== 'string') return;
    for (const root of collections) if (_.has(state, [...root, id])) retain([...root, id]);
  };
  const scan = (value: any) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key.endsWith('id') || key === '参与账号id' || key === '已读内容id' || key === '内容id') {
        for (const id of Array.isArray(child) ? child : [child]) retainId(id);
      } else if (typeof child === 'object') scan(child);
    }
  };
  for (const change of changes) {
    if (change.path[0] !== '手机' || !Object.hasOwn(change, 'after')) continue;
    // 变更按字段重放；完整实体只在新候选缺少该记录时作为依赖补入。
    const entityDepth = ['原文', '_阅读进度'].includes(change.path[1]) ? 4 : 3;
    retain(change.path.slice(0, Math.min(change.path.length, entityDepth)));
    scan(change.after);
    // 阅读进度的账号与会话 ID 位于字典键，不能只扫描其字段。
    if (change.path[1] === '_阅读进度') { retainId(change.path[2]); retainId(change.path[3]); }
  }
  return { changes, dependencies: [...dependencies.values()], records: clone(records) };
}

export function applyCommitReplay(candidate: State, replay?: CommitReplay): State {
  if (!replay) return candidate;
  // 只补回已确认操作所需、而新正文未建立的依赖；不覆盖整个手机或角色根节点。
  for (const dependency of replay.dependencies)
    if (!_.has(candidate, dependency.path)) _.set(candidate, dependency.path, clone(dependency.after));
  for (const change of replay.changes) {
    if (Object.hasOwn(change, 'after')) _.set(candidate, change.path, clone(change.after));
    else _.unset(candidate, change.path);
  }
  Object.assign(candidate._系统.提交记录, clone(replay.records));
  // 旧基线可能早于关闭操作，不能把已经归档的私有重放值再次带回活动变量。
  for (const id of replay.archived ?? [])
    if (candidate._系统.提交记录[id]) delete candidate._系统.提交记录[id].变更JSON;
  return candidate;
}
