import { copy, equal, type State } from './core';

type StoryTime = State['世界']['当前时间'];
const worldAnchorPaths = [
  ['世界', '当前场景', '_上次更新场景时间'],
  ['世界', '天气', '_上次检查时间'],
] as const;
const record = (value: unknown): value is Record<string, any> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const pointerParts = (path: unknown): string[] | null =>
  typeof path !== 'string' ? null : path === '' ? [] : path.startsWith('/')
    ? path.slice(1).split('/').map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    : null;
const startsWithPath = (path: readonly string[], prefix: readonly string[]) =>
  prefix.length <= path.length && prefix.every((part, index) => part === path[index]);

/** Restore exactly these two script anchors, leaving other private fields visible to validateModel. */
function restoreAnchorValues(before: State, target: unknown, prefix: readonly string[] = []) {
  if (!record(target)) return;
  for (const anchor of worldAnchorPaths) {
    if (!startsWithPath(anchor, prefix) || anchor.length === prefix.length) continue;
    const relative = anchor.slice(prefix.length);
    let parent: Record<string, any> | null = target;
    for (const key of relative.slice(0, -1)) {
      if (!Object.hasOwn(parent, key)) parent[key] = {};
      // Do not conceal malformed business objects by replacing primitives, nulls or arrays.
      if (!record(parent[key])) {
        parent = null;
        break;
      }
      parent = parent[key];
    }
    if (parent) parent[relative.at(-1)!] = copy(anchor[1] === '当前场景'
      ? before.世界.当前场景._上次更新场景时间
      : before.世界.天气._上次检查时间);
  }
}

/** Normalize the commands actually sent to MVU, before its schema validation can reject bad anchor values. */
export function normalizeWorldAnchorPatches(before: State, commands: readonly any[]): any[] {
  return commands.flatMap(command => {
    if (!record(command)) return [command];
    const parts = pointerParts(command.path);
    // A move may also delete a different field: never swallow that operation or hide its source change.
    const localWrite = !Object.hasOwn(command, 'from') &&
      ['add', 'replace', 'insert', 'remove', 'delta'].includes(command.op);
    if (parts && localWrite && worldAnchorPaths.some(anchor => startsWithPath(parts, anchor))) return [];
    const normalized = copy(command);
    if (parts && localWrite && ['add', 'replace', 'insert'].includes(command.op))
      restoreAnchorValues(before, normalized.value, parts);
    return [normalized];
  });
}

/** Call on MVU's raw candidate before validateModel; never persist the model's anchor values. */
export function restoreWorldAnchors<T>(before: State, raw: T): T {
  if (!record(raw)) return raw;
  const result = copy(raw);
  restoreAnchorValues(before, result);
  return result;
}

const day = (time: StoryTime) => time && `${time.年}-${time.月}-${time.日}`;
export function elapsedMinutes(start: StoryTime, end: StoryTime): number | null {
  if (!start || !end) return null;
  const minute = (time: NonNullable<StoryTime>) => {
    const date = new Date(0);
    date.setUTCFullYear(time.年, time.月 - 1, time.日);
    date.setUTCHours(time.时, time.分, 0, 0);
    return date.getTime() / 60000;
  };
  return minute(end) - minute(start);
}
const weatherFacts = (state: State) => {
  const { _上次检查时间, 生效时间, ...facts } = state.世界.天气;
  return facts;
};
export function weatherCheckDue(state: State, end = state.世界.当前时间) {
  const anchor = state.世界.天气._上次检查时间;
  return (
    !!end &&
    (!anchor || !state.世界.天气.天气状况 || day(anchor) !== day(end) || (elapsedMinutes(anchor, end) ?? 0) >= 180)
  );
}

/** One successful model update acknowledges the requested weather check; no timer or extra model request. */
export function finalizeWorld(before: State, candidate: State): State {
  restoreAnchorValues(before, candidate);
  const time = candidate.世界.当前时间;
  const changed = !equal(weatherFacts(before), weatherFacts(candidate));
  if (changed && equal(before.世界.天气.生效时间, candidate.世界.天气.生效时间))
    candidate.世界.天气.生效时间 = copy(time);
  if (!changed) candidate.世界.天气.生效时间 = copy(before.世界.天气.生效时间);
  if (weatherCheckDue(before, time) || changed) candidate.世界.天气._上次检查时间 = copy(time);
  const scene = (state: State) => {
    const { _上次更新场景时间, ...facts } = state.世界.当前场景;
    return { ...facts, 地点id: state.玩家.当前状态.当前地点id };
  };
  if (!equal(scene(before), scene(candidate))) candidate.世界.当前场景._上次更新场景时间 = copy(time);
  return candidate;
}

export function worldUpdatePrompt(state: State) {
  return `世界动态检查：开局或首次涉及场景时，允许合理生成天气及相关世界未知信息；保留已确定的事实，不把未知一律补零。当前天气检查锚点：${JSON.stringify(state.世界.天气._上次检查时间)}；请求起点是否应检查：${weatherCheckDue(state) ? '是' : '否'}。即使起点未到期，本轮结束跨日、距锚点满180分钟或正文明确天气变化时也要检查。检查允许天气不变；成功提交后程序维护检查时间，不得输出下划线字段。未知日期不推算季节或经过时长，不补故事时钟。按常驻异常入侵阶段接续已有威胁、调查、处置与恢复，整体值不变也要结算本轮实际发生的局部影响，依据变量规则写入相应业务字段；手机内容须有实际发布与可见渠道。世界详情只在本轮需要时补全，不预生成全城事件；玩家资料、资产、历史与知情仍按原有边界。`;
}
