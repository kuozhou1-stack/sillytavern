import type { State } from './core';
import { projectWorldInformation, informationPromptRule } from './knowledge-context';
import { modelPhoneHistory, publicModelData, type HistoryScope } from './model-history';
import { appendSystemPrompts, restorePromptSlot } from './worker-task';

export function disabledAccount(state: State, accountId: string | null | undefined) {
  const person = accountId && state.手机.账号[accountId]?.人物id;
  return !!(person && state._系统.角色停用标识[person]);
}

/** Validate public model changes, including side channels through phone accounts and events. */
export function assertDisabledUnchanged(before: State, after: State) {
  const disabled = before._系统.角色停用标识;
  const ids = Object.keys(disabled);
  if (!ids.length) return;
  const names = new Set(
    Object.values(disabled)
      .map(p => p.姓名?.trim())
      .filter(Boolean),
  );
  if (after.世界.当前场景.在场人物.some(id => ids.includes(id))) throw Error('当前活动场景不能重新加入停用人物');
  for (const [id, person] of Object.entries(after.角色 ?? {})) {
    if (disabled[id] || (!before.角色[id] && person.姓名 && names.has(person.姓名.trim())))
      throw Error('已关闭角色不能由模型重建或改用新 ID：' + id);
  }
  for (const id of new Set([...Object.keys(before.手机.账号), ...Object.keys(after.手机.账号)])) {
    if (disabledAccount(after, id) || disabledAccount(before, id))
      if (!_.isEqual(before.手机.账号[id], after.手机.账号[id])) throw Error('停用账号不能新增、删除或更新资料：' + id);
  }
  const authors = { 消息: '发送账号id', 帖子: '发布账号id', 评论: '评论账号id', 点赞: '账号id', 转发: '账号id' };
  for (const [root, field] of Object.entries(authors)) {
    const old = (before.手机.原文 as any)[root],
      next = (after.手机.原文 as any)[root];
    for (const id of new Set([...Object.keys(old), ...Object.keys(next)]))
      if (
        disabledAccount(before, old[id]?.[field]) ||
        disabledAccount(before, next[id]?.[field]) ||
        disabledAccount(after, next[id]?.[field])
      )
        if (!_.isEqual(old[id], next[id])) throw Error('停用角色不能产生新手机活动或改写已交付历史：' + id);
  }
  for (const [id, application] of Object.entries(after.手机.申请))
    if (disabledAccount(before, application.发起账号id) || disabledAccount(before, application.目标账号id))
      if (!_.isEqual(before.手机.申请[id], application)) throw Error('停用角色不能处理好友申请');
  // Existing shared commitments remain facts, not automatically failed/cancelled by absence.
  for (const [id, agreement] of Object.entries(before.约定))
    if (ids.some(target => Object.hasOwn(agreement.参与者, target)) && !_.isEqual(agreement, after.约定[id]))
      throw Error('涉及停用角色的约定须保留原事实，开启后再衔接：' + id);
  const containsIdentity = (value: unknown): boolean => {
    if (typeof value === 'string') return ids.includes(value);
    if (!value || typeof value !== 'object') return false;
    return Object.entries(value).some(([key, child]) => ids.includes(key) || containsIdentity(child));
  };
  for (const root of ['事件', '约定'] as const)
    for (const [id, record] of Object.entries(after[root]))
      if (!before[root][id] && containsIdentity(record)) throw Error('不能为停用角色生成新事件或约定：' + id);
  for (const [id, person] of Object.entries(before.角色))
    for (const target of ids)
      if (!_.isEqual(person.关系网[target], after.角色[id]?.关系网[target]))
        throw Error('关闭角色不清除他人既有关系：' + id);
}

export function taskHasActiveTargets(state: State, task: State['_系统']['任务'][string]) {
  return task.目标id.every(id => !!state.角色[id] && !state._系统.角色停用标识[id]);
}

export function disabledIdentityPrompt(state: State, context?: readonly { content?: unknown }[]) {
  const closed = Object.entries(state._系统.角色停用标识).map(([id, person]) => ({ id, 姓名: person.姓名 }));
  if (!closed.length) return '';
  const texts = context?.flatMap(({ content }) => typeof content === 'string' ? [content] :
    Array.isArray(content) ? content.flatMap(part => typeof part?.text === 'string' ? [part.text] : []) : []);
  const ids = texts ? closed.filter(person => texts.some(content =>
    content.includes(person.id) || (!!person.姓名 && content.includes(person.姓名)),
  )) : closed;
  const scope = context ? '本清单仅列本次资料中提及的关闭身份，省略不改变其他人物的关闭状态。' : '';
  return `玩家暂时关闭的人物（只供历史身份识别）：${JSON.stringify(ids)}。${scope}禁止其主动出场、手机发言、生活更新、升格、自然融入，禁止同名换ID重建。关闭不是死亡、搬家、失忆或删除历史；旧正文与他人的关系、认知和历史提及保留。未完成约定维持原事实，不因关闭判定履行、失约或取消。`;
}

/** A prompt projection, never persisted back to MVU. Only public active data and historical records. */
export function modelState(state: State, scope?: HistoryScope) {
  const result = publicModelData({ ...state, 手机: { ...state.手机, ...modelPhoneHistory(state, scope) } });
  const system = state.奇遇系统;
  // The model needs current acceptance and currency, never event baselines or transaction history.
  result.奇遇系统._启用 = system._启用;
  result.奇遇系统._系统币 = system._系统币;
  result.奇遇系统._任务记录 = Object.fromEntries(Object.entries(system._任务记录)
    .filter(([, r]) => r.状态 === '进行中').map(([id, r]) => [id, { 状态: r.状态 }]));
  for (const id of Object.keys(result.奇遇系统.任务)) {
    const record = system._任务记录[id], day = system._刷新日期;
    if ((record && record.状态 !== '进行中') || (!record && day && system.任务[id].有效日 && system.任务[id].有效日 !== day))
      delete result.奇遇系统.任务[id];
  }
  for (const id of Object.keys(state._系统.角色停用标识)) delete result.角色[id];
  result.世界.当前场景.在场人物 = result.世界.当前场景.在场人物.filter((id: string) => !state._系统.角色停用标识[id]);
  for (const [id, account] of Object.entries(result.手机.账号) as [string, any][])
    if (disabledAccount(state, id)) {
      account.头像资源 = null;
      account.简介 = null;
      account.公开资料 = {};
    }
  return projectWorldInformation(state, result);
}

/** Scoped to a request marker by the caller. Preserve the status protocol, replace only automatic state. */
export function finalizeCharacterContext(
  messages: { role: string; content?: unknown }[],
  state: State,
  worker: boolean,
  options: { contextSlot?: string; constraints?: boolean } = {},
) {
  let found = false;
  for (const message of messages) {
    if (typeof message.content !== 'string') continue;
    message.content = message.content.replace(/<status_current_variable>[\s\S]*?<\/status_current_variable>/gi, () => {
      if (worker || found) return '';
      found = true;
      return `<status_current_variable>\n${JSON.stringify(modelState(state))}\n</status_current_variable>`;
    });
  }
  if (!worker && !found) {
    const prompt = {
      role: 'system',
      content: `<status_current_variable>\n${JSON.stringify(modelState(state))}\n</status_current_variable>`,
    };
    if (options.contextSlot) restorePromptSlot(messages, options.contextSlot, [prompt]);
    else messages.push(prompt);
  }
  if (options.constraints === false) return;
  if (!messages.some(message => message.role === 'system' && message.content === informationPromptRule))
    appendSystemPrompts(messages, [{ content: informationPromptRule }]);
  const constraint = disabledIdentityPrompt(state);
  if (constraint && !messages.some(message => message.role === 'system' &&
    typeof message.content === 'string' && message.content.includes(constraint)))
    appendSystemPrompts(messages, [{ content: constraint }]);
}
