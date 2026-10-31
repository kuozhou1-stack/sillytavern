import type { State } from './core';
import { isPrivateModelPath, publicModelFields } from './model-fields';

export type HistoryScope = { session?: string; post?: string; platform?: string };

/** Request-local public projection, never serialized into settings, saves or API options. */
export const promptProjections = new WeakMap<GenerateConfig, Record<string, any>>();
export const promptContextPrompts = new WeakMap<GenerateConfig, NonNullable<GenerateConfig['injects']>>();

/** Keep native context separate from the extra instructions appended after the preset. */
export function withPromptInstructions(config: GenerateConfig, prompts: NonNullable<GenerateConfig['injects']>): GenerateConfig {
  const result = { ...config, injects: [...(config.injects ?? []), ...prompts] };
  const projection = promptProjections.get(config);
  if (projection) promptProjections.set(result, projection);
  const context = promptContextPrompts.get(config);
  if (context) promptContextPrompts.set(result, context);
  return result;
}

/** Select context only. Originals, delivery snapshots and summary indexes remain in the save. */
export function modelPhoneHistory(state: State, scope?: HistoryScope) {
  const phone = state.手机, raw = phone.原文;
  const selected = new Set<string>();
  const summaries = new Set<string>();
  const covered = new Set<string>();
  const windows = [...Object.values(phone.会话).map(c => c._窗口), ...Object.values(phone._动态流)];
  const validSummary = (id: string) => !!phone.摘要[id]?.内容?.trim();
  const superseded = new Set(Object.values(phone.摘要).filter(s => s.内容?.trim()).flatMap(s => s.覆盖记录id));
  // Legacy unindexed summaries still supply history; keep roots and current window summaries.
  for (const id of Object.keys(phone.摘要)) if (validSummary(id) && !superseded.has(id)) summaries.add(id);
  for (const window of windows) {
    window._近期id.forEach(id => selected.add(id));
    [...window._细摘要id, ...window._阶段概述id].forEach(id => { if (validSummary(id)) summaries.add(id); });
  }
  const cover = (id: string) => {
    if (covered.has(id)) return;
    covered.add(id);
    if (validSummary(id)) phone.摘要[id].覆盖记录id.forEach(cover);
  };
  for (const id of summaries) phone.摘要[id].覆盖记录id.forEach(cover);
  for (const root of ['消息', '帖子', '评论'] as const)
    for (const id of Object.keys(raw[root])) if (!covered.has(id)) selected.add(id);
  if (scope?.post) selected.add(scope.post);
  // Explicitly retain source records for pending archives and public cross-domain references.
  for (const task of Object.values(state._系统.任务))
    if (task.类别 === '摘要' && !['已提交', '取消', '失效'].includes(task.状态))
      task.覆盖记录id.forEach(id => selected.add(id));
  const references = new Set(['记录id', '关联记录id', '关联事项id', '完成依据事件id']);
  const scan = (value: any, path: string[]) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (isPrivateModelPath([...path, key])) continue;
      if (references.has(key)) {
        for (const id of Array.isArray(child) ? child : [child]) if (typeof id === 'string') selected.add(id);
      } else scan(child, [...path, key]);
    }
  };
  // Phone records are expanded below; summary coverage must not pull all archived originals back in.
  for (const [key, value] of Object.entries(state)) if (key !== '手机' && !key.startsWith('_')) scan(value, [key]);
  for (const session of Object.values(phone.会话)) session.重要事项id.forEach(id => selected.add(id));
  for (const summary of Object.values(phone.摘要)) summary.重要事项id.forEach(id => selected.add(id));
  for (const waiting of Object.values(phone._待回应))
    if (['等待', '部分回应'].includes(waiting.状态)) waiting.涉及消息id.forEach(id => selected.add(id));
  for (const notice of Object.values(phone._通知))
    if (!notice.已读) { if (notice.来源id) selected.add(notice.来源id); notice.内容id.forEach(id => selected.add(id)); }

  // Expand reply/share/repost references once per record. IDs keep their original identity.
  const queue = [...selected];
  const include = (id: string | null | undefined) => {
    if (id && !selected.has(id)) { selected.add(id); queue.push(id); }
  };
  const reposts = new Map<string, string[]>();
  for (const record of Object.values(raw.转发))
    if (record.新帖id && record.原帖id) reposts.set(record.新帖id, [...(reposts.get(record.新帖id) ?? []), record.原帖id]);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    if (phone.摘要[id]) { summaries.add(id); continue; }
    const message = raw.消息[id], post = raw.帖子[id], comment = raw.评论[id];
    if (message) include(message.回复目标消息id);
    if (comment) { include(comment.帖子id); include(comment.回复目标评论id); }
    const blocks = message?.内容块 ?? post?.内容块 ?? comment?.内容块 ?? [];
    for (const block of blocks) if (block.类型 === '分享' && block.目标类型 !== '地点') include(block.目标id);
    for (const original of reposts.get(id) ?? []) include(original);
  }
  const pick = <T>(records: Record<string, T>) => Object.fromEntries(Object.entries(records).filter(([id]) => selected.has(id)));
  const messages = pick(raw.消息), posts = pick(raw.帖子), comments = pick(raw.评论);
  // Interactions with a retained post remain available even when a legacy window lacks their IDs.
  for (const [id, comment] of Object.entries(raw.评论))
    if (!covered.has(id) && comment.帖子id && posts[comment.帖子id]) comments[id] = comment;
  return {
    原文: {
      消息: messages, 帖子: posts, 评论: comments,
      点赞: Object.fromEntries(Object.entries(raw.点赞).filter(([, r]) => r.内容id && selected.has(r.内容id))),
      转发: Object.fromEntries(Object.entries(raw.转发).filter(([, r]) => r.新帖id && selected.has(r.新帖id))),
    },
    摘要: Object.fromEntries(Object.entries(phone.摘要).filter(([id]) => summaries.has(id))),
    _待回应: Object.fromEntries(Object.entries(phone._待回应).filter(([, r]) => ['等待', '部分回应'].includes(r.状态))),
    // Suppress exact duplicates only. Changed sources and orphan deliveries retain what recipients saw.
    _接收侧记录: Object.fromEntries(Object.entries(phone._接收侧记录).filter(([, r]) => {
      if (!r.原内容id || (covered.has(r.原内容id) && !selected.has(r.原内容id))) return false;
      const source = raw.消息[r.原内容id];
      return !source || !_.isEqual(source.内容块, r.已交付内容) || source.发送者称呼 !== r.当时发送者称呼;
    })),
  };
}

/** Readonly delivery facts affect knowledge; technical caches and management records do not. */
export function publicModelData(value: any, path: readonly string[] = []): any {
  const keep = new Set(['_顺序', '_发送状态', '_已投递账号id', '_接收侧记录', '_待回应']);
  return publicModelFields(value, path, keep);
}
