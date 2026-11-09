import { Schema } from '../schema';
import { copy, equal, uid, type State } from './core';
import {
  AutomaticRosterSchema, LibrarySchema, libraryRevision, prepareAutomaticLibrary,
  type AutomaticRoster,
} from './character-library';
import { elapsedMinutes } from './world';
import type { PhoneAction } from './phone';
import { CharacterRosterSettingsSchema, type CharacterRosterSettings } from './settings';
import { planOpeningCharacters } from './opening';
import { characterLifeWork, coversCharacterLifeWork } from './tasks';

const tiers = ['主要', '次要'] as const;
export const rosterLimits = { 主要: 6, 次要: 3 } as const;
const activeTask = (status: string) => ['排队', '生成中', '待校验', '待提交', '失败'].includes(status);

function anchor(state: State, options: CharacterRosterSettings) {
  const time = state.世界.当前时间;
  const period = time ? `${time.年}-${time.月}-${time.日}:${Math.floor((time.时 * 60 + time.分) / 180)}` : 'unknown';
  return JSON.stringify([
    state.世界.当前场景.场景id, state.玩家.当前状态.当前地点id, period,
    Object.keys(state._系统.已计轮事件).length, options,
  ]);
}

function phoneTargets(state: State, action?: PhoneAction) {
  if (!action) return [];
  const accounts = action.kind === 'invite' ? action.targets ?? [] : action.kind === 'send' && action.id
    ? state.手机.会话[action.id]?.参与账号id ?? []
    : ['comment', 'like', 'repost'].includes(action.kind)
      ? [state.手机.原文.帖子[action.id ?? '']?.发布账号id,
          ...(action.kind === 'comment' && action.replyTo
            ? [state.手机.原文.评论[action.replyTo]?.评论账号id] : [])]
      : [];
  return accounts.flatMap(id => id && state.手机.账号[id]?.人物id ? [state.手机.账号[id].人物id!] : []);
}

function requiredCharacters(state: State, people: Record<string, State['角色'][string]>, input: string, action?: PhoneAction) {
  const pinned = new Set([...state.世界.当前场景.在场人物, ...phoneTargets(state, action),
    ...Object.entries(people).filter(([id, person]) => input.includes(id) || (!!person.姓名 && input.includes(person.姓名))).map(([id]) => id)]);
  for (const agreement of Object.values(state.约定)) {
    const distance = elapsedMinutes(state.世界.当前时间, agreement.时间);
    if (agreement.状态 === '已确认' && state.玩家.id && agreement.参与者[state.玩家.id]?.响应 === '接受' &&
        distance !== null && distance >= -60 && distance <= 90)
      for (const [id, participant] of Object.entries(agreement.参与者))
        if (participant.响应 === '接受') pinned.add(id);
  }
  return new Set([...pinned].filter(id => !!people[id]));
}

/** A selection directory, not complete dormant profiles or proof of current whereabouts. */
export function characterSelectionContext(state: State, raw: unknown, options: CharacterRosterSettings, input = '', action?: PhoneAction) {
  const library = LibrarySchema.parse(raw), revision = libraryRevision(state, library);
  const manualOff = new Set(revision.automatic?.manualOff ?? Object.keys(revision.disabled));
  const people = Object.fromEntries(Object.keys(revision.meta).flatMap(id => {
    const person = state.角色[id] ?? library.snapshots[revision.disabled[id]]?.pack.角色;
    return person && !manualOff.has(id) ? [[id, person as State['角色'][string]]] : [];
  }));
  const pinned = requiredCharacters(state, people, input, action);
  return {
    目录: Object.fromEntries(Object.entries(people).map(([id, person]) => [id, {
      姓名: person.姓名, 层级: person.层级, 身份: person.身份, 组织id: person.组织id,
      已开启: !!state.角色[id], 已记录地点id: person.当前地点id,
      生活地点: { 住处: person.生活.住处id, 工作: person.生活.工作地点id, 常去: person.生活.常去地点id },
      与玩家关系: state.玩家.id ? person.关系网[state.玩家.id]?.关系 ?? null : null,
    }])),
    保留人物id: [...pinned].filter(id => !!people[id]),
    初始相识id: revision.automatic?.opening?.requestedIds ?? [],
    配额: { 主要: options.majorLimit, 次要: options.minorLimit },
    轮换名额: { 主要: options.majorRotation, 次要: options.minorRotation },
    开局: !Object.keys(state._系统.已计轮事件).length,
    轮候人物id: Object.fromEntries(tiers.map(tier => [tier,
      (revision.automatic?.queues[tier] ?? Object.keys(people)).filter(id => people[id]?.层级 === tier && !state.角色[id]),
    ])),
  };
}
export type CharacterSelectionContext = ReturnType<typeof characterSelectionContext>;

function selectedCandidates(ids: readonly string[], eligible: readonly string[]) {
  const allowed = new Set(eligible);
  if (ids.some(id => !allowed.has(id))) throw Error('人物选择包含未入库或手动关闭的人物，原名单保留');
  return new Map([...new Set(ids)].map((id, index) => [id, index]));
}

function queueCheck(state: State, id: string, lastKnownTime?: State['世界']['当前时间']) {
  const work = characterLifeWork(state, id) ?? '生活更新';
  const existing = Object.entries(state._系统.任务).find(([, task]) =>
    activeTask(task.状态) && coversCharacterLifeWork(state, task, id, work));
  if (existing) {
    // Retry a roster check on the next authorized interaction, never in an API loop.
    if (existing[1].状态 === '失败' && existing[1].触发来源 === '自动角色调度：当前生活检查') {
      existing[1].状态 = '排队';
      existing[1].错误 = null;
      existing[1].重试次数++;
    }
    return existing[0];
  }
  const person = state.角色[id], loop = person.层级 === '主要' ? person._更新循环 : null;
  const taskId = uid('roster_check');
  state._系统.任务[taskId] = Schema.parse({ _系统: { 任务: { [taskId]: {
    类别: work, 触发来源: '自动角色调度：当前生活检查', 目标id: [id],
    目标版本: { [id]: person._管理.版本 }, 存档id: state._系统.存档id,
    分支id: state._系统.分支id, 楼层id: state._系统.楼层id,
    输入数据版本: state._系统.数据版本, 计数截止点: { [id]: loop?.当前计数 ?? 0 },
    起始时间: copy(lastKnownTime ?? loop?.上次更新变量时间 ?? state.世界.当前时间), 截止时间: copy(state.世界.当前时间),
    提交id: uid('roster_check_commit'), 状态: '排队',
  } } } })._系统.任务[taskId];
  if (loop) loop.待处理任务id = taskId;
  return taskId;
}

/** 首轮按推荐名单准备人物；未启用模型选择时沿用相识、地理和队列补位。未选档案进入既有快照。 */
export function prepareOpeningCharacterRoster(
  before: State, raw: unknown, optionsInput?: CharacterRosterSettings, requestedIds?: readonly string[], preferredIds?: readonly string[], requiredIds: readonly string[] = [],
) {
  if (!before._系统.建档完成 || Object.keys(before._系统.已计轮事件).length) return null;
  const library = LibrarySchema.parse(raw), revision = libraryRevision(before, library);
  if (revision.automatic?.opening && preferredIds === undefined) return null;
  const options = CharacterRosterSettingsSchema.parse(optionsInput ?? {});
  const limits = { 主要: options.majorLimit, 次要: options.minorLimit };
  const automatic = revision.automatic ? copy(revision.automatic)
    : AutomaticRosterSchema.parse({ manualOff: Object.keys(revision.disabled) });
  const people = Object.fromEntries(Object.keys(revision.meta).flatMap(id => {
    const person = before.角色[id] ?? library.snapshots[revision.disabled[id]]?.pack.角色;
    return person ? [[id, person as State['角色'][string]]] : [];
  }));
  const eligible = Object.keys(people).filter(id => !automatic.manualOff.includes(id));
  const preferred = preferredIds === undefined ? null : selectedCandidates(preferredIds, eligible);
  // 旧版已建档但尚未发送的开局没有表单编辑标记，沿用已明确保存的玩家关系。
  const legacyConnections = requestedIds === undefined && before.玩家.id
    ? eligible.filter(id => {
      const relation = people[id].关系网[before.玩家.id!];
      return Boolean(relation?.关系 || relation?.关系备注);
    }) : [];
  const connections = new Set((requestedIds ?? automatic.opening?.requestedIds ?? legacyConnections).filter(id => eligible.includes(id)));
  // 相识关系保存在档案中；只有真实在场依据需要突破本次资料配额。
  const pinned = new Set([...before.世界.当前场景.在场人物, ...requiredIds].filter(id => eligible.includes(id)));
  const location = before.玩家.当前状态.当前地点id;
  const district = location && before.地点[location]?.片区id;
  const placeFamily = (id: string | null) => {
    const chain = new Set<string>();
    while (id && !chain.has(id)) { chain.add(id); id = before.地点[id]?.上级地点id ?? null; }
    return chain;
  };
  const startFamily = placeFamily(location);
  const sameBuilding = (id: string | null) => id && [...placeFamily(id)].some(parent => startFamily.has(parent));
  const score = (id: string) => {
    if (!location) return 0;
    const person = people[id];
    const places = [person.当前地点id, person.生活.住处id, ...person.生活.工作地点id, ...person.生活.常去地点id];
    if (person.当前地点id === location) return 100;
    if (places.includes(location)) return 80;
    if (places.some(sameBuilding)) return 60;
    return district && places.some(place => place && before.地点[place]?.片区id === district) ? 40 : 0;
  };
  const selected = new Set<string>();
  for (const tier of tiers) {
    const members = eligible.filter(id => people[id].层级 === tier);
    const queue = [...new Set([...automatic.queues[tier].filter(id => members.includes(id)), ...members])];
    const mustKeep = queue.filter(id => pinned.has(id));
    const candidates = queue.filter(id => !pinned.has(id) && (!preferred || preferred.has(id)))
      .sort((a, b) => preferred ? preferred.get(a)! - preferred.get(b)!
        : Number(connections.has(b)) - Number(connections.has(a)) || score(b) - score(a))
      .slice(0, Math.max(0, limits[tier] - mustKeep.length));
    for (const id of [...mustKeep, ...candidates]) selected.add(id);
    automatic.queues[tier] = [...queue.filter(id => !selected.has(id)), ...queue.filter(id => selected.has(id))];
  }
  automatic.rotation = {};
  automatic.checks = {};
  automatic.anchor = anchor(before, options);
  automatic.opening = { requestedIds: [...new Set([...connections, ...pinned])], selectedIds: [...selected] };
  const prepared = prepareAutomaticLibrary(before, library, revision, selected, automatic);
  if (preferred) {
    // Selection happens before opening generation; replace the unexecuted batch's targets.
    for (const [taskId, task] of Object.entries(prepared.state._系统.任务)) {
      if (task.类别 !== '建档' || !['排队', '失败'].includes(task.状态)) continue;
      task.状态 = '失效';
      task.错误 = '开局人物已按本轮资料选择重新准备';
      for (const person of Object.values(prepared.state.角色))
        if (person.层级 === '主要' && person._更新循环.待处理任务id === taskId) person._更新循环.待处理任务id = null;
    }
  }
  prepared.state = planOpeningCharacters(prepared.state, [...selected], true);
  const opening = Object.entries(prepared.state._系统.任务).find(([, task]) =>
    task.类别 === '建档' && activeTask(task.状态));
  if (opening) for (const id of selected) automatic.checks[id] = opening[0];
  return prepared;
}

/** Apply the recommended roster, or use local scheduling when no recommendation is supplied. Full dormant profiles stay in snapshots. */
export function prepareCharacterRoster(before: State, raw: unknown, input = '', action?: PhoneAction, optionsInput?: CharacterRosterSettings, preferredIds?: readonly string[]) {
  // Complete the existing atomic opening before the regular-play roster starts.
  if (Object.values(before._系统.任务).some(task => task.类别 === '建档' && activeTask(task.状态))) return null;
  const options = CharacterRosterSettingsSchema.parse(optionsInput ?? {});
  const limits = { 主要: options.majorLimit, 次要: options.minorLimit };
  const rotationSeats = { 主要: options.majorRotation, 次要: options.minorRotation };
  const library = LibrarySchema.parse(raw), revision = libraryRevision(before, library);
  const previous = revision.automatic;
  // Existing disabled profiles represent explicit manual choices, not automatic dormancy.
  const automatic: AutomaticRoster = previous ? copy(previous) : AutomaticRosterSchema.parse({ manualOff: Object.keys(revision.disabled) });
  const people = Object.fromEntries(Object.keys(revision.meta).flatMap(id => {
    const person = before.角色[id] ?? library.snapshots[revision.disabled[id]]?.pack.角色;
    return person ? [[id, person as State['角色'][string]]] : [];
  }));
  const manualOff = new Set(automatic.manualOff.filter(id => people[id]));
  automatic.manualOff = [...manualOff];
  for (const tier of tiers) {
    const eligible = Object.keys(people).filter(id => people[id].层级 === tier && !manualOff.has(id));
    automatic.queues[tier] = [...new Set([...automatic.queues[tier].filter(id => eligible.includes(id)), ...eligible])];
  }
  const eligible = new Set(tiers.flatMap(tier => automatic.queues[tier]));
  const preferred = preferredIds === undefined ? null : selectedCandidates(preferredIds, [...eligible]);
  const pinned = requiredCharacters(before, Object.fromEntries(Object.entries(people).filter(([id]) => eligible.has(id))), input, action);
  const playerId = before.玩家.id;
  const location = before.玩家.当前状态.当前地点id;
  const district = location && before.地点[location]?.片区id;
  const score = (id: string) => {
    const person = people[id];
    const places = [person.生活.住处id, ...person.生活.工作地点id, ...person.生活.常去地点id];
    // Dormant current location is only an old record, never proof of present whereabouts.
    const samePlace = location && places.includes(location);
    const sameDistrict = district && places.some(place => place && before.地点[place]?.片区id === district);
    const current = before.角色[id] && location && person.当前地点id === location;
    const relation = playerId && person.关系网[playerId];
    return (current ? 100 : samePlace ? 80 : sameDistrict ? 40 : 0) +
      (relation ? Math.max(0, relation.好感度 ?? 0) / 20 : 0);
  };
  const nextAnchor = anchor(before, options), changedPeriod = automatic.anchor !== nextAnchor;
  // 首次入队可参考地理/关系；其后沿同一队列轮候，避免高分人物永久占优先席。
  if (!previous?.queues.主要.length)
    automatic.queues.主要.sort((a, b) => score(b) - score(a) || revision.meta[a].order - revision.meta[b].order);
  for (const [id, taskId] of Object.entries(automatic.rotation)) {
    const task = before._系统.任务[taskId], tier = people[id]?.层级;
    if (task?.状态 !== '已提交' || !coversCharacterLifeWork(before, task, id)) continue;
    if (tier === '主要' && (!changedPeriod || !rotationSeats.主要 || pinned.has(id))) continue;
    if (tier && automatic.queues[tier].includes(id))
      automatic.queues[tier] = [...automatic.queues[tier].filter(target => target !== id), id];
  }
  const selected = new Set<string>(), rotation: string[] = [];
  for (const tier of tiers) {
    const queue = automatic.queues[tier], mustKeep = queue.filter(id => pinned.has(id));
    // Finish pending rotation checks across a period change; success is the fairness boundary.
    const pendingRotation = Object.entries(automatic.rotation).filter(([id, taskId]) =>
      queue.includes(id) && !pinned.has(id) && !(before._系统.任务[taskId]?.状态 === '已提交' &&
        coversCharacterLifeWork(before, before._系统.任务[taskId], id))).map(([id]) => id);
    const available = Math.max(0, limits[tier] - mustKeep.length);
    const reserved = Math.min(rotationSeats[tier], available);
    if (preferred) {
      const candidates = queue.filter(id => !pinned.has(id) && preferred.has(id))
        .sort((a, b) => preferred.get(a)! - preferred.get(b)!).slice(0, available);
      for (const id of [...mustKeep, ...candidates]) selected.add(id);
      rotation.push(...candidates.filter(id => !before.角色[id]).slice(0, reserved));
      continue;
    }
    if (tier === '主要' && reserved > 0) {
      const members = queue.filter(id => !pinned.has(id)).slice(0, available);
      for (const id of [...mustKeep, ...members]) selected.add(id);
      // 轮换席记录本轮完成检查后可让位的队首；成功且进入下一调度周期才移到队尾。
      rotation.push(...members.slice(0, reserved));
      continue;
    }
    const retainedRotation = changedPeriod ? pendingRotation : Object.keys(automatic.rotation);
    const priority = queue.filter(id => !pinned.has(id) && !retainedRotation.includes(id))
      .sort((a, b) => score(b) - score(a) || Number(!!before.角色[b]) - Number(!!before.角色[a]) ||
        (revision.meta[a].order - revision.meta[b].order))
      .slice(0, Math.max(0, available - reserved));
    const base = [...mustKeep, ...priority];
    const waiting = queue.filter(id => !base.includes(id));
    const retained = changedPeriod ? pendingRotation : Object.keys(automatic.rotation).filter(id => waiting.includes(id));
    // On a completed new round, prefer dormant candidates so a rotation seat actually changes people.
    // A failed check keeps its seat; rereading or retrying the same round never rotates again.
    const candidates = changedPeriod
      ? [...waiting.filter(id => !before.角色[id]), ...waiting.filter(id => !!before.角色[id])]
      : waiting;
    const rotating = [...new Set([...retained, ...candidates])].slice(0, reserved);
    for (const id of [...base, ...rotating]) selected.add(id);
    rotation.push(...rotating);
  }
  const membershipChanged = !equal([...selected].sort(), Object.keys(before.角色).sort());
  const needsCheck = [...selected].some(id => {
    const task = before._系统.任务[automatic.checks[id]];
    return !coversCharacterLifeWork(before, task, id, before.角色[id] ? characterLifeWork(before, id) ?? '生活更新' : '生活更新') ||
      ['失败', '失效', '取消'].includes(task.状态);
  });
  if (!membershipChanged && !changedPeriod && !needsCheck && equal(automatic, previous)) return null;
  const lastKnownTimes = Object.fromEntries([...selected].filter(id => !before.角色[id]).map(id =>
    [id, library.snapshots[revision.disabled[id]]?.pack.来源.导出故事时间]));
  const prepared = prepareAutomaticLibrary(before, library, revision, selected, automatic);
  const checks: Record<string, string> = {};
  for (const id of selected) {
    const previousTask = automatic.checks[id], task = prepared.state._系统.任务[previousTask];
    checks[id] = (!changedPeriod || !rotation.includes(id)) && task?.状态 === '已提交' && before.角色[id] &&
      coversCharacterLifeWork(prepared.state, task, id, characterLifeWork(prepared.state, id) ?? '生活更新')
      ? previousTask : queueCheck(prepared.state, id, lastKnownTimes[id]);
  }
  automatic.checks = checks;
  automatic.rotation = Object.fromEntries(rotation.map(id => [id, checks[id]]));
  automatic.anchor = nextAnchor;
  prepared.revision.automatic = AutomaticRosterSchema.parse(automatic);
  prepared.state = Schema.parse(prepared.state);
  return prepared;
}
