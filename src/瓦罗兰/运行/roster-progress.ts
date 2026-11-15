import { equal, type State } from './core';
import { publicModelFields } from './model-fields';

export function rosterProgress(before: State, candidate: State, ids: string[]) {
  const changed = new Set<string>();
  if (equal(before, candidate)) return { changed, anyPublicChange: false };
  const prior: State = publicModelFields(before);
  const next: State = publicModelFields(candidate);
  const scene = (s: State, id: string) =>
    s.世界.当前场景.在场人物.includes(id) ? [s.世界.当前场景.场景id] : [];
  for (const id of ids) {
    if (!equal(prior.角色[id], next.角色[id]) || !equal(scene(prior, id), scene(next, id))) changed.add(id);
  }
  for (const group of ['事件', '约定'] as const) {
    for (const key of new Set([...Object.keys(prior[group]), ...Object.keys(next[group])])) {
      const from = prior[group][key];
      const to = next[group][key];
      if (equal(from, to)) continue;
      const sharedChanged = !equal(_.omit(from, '参与者', '各人可知来源'), _.omit(to, '参与者', '各人可知来源'));
      for (const id of ids) {
        const oldMember = !!from && Object.hasOwn(from.参与者, id);
        const newMember = !!to && Object.hasOwn(to.参与者, id);
        if ((oldMember || newMember) && (oldMember !== newMember || sharedChanged || !equal(from?.参与者[id], to?.参与者[id])))
          changed.add(id);
        if (group === '事件' && !equal(prior.事件[key]?.各人可知来源[id], next.事件[key]?.各人可知来源[id])) changed.add(id);
      }
    }
  }
  for (const group of ['地点', '组织'] as const) {
    for (const key of new Set([...Object.keys(prior[group]), ...Object.keys(next[group])])) {
      const oldMembers = group === '地点' ? prior.地点[key]?.关联人物 : prior.组织[key]?.已知成员;
      const newMembers = group === '地点' ? next.地点[key]?.关联人物 : next.组织[key]?.已知成员;
      if (equal(oldMembers, newMembers)) continue;
      for (const id of ids) {
        if (!equal(oldMembers?.[id], newMembers?.[id])) changed.add(id);
      }
    }
  }
  // 同一活动可以只记在共同事件、地点或手机原文，不要求在人物档案重复一份。
  const originals = { 消息: '发送账号id', 帖子: '发布账号id', 评论: '评论账号id', 点赞: '账号id', 转发: '账号id' } as const;
  for (const group of Object.keys(originals) as (keyof typeof originals)[]) {
    const from = prior.手机.原文[group];
    const to = next.手机.原文[group];
    for (const key of new Set([...Object.keys(from), ...Object.keys(to)])) {
      if (equal(from[key], to[key])) continue;
      const account = _.get(to[key] ?? from[key], originals[group]);
      const author = account && (next.手机.账号[account] ?? prior.手机.账号[account])?.人物id;
      if (author) changed.add(author);
    }
  }
  return { changed, anyPublicChange: !equal(prior, next) };
}
