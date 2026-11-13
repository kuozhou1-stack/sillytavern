import { Schema } from '../schema';
import { copy, equal, uid, type State } from './core';
import { exportCharacter } from './characters';

export const LIBRARY_KEY = '澄湾角色库';
export const DEFAULT_CATEGORY_ID = 'uncategorized';
const Category = z.object({ id: z.string(), name: z.string().trim().min(1), isDefault: z.boolean() });
export const AutomaticRosterSchema = z.object({
  manualOff: z.array(z.string()).prefault([]),
  queues: z.object({ 主要: z.array(z.string()).prefault([]), 次要: z.array(z.string()).prefault([]) }).prefault({}),
  rotation: z.record(z.string(), z.string()).prefault({}),
  checks: z.record(z.string(), z.string()).prefault({}),
  anchor: z.string().nullable().prefault(null),
  opening: z.object({ requestedIds: z.array(z.string()), selectedIds: z.array(z.string()) }).optional(),
});
export type AutomaticRoster = z.infer<typeof AutomaticRosterSchema>;
const Revision = z.object({
  categories: z.array(Category),
  meta: z.record(z.string(), z.object({ categoryId: z.string(), order: z.number().int().nonnegative() })),
  disabled: z.record(z.string(), z.string()),
  automatic: AutomaticRosterSchema.optional(),
});
const Snapshot = z.object({
  id: z.string(),
  saveId: z.string().nullable(),
  version: z.number(),
  // Business snapshot is separate from runtime tasks/commit records. Validate it again at restore.
  pack: z.any(),
  replays: z.record(z.string(), z.object({ version: z.number().int(), changes: z.string() })).optional(),
});
export const LibrarySchema = z
  .object({
    format: z.literal(1).prefault(1),
    revisions: z.record(z.string(), Revision).prefault({}),
    snapshots: z.record(z.string(), Snapshot).prefault({}),
  })
  .prefault({});
export type CharacterLibrary = z.infer<typeof LibrarySchema>;
export type LibraryRevision = z.infer<typeof Revision>;
export type LibraryCommand =
  | { kind: 'create'; name: string }
  | { kind: 'rename'; categoryId: string; name: string }
  | { kind: 'delete'; categoryId: string }
  | { kind: 'categories'; ids: string[] }
  | { kind: 'move'; id: string; categoryId: string; index?: number }
  | { kind: 'order'; categoryId: string; ids: string[] }
  | { kind: 'enabled'; ids: string[]; enabled: boolean; categoryId?: string };

export function libraryRevision(state: State, library: CharacterLibrary): LibraryRevision {
  const key = state._系统.角色库版本;
  if (key && !library.revisions[key]) throw Error('当前候选的角色库版本缺失，请恢复完整聊天备份；不会读取其他分支');
  const revision = key
    ? copy(library.revisions[key])
    : ({
        categories: [{ id: DEFAULT_CATEGORY_ID, name: '未分类', isDefault: true }],
        meta: {},
        disabled: {},
      } as LibraryRevision);
  // Removed/replaced characters must not inherit an old dormant snapshot.
  for (const [id, snapshotId] of Object.entries(revision.disabled)) {
    const snapshot = library.snapshots[snapshotId];
    if (!snapshot) throw Error('停用快照缺失：' + id);
    if (state.角色[id] || state._系统.角色停用标识[id]?.版本 !== snapshot.version) delete revision.disabled[id];
  }
  const ids = [...Object.keys(state.角色), ...Object.keys(revision.disabled)];
  for (const id of Object.keys(revision.meta)) if (!ids.includes(id)) delete revision.meta[id];
  for (const id of ids)
    revision.meta[id] ??= { categoryId: DEFAULT_CATEGORY_ID, order: Object.keys(revision.meta).length };
  return revision;
}

export function libraryView(state: State, raw: unknown) {
  const library = LibrarySchema.parse(raw),
    revision = libraryRevision(state, library);
  const characters = copy(state.角色);
  for (const [id, snapshotId] of Object.entries(revision.disabled))
    characters[id] = copy(library.snapshots[snapshotId].pack.角色);
  return {
    categories: revision.categories,
    meta: Object.fromEntries(
      Object.entries(revision.meta).map(([id, meta]) => [id, { ...meta, enabled: !!state.角色[id] }]),
    ),
    characters,
    rotationIds: Object.keys(revision.automatic?.rotation ?? {}).filter(id => !!state.角色[id]),
  };
}
export type LibraryView = ReturnType<typeof libraryView>;

export function exportManagedCharacter(state: State, raw: unknown, id: string) {
  if (state.角色[id]) return exportCharacter(state, id);
  const library = LibrarySchema.parse(raw),
    revision = libraryRevision(state, library);
  const snapshot = library.snapshots[revision.disabled[id]];
  if (!snapshot) throw Error('当前候选没有此角色的可恢复资料');
  return copy(snapshot.pack);
}

function invalidateTasks(state: State, ids: Set<string>) {
  for (const [taskId, task] of Object.entries(state._系统.任务)) {
    // Candidate JSON may contain a whole state, even in unrelated old tasks.
    task.候选结果JSON = null;
    if (!task.目标id.some(id => ids.has(id))) continue;
    task.状态 = '失效';
    task.错误 = null;
    task.触发来源 = null;
    task.覆盖记录id = [];
    for (const person of Object.values(state.角色))
      if (person.层级 === '主要' && person._更新循环.待处理任务id === taskId) person._更新循环.待处理任务id = null;
  }
  for (const commit of Object.values(state._系统.提交记录)) commit.恢复候选JSON = null;
}

function disable(state: State, library: CharacterLibrary, revision: LibraryRevision, id: string) {
  if (revision.disabled[id] && !state.角色[id]) return;
  const person = state.角色[id];
  if (!person) throw Error('人物不存在或不属于当前候选：' + id);
  const pack = { ...exportCharacter(state, id), 停用时在场: state.世界.当前场景.在场人物.includes(id) },
    snapshotId = uid('character_snapshot');
  const version = Math.max(person._管理.版本, state._系统.角色停用标识[id]?.版本 ?? 0) + 1;
  library.snapshots[snapshotId] = { id, saveId: state._系统.存档id, version, pack };
  const accounts = new Set(Object.keys(pack.手机.账号));
  const sources = new Set(Object.keys(pack.来源档案));
  const tasks = new Set(Object.entries(state._系统.任务).filter(([, task]) => task.目标id.includes(id)).map(([key]) => key));
  for (const [commitId, receipt] of Object.entries(state._系统.提交记录)) {
    if (!receipt.变更JSON) continue;
    const changes = JSON.parse(receipt.变更JSON) as { path: string[] }[];
    if (changes.some(({ path }) =>
      (path[0] === '角色' && path[1] === id) ||
      (path[0] === '手机' && path[1] === '账号' && accounts.has(path[2])) ||
      (path[0] === '_系统' && path[1] === '来源档案' && sources.has(path[2])) ||
      (path[0] === '_系统' && path[1] === '任务' && tasks.has(path[2])))) {
      // 停用后不在活动变量残留旧全文；重放所需的值随原有独立快照保存。
      (library.snapshots[snapshotId].replays ??= {})[commitId] = { version: receipt.数据版本, changes: receipt.变更JSON };
      delete receipt.变更JSON;
    }
  }
  revision.disabled[id] = snapshotId;
  state._系统.角色停用标识[id] = { 姓名: person.姓名, 版本: version };
  delete state.角色[id];
  state.世界.当前场景.在场人物 = state.世界.当前场景.在场人物.filter(target => target !== id);
  for (const [key, source] of Object.entries(state._系统.来源档案))
    if (source.人物id === id) delete state._系统.来源档案[key];
  // Keep account identity for existing sessions, references and delivery records, not its profile.
  for (const account of Object.values(state.手机.账号))
    if (account.人物id === id) {
      account.头像资源 = null;
      account.简介 = null;
      account.公开资料 = {};
    }
}

function enable(state: State, library: CharacterLibrary, revision: LibraryRevision, id: string, resumeLife = false) {
  if (state.角色[id] && !revision.disabled[id]) return;
  const snapshot = library.snapshots[revision.disabled[id]];
  if (
    !snapshot ||
    snapshot.id !== id ||
    snapshot.saveId !== state._系统.存档id ||
    snapshot.version !== state._系统.角色停用标识[id]?.版本
  )
    throw Error('恢复快照与当前存档／候选不匹配：' + id);
  const person = Schema.parse({ 角色: { [id]: snapshot.pack.角色 } }).角色[id];
  // 兼容本轮明确退役的字段及新增的未知值，不改写原始停用快照。
  const expected = copy(snapshot.pack.角色) as any;
  delete expected.籍贯;
  for (const key of ['种族', '当前形态']) if (!Object.hasOwn(expected, key)) expected[key] = null;
  if (!equal(person, expected)) throw Error('恢复资料结构已变化，请保留快照并迁移后重试');
  person._管理.版本 = snapshot.version + 1;
  // 自动待机保留快照中的用户意图，旧任务仍失效；恢复后按新人物版本重新排队。
  if (!resumeLife) person._管理.升格 = false;
  // Same-save continuity: no import/naturalization, no recreated contacts or relationships.
  person._管理.来源档案id = null;
  person._管理.恢复说明 = `于${JSON.stringify(state.世界.当前时间)}重新开启。当前状态、地点及穿搭为${JSON.stringify(snapshot.pack.来源.导出故事时间)}停用时最后记录；${resumeLife ? '本次轮换须在同次变量结算中接续最后记录至当前时点的自主生活，检查地点、状态、与玩家关系及经历；合理接续已有作息、目标和约定，不强造重大事件或无依据的关系变化，不把后台经历赋予玩家知情' : '仅按恢复后的实际互动确认现状，不补造关闭期间经历'}，不自动加入当前场景。未完成约定保留原事实，按实际发生情况衔接。`;
  if (person.层级 === '主要') {
    person._更新循环.待处理任务id = null;
    person._更新循环.当前计数 = 0;
    person._更新循环.上次更新变量时间 = copy(resumeLife
      ? snapshot.pack.来源.导出故事时间 : state.世界.当前时间);
  }
  // Retain last known location and all commitments. No invented off-screen activity.
  for (const [key, account] of Object.entries(snapshot.pack.手机.账号) as [string, State['手机']['账号'][string]][]) {
    if (state.手机.账号[key] && state.手机.账号[key].人物id !== id) throw Error('账号 ID 被占用，保留停用状态：' + key);
    state.手机.账号[key] = copy(account);
  }
  state.角色[id] = person;
  delete state._系统.角色停用标识[id];
  delete revision.disabled[id];
}

/** Pure preparation. Caller must persist the immutable library BEFORE committing its reference. */
export function prepareLibraryCommand(before: State, raw: unknown, command: LibraryCommand) {
  const state = copy(before),
    library = LibrarySchema.parse(raw),
    revision = libraryRevision(state, library);
  state._系统.存档id ??= uid('save');
  const members = (categoryId: string) =>
    Object.keys(revision.meta)
      .filter(id => revision.meta[id].categoryId === categoryId)
      .sort((a, b) => revision.meta[a].order - revision.meta[b].order);
  const category = (id: string) => {
    const value = revision.categories.find(c => c.id === id);
    if (!value) throw Error('分类已变化，请重试');
    return value;
  };
  const name = (value: string, except?: string) => {
    const text = Category.shape.name.parse(value);
    if (revision.categories.some(c => c.id !== except && c.name === text)) throw Error('分类名称重复');
    return text;
  };
  const order = (ids: string[]) =>
    ids.forEach((id, index) => {
      revision.meta[id].order = index;
    });
  const exact = (ids: string[], all: string[]) => {
    if (new Set(ids).size !== ids.length || !equal([...ids].sort(), [...all].sort()))
      throw Error('排序列表与当前成员不一致');
  };
  let created: z.infer<typeof Category> | undefined;
  const results: { id: string; enabled: boolean; changed: boolean }[] = [];
  switch (command.kind) {
    case 'create':
      created = { id: uid('category'), name: name(command.name), isDefault: false };
      revision.categories.push(created);
      break;
    case 'rename':
      if (category(command.categoryId).isDefault) throw Error('未分类为保留分类');
      category(command.categoryId).name = name(command.name, command.categoryId);
      break;
    case 'delete': {
      if (category(command.categoryId).isDefault) throw Error('未分类为保留分类');
      const ids = [...members(DEFAULT_CATEGORY_ID), ...members(command.categoryId)];
      ids.forEach(id => {
        revision.meta[id].categoryId = DEFAULT_CATEGORY_ID;
      });
      order(ids);
      revision.categories = revision.categories.filter(c => c.id !== command.categoryId);
      break;
    }
    case 'categories':
      exact(
        command.ids,
        revision.categories.map(c => c.id),
      );
      revision.categories = command.ids.map(category);
      break;
    case 'move': {
      category(command.categoryId);
      if (!revision.meta[command.id]) throw Error('人物不存在');
      const ids = members(command.categoryId).filter(id => id !== command.id);
      ids.splice(Math.max(0, Math.min(command.index ?? ids.length, ids.length)), 0, command.id);
      revision.meta[command.id].categoryId = command.categoryId;
      order(ids);
      break;
    }
    case 'order': {
      category(command.categoryId);
      const all = members(command.categoryId);
      // A tier/search filter may submit a subset. Preserve hidden members' relative positions.
      if (new Set(command.ids).size !== command.ids.length || command.ids.some(id => !all.includes(id)))
        throw Error('排序成员已变化');
      const selected = new Set(command.ids);
      let index = 0;
      order(all.map(id => (selected.has(id) ? command.ids[index++] : id)));
      break;
    }
    case 'enabled': {
      const ids = [...new Set(command.ids)];
      if (command.categoryId) category(command.categoryId);
      for (const id of ids) {
        if (!revision.meta[id] || (command.categoryId && revision.meta[id].categoryId !== command.categoryId))
          throw Error('批量操作成员已变化：' + id);
        results.push({ id, enabled: command.enabled, changed: !!state.角色[id] !== command.enabled });
      }
      if (revision.automatic) {
        const manualOff = new Set(revision.automatic.manualOff);
        for (const id of ids) command.enabled ? manualOff.delete(id) : manualOff.add(id);
        revision.automatic.manualOff = [...manualOff];
        revision.automatic.anchor = null;
      }
      invalidateTasks(state, new Set(results.filter(r => r.changed).map(r => r.id)));
      for (const id of ids) (command.enabled ? enable : disable)(state, library, revision, id);
      break;
    }
  }
  const revisionId = uid('library');
  library.revisions[revisionId] = Revision.parse(revision);
  state._系统.角色库版本 = revisionId;
  return { state: Schema.parse(state), library, created, results };
}

/** Automatic activity changes share the existing snapshot/restore path and one immutable revision. */
export function prepareAutomaticLibrary(
  before: State, library: CharacterLibrary, revision: LibraryRevision,
  selected: ReadonlySet<string>, automatic: AutomaticRoster,
) {
  const state = copy(before);
  state._系统.存档id ??= uid('save');
  const leaving = Object.keys(state.角色).filter(id => !selected.has(id));
  if (leaving.length) invalidateTasks(state, new Set(leaving));
  for (const id of leaving) disable(state, library, revision, id);
  for (const id of selected) if (!state.角色[id]) enable(state, library, revision, id, true);
  revision.automatic = automatic;
  const revisionId = uid('library');
  library.revisions[revisionId] = revision;
  state._系统.角色库版本 = revisionId;
  return { state, library, revision };
}
