import type { State } from './core';
import { storyMinute, timeText } from './phone';

/** 阅读投影，不再让模型重复维护社交交集列表。未获知的后台事件不进入玩家界面。 */
export function recentSocialEncounters(state: State, characterId: string) {
  if (!characterId) return [];
  return Object.values(state.事件)
    .filter(
      event =>
        Object.hasOwn(event.参与者, characterId) &&
        !!state.玩家.id &&
        Object.hasOwn(event.各人可知来源, state.玩家.id) &&
        Object.keys(event.参与者).some(id => id !== characterId),
    )
    .sort((a, b) => storyMinute(b.结束时间 ?? b.起始时间) - storyMinute(a.结束时间 ?? a.起始时间))
    .slice(0, 3)
    .map(event => ({
      与: Object.keys(event.参与者).find(id => id !== characterId)!,
      时间: timeText(event.结束时间 ?? event.起始时间),
      交集事项: event.事实 ?? '',
    }));
}
