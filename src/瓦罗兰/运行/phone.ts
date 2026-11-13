import { Schema } from '../schema';
import { copy, equal, uid, type State } from './core';
import { disabledAccount } from './character-activity';
import { elapsedMinutes } from './world';

/** 已发布/收到的内容不能停留在世界时钟的未来；不从浏览或 API 耗时推算时间。 */
export function validatePhoneTimeline(before: State, candidate: State) {
  if (!candidate.世界.当前时间) return;
  for (const root of ['消息', '帖子', '评论'] as const) {
    for (const [id, record] of Object.entries(candidate.手机.原文[root])) {
      if (before.手机.原文[root][id]) continue;
      if ((elapsedMinutes(candidate.世界.当前时间, record.故事时间) ?? 0) > 0)
        throw Error(`手机${root}的时间晚于世界时间，请在同一个变量更新块中同步世界.当前时间后重试；本次结果尚未保存。`);
    }
  }
}

export function phoneTimePrompt(state: State) {
  return `手机时间结算：世界时钟起点为${JSON.stringify(state.世界.当前时间)}。有已确认起点时，普通发消息、评论或转发通常1分钟，长交流2～5分钟；超过5分钟须有明确经过时间或主动等待的依据。浏览、刷新、收藏、点赞不自行推进；刷新带来的旧动态不按发布数量累加耗时。若本次互动实际经过时间，必须在同一个更新块写入世界.当前时间的完整年/月/日/时/分对象，不能只更新手机记录的故事时间；实际收到或发布的新内容时间不晚于本次结束时点，旧记录不改时间。起点未知保持未知，不采用现实日期或API耗时。同步检查实际经过时间涉及的天气、身体状态、人物生活与约定，允许没有变化。`;
}
export const timeText = (t: any) =>
  t ? `${t.年}-${t.月}-${t.日} ${String(t.时).padStart(2, '0')}:${String(t.分).padStart(2, '0')}` : '时间未知';
export const blockText = (blocks: any[]) =>
  (blocks ?? [])
    .map(
      b => b.正文 ?? b.图片描述 ?? b.转写文字 ?? b.表情内容 ?? b.画面过程描述 ?? b.显示名称 ?? b.附言 ?? `[${b.类型}]`,
    )
    .join('\n');
export function ownAccount(state: any, platform = '邻信'): string | undefined {
  return Object.entries(state.手机.账号).find(([, a]: any) => a.人物id === state.玩家.id && a.平台 === platform)?.[0];
}
/** Notifications are player-owned; classify their source before counting per-app badges. */
export function phoneNotificationPlatform(
  state: Pick<State, '手机'>,
  notice: Pick<State['手机']['_通知'][string], '来源id' | '内容id'>,
): '邻信' | '微澜' | null {
  const phone = state.手机;
  if (!phone) return null;
  const platformForPost = (id: string | null | undefined) => {
    const post = id ? phone.原文?.帖子?.[id] : undefined;
    return post ? (post.平台 === '微澜' ? '微澜' : '邻信') : null;
  };
  const sourcePlatform = platformForPost(notice.来源id);
  if (sourcePlatform) return sourcePlatform;
  if (notice.来源id && phone.会话?.[notice.来源id]) return '邻信';
  // Older notices may retain content even if the source record was removed.
  const platforms = new Set<'邻信' | '微澜'>();
  for (const id of notice.内容id ?? []) {
    const platform = platformForPost(id) ?? platformForPost(phone.原文?.评论?.[id]?.帖子id);
    if (platform) platforms.add(platform);
    if (phone.原文?.消息?.[id]) platforms.add('邻信');
  }
  return platforms.size === 1 ? [...platforms][0] : null;
}
export const storyMinute = (t: any): number => (t ? (((t.年 * 13 + t.月) * 32 + t.日) * 24 + t.时) * 60 + t.分 : -1);
function groupMemberAt(group: State['手机']['群'][string] | undefined, account: string, time: State['世界']['当前时间']) {
  return Object.values(group?.成员[account]?.成员区间 ?? {}).some(interval =>
    time
      ? (interval.加入时间 === null || storyMinute(interval.加入时间) <= storyMinute(time)) &&
        (interval.离开时间 === null || storyMinute(time) < storyMinute(interval.离开时间))
      : interval.离开时间 === null,
  );
}
export const byNewest = (a: any, b: any) =>
  storyMinute(b.故事时间) - storyMinute(a.故事时间) ||
  (b._顺序 ?? 0) - (a._顺序 ?? 0) ||
  String(b.id).localeCompare(String(a.id));
export function postActivity(state: State, id: string) {
  return [
    { id, ...state.手机.原文.帖子[id] },
    ...Object.entries(state.手机.原文.评论)
      .filter(([, c]) => c.帖子id === id)
      .map(([id, c]) => ({ id, ...c })),
  ].sort(byNewest)[0];
}
export function recipientsFor(state: State, sessionId: string, sender: string, time: any): string[] {
  const phone = state.手机,
    session = phone.会话[sessionId];
  if (!session) throw Error('会话不存在');
  if (!phone.账号[sender]) throw Error('消息发送账号不存在');
  if (!session.参与账号id.includes(sender)) throw Error('消息发送账号未列入会话参与账号');
  if (disabledAccount(state, sender)) throw Error('角色已停用，不能发送新消息');
  if (session.类型 === '群聊') {
    const group = phone.群[session.群id!];
    if (!groupMemberAt(group, sender, time)) throw Error('发送者在消息发生时不在群中');
    return session.参与账号id.filter(id => id !== sender && groupMemberAt(group, id, time) && !disabledAccount(state, id));
  }
  const recipients = session.参与账号id.filter(id => id !== sender);
  if (recipients.some(id => disabledAccount(state, id))) throw Error('对方角色已停用，历史聊天可查看；请先在角色库开启');
  return recipients;
}
/** Changing the ID of a scripted player action does not authorize sending that action twice. */
export function assertPhoneActionNotRepeated(base: State, draft: State, candidate: State) {
  const content = (blocks: any[]) => blocks.map(({ id, ...block }) => block);
  for (const root of ['消息', '帖子', '评论'] as const) {
    const signature = (value: any) => [
      root === '消息' ? value.发送账号id : root === '帖子' ? value.发布账号id : value.评论账号id,
      root === '消息' ? value.会话id : root === '帖子' ? value.平台 : value.帖子id,
      content(value.内容块),
    ];
    const actions = Object.entries(draft.手机.原文[root]).filter(([id]) => !Object.hasOwn(base.手机.原文[root], id));
    for (const [id, value] of Object.entries(candidate.手机.原文[root]))
      if (!Object.hasOwn(draft.手机.原文[root], id) && actions.some(([, action]) => equal(signature(action), signature(value))))
        throw Error('模型重复本次玩家手机操作（更换记录ID）：' + id);
  }
}
/** Derive delivery and ordering only after the model's public fields have passed validation. */
export function finalizePhone(before: State, candidate: State): State {
  validatePhoneTimeline(before, candidate);
  const s = candidate,
    phone = s.手机,
    raw = phone.原文,
    self = ownAccount(s);
  const notices = new Map<string, string[]>();
  for (const [id, message] of Object.entries(raw.消息))
    if (!before.手机.原文.消息[id]) {
      const recipients = recipientsFor(s, message.会话id!, message.发送账号id!, message.故事时间);
      message._顺序 = ++s._系统.稳定序号;
      message._已投递账号id = recipients;
      message._发送状态 = '已投递';
      const window = phone.会话[message.会话id!]._窗口;
      window._近期id = [id, ...window._近期id.filter(x => x !== id)];
      for (const target of recipients)
        phone._接收侧记录[uid('delivery')] = {
          接收账号id: target,
          原内容id: id,
          来源类型: '会话:' + message.会话id,
          投递时间: message.故事时间,
          已交付内容: message.内容块,
          当时发送者称呼: message.发送者称呼,
        };
      if (self && recipients.includes(self))
        notices.set(message.会话id!, [...(notices.get(message.会话id!) ?? []), id]);
    }
  for (const [id, post] of Object.entries(raw.帖子))
    if (!before.手机.原文.帖子[id]) {
      if (!post.发布账号id || !phone.账号[post.发布账号id]) throw Error('动态作者账号不存在');
      post._顺序 = ++s._系统.稳定序号;
      const window = phone._动态流[post.平台];
      window._近期id = [id, ...window._近期id.filter(x => x !== id)];
    }
  for (const [id, comment] of Object.entries(raw.评论))
    if (!before.手机.原文.评论[id]) {
      const post = raw.帖子[comment.帖子id!];
      if (!post) throw Error('评论引用的帖子不存在：' + comment.帖子id);
      if (!comment.评论账号id || !phone.账号[comment.评论账号id])
        throw Error('评论账号不存在：' + comment.评论账号id);
      comment._顺序 = ++s._系统.稳定序号;
      const window = phone._动态流[post.平台];
      window._近期id = [comment.帖子id!, ...window._近期id.filter(x => x !== comment.帖子id)];
      const own = ownAccount(s, post.平台 === '微澜' ? '微澜' : '邻信');
      if (
        own &&
        comment.评论账号id !== own &&
        (post.发布账号id === own || raw.评论[comment.回复目标评论id!]?.评论账号id === own)
      )
        notices.set(comment.帖子id!, [...(notices.get(comment.帖子id!) ?? []), id]);
    }
  for (const [session, ids] of notices)
    phone._通知[uid('notice')] = {
      类型: phone.会话[session] ? '新消息' : '新回复',
      来源id: session,
      内容id: ids,
      时间: s.世界.当前时间,
      已读: false,
      免打扰: Object.values(phone.联系人).some(
        c => c.本人账号id === self && c.免打扰 && phone.会话[session]?.参与账号id.includes(c.对方账号id!),
      ),
    };
  for (const window of Object.values(phone._动态流))
    window._近期id.sort((a, b) => byNewest(postActivity(s, a), postActivity(s, b)));
  return Schema.parse(s);
}
/** A summary is visible only if every covered record is visible, including nested summaries. */
export function visiblePhoneSummaries(state: State) {
  const visible = new Set<string>();
  for (const platform of ['邻信', '微澜']) {
    const p = phoneProjection(state, platform, true);
    Object.values(p.messagesMap)
      .flat()
      .forEach(m => visible.add(m.id));
    p.posts.forEach(p => {
      visible.add(p.id);
      p.comments.forEach((c: any) => visible.add(c.id));
    });
    for (const r of Object.values(state.手机._接收侧记录))
      if (r.接收账号id === p.account && r.原内容id) visible.add(r.原内容id);
  }
  const allowed = (id: string, visiting = new Set<string>()): boolean => {
    if (visible.has(id)) return true;
    const summary = state.手机.摘要[id];
    if (!summary || visiting.has(id) || !summary.覆盖记录id.length) return false;
    const next = new Set(visiting).add(id);
    return summary.覆盖记录id.every(k => allowed(k, next));
  };
  return Object.fromEntries(Object.entries(state.手机.摘要).filter(([id]) => allowed(id)));
}
export function phoneProjection(state: any, platform = '邻信', archive = false) {
  const phone = state.手机,
    account = ownAccount(state, platform);
  const accountName = (id: string) => (phone.账号[id]?.昵称 ?? phone.账号[id]?.账号名 ?? '账号资料已移除') +
    (disabledAccount(state, id) ? '（已停用）' : '');
  const raw = phone.原文;
  const messagesMap: Record<string, any[]> = {};
  const blocks = (list: any[]) =>
    list.map(b => ({
      ...b,
      type: (
        {
          文字: 'text',
          图片: 'image',
          语音: 'voice',
          表情: 'sticker',
          视频: 'video',
          位置: 'location',
          名片: 'namecard',
          分享: 'share',
        } as any
      )[b.类型],
      content: b.正文,
      desc: b.图片描述 ?? b.画面过程描述 ?? b.表情内容,
      duration: b.模拟时长秒,
      title: b.显示名称,
      name: accountName(b.账号id),
      address: b.附言,
    }));
  for (const [id, message] of Object.entries(raw.消息) as any) {
    if (!archive && !phone.会话[message.会话id]?._窗口._近期id.includes(id)) continue;
    if (!account || (message.发送账号id !== account && !message._已投递账号id.includes(account))) continue;
    (messagesMap[message.会话id] ??= []).push({
      id,
      故事时间: message.故事时间,
      _顺序: message._顺序,
      senderId: message.发送账号id === account ? 'player' : message.发送账号id,
      senderName: message.发送者称呼 ?? accountName(message.发送账号id),
      time: timeText(message.故事时间),
      blocks: message.撤回时间 ? [{ id: 'withdrawn', type: 'text', content: '消息已撤回' }] : blocks(message.内容块),
    });
  }
  // Delivered history survives removal of the source account and source message.
  for (const [id, record] of Object.entries(phone._接收侧记录) as any) {
    if (record.接收账号id !== account || raw.消息[record.原内容id] || !archive) continue;
    const chat = record.来源类型?.startsWith('会话:') ? record.来源类型.slice(3) : null;
    if (chat)
      (messagesMap[chat] ??= []).push({
        id,
        故事时间: record.投递时间,
        _顺序: 0,
        senderId: 'removed',
        senderName: record.当时发送者称呼 ?? '未知',
        time: timeText(record.投递时间),
        blocks: blocks(record.已交付内容),
      });
  }
  Object.values(messagesMap).forEach(list => list.sort(byNewest));
  const sessions = Object.entries(phone.会话)
    .filter(([id, c]: any) => account && (c.参与账号id.includes(account) || messagesMap[id]?.length))
    .map(([id, c]: any) => ({
      id,
      isGroup: c.类型 === '群聊',
      groupReadOnly: c.类型 === '群聊' && !groupMemberAt(phone.群[c.群id], account!, state.世界.当前时间),
      name: c.群id
        ? (phone.群[c.群id]?.名称 ?? '群资料未知')
        : c.参与账号id
            .filter((v: string) => v !== account)
            .map(accountName)
            .join('、'),
      lastTime: messagesMap[id]?.[0]?.time ?? '',
      lastMessage: messagesMap[id]?.[0]?.blocks.map((b: any) => b.content ?? b.desc ?? '').join(' ') ?? '暂无消息',
      unread: messagesMap[id]?.some(
        m => m.senderId !== 'player' && !(phone._阅读进度[account!]?.[id]?.已读内容id ?? []).includes(m.id),
      ),
      故事时间: messagesMap[id]?.[0]?.故事时间,
      _顺序: messagesMap[id]?.[0]?._顺序 ?? 0,
    }))
    .sort(byNewest);
  const contacts = Object.entries(phone.联系人)
    .filter(([, c]: any) => c.本人账号id === account && c.状态 === '正常')
    .map(([id, c]: any) => ({ id: c.对方账号id, recordId: id, name: c.备注 ?? accountName(c.对方账号id) }));
  const posts = Object.entries(raw.帖子)
    .filter(
      ([id, p]: any) =>
        (archive || phone._动态流[p.平台]._近期id.includes(id)) &&
        p.平台 === (platform === '邻信' ? '朋友圈' : '微澜') &&
        !p.删除时间,
    )
    .map(([id, p]: any) => {
      const likes = Object.values(raw.点赞).filter((l: any) => l.内容id === id) as any[];
      return {
        id,
        topics: p.话题,
        activity: postActivity(state, id),
        accountId: p.发布账号id,
        故事时间: p.故事时间,
        _顺序: p._顺序,
        authorName: p.发布者称呼 ?? accountName(p.发布账号id),
        handle: phone.账号[p.发布账号id]?.账号名 ?? '',
        time: timeText(p.故事时间),
        content: blockText(p.内容块),
        images: p.内容块.filter((b: any) => b.类型 === '图片').map((b: any) => b.图片描述),
        likes: platform === '邻信' ? likes.map(l => accountName(l.账号id)) : likes.length,
        isLiked: likes.some(l => l.账号id === account),
        comments: Object.entries(raw.评论)
          .filter(([, c]: any) => c.帖子id === id)
          .map(([cid, c]: any) => ({
            id: cid,
            故事时间: c.故事时间,
            _顺序: c._顺序,
            replyTo: c.回复目标评论id,
            author: c.评论者称呼 ?? accountName(c.评论账号id),
            text: blockText(c.内容块),
          }))
          .sort(byNewest),
        reposts: Object.values(raw.转发).filter((r: any) => r.原帖id === id).length,
        isFollowing: Object.values(phone.关注).some(
          (f: any) => f.关注者账号id === account && f.被关注账号id === p.发布账号id,
        ),
      };
    })
    .sort((a, b) => byNewest(a.activity, b.activity));
  return {
    account,
    sessions,
    messagesMap,
    contacts,
    posts,
    pendingApplicationsCount: Object.values(phone.申请).filter(
      (a: any) => a.目标账号id === account && a.状态 === '待处理',
    ).length,
  };
}
export type PhoneAction = {
  kind: 'send' | 'post' | 'comment' | 'like' | 'repost' | 'refresh' | 'invite';
  platform?: string;
  id?: string;
  replyTo?: string;
  text?: string;
  demand?: string;
  blocks?: any[];
  topics?: string[];
  targets?: string[];
  groupId?: string;
  groupName?: string;
};

function recordPhoneMessage(state: State, account: string, sessionId: string, content: any[], recipients: string[], id = uid('phone')) {
  const phone = state.手机, time = state.世界.当前时间;
  const name = phone.账号[account].昵称 ?? phone.账号[account].账号名;
  phone.原文.消息[id] = {
    会话id: sessionId, 发送账号id: account, 发送者称呼: name, 故事时间: time,
    _顺序: ++state._系统.稳定序号, 内容块: content, 回复目标消息id: null, _已投递账号id: recipients, _发送状态: '已投递', 撤回时间: null,
  };
  phone.会话[sessionId]._窗口._近期id.unshift(id);
  for (const target of recipients) phone._接收侧记录[uid('delivery')] = {
    接收账号id: target, 原内容id: id, 来源类型: '会话:' + sessionId,
    投递时间: time, 已交付内容: copy(content), 当时发送者称呼: name,
  };
}

/** A whole invitation batch is one candidate and one API transaction. */
function applyGroupInvitations(state: State, action: PhoneAction, account: string) {
  const phone = state.手机;
  if (action.platform && action.platform !== '邻信') throw Error('群聊邀约仅支持邻信');
  if (!Array.isArray(action.targets) || !action.targets.length || action.targets.some(id => typeof id !== 'string' || !id))
    throw Error('请至少选择一位受邀好友');
  if (!action.text?.trim()) throw Error('请填写邀约说明');
  const targets = [...new Set(action.targets)], groupName = action.groupName?.trim();
  const active = (id: string, group: State['手机']['群'][string]) => Object.values(group.成员[id]?.成员区间 ?? {}).some(interval => interval.离开时间 === null);
  const existingGroup = action.groupId ? phone.群[action.groupId] : null;
  if (action.groupId && !existingGroup) throw Error('目标群聊不存在');
  if (!action.groupId && !groupName) throw Error('请填写建群名称');
  // Validate every recipient before creating any group, session or message.
  const sessions = new Map<string, string>();
  for (const target of targets) {
    if (target === account || phone.账号[target]?.平台 !== '邻信') throw Error('受邀邻信账号不存在');
    if (disabledAccount(state, target)) throw Error('受邀角色已停用，请先在角色库开启');
    if (existingGroup && active(target, existingGroup)) throw Error('受邀好友已经在目标群聊中');
    const existing = Object.entries(phone.会话).find(([, session]) => session.类型 === '私聊' && session.参与账号id.includes(account) && session.参与账号id.includes(target));
    if (existing) {
      if (new Set(existing[1].参与账号id).size !== 2) throw Error('私聊会话参与者异常，请先修复会话');
      recipientsFor(state, existing[0], account, state.世界.当前时间);
      sessions.set(target, existing[0]);
    }
  }
  const groupId = action.groupId || uid('group');
  if (!existingGroup) {
    phone.群[groupId] = Schema.parse({ 手机: { 群: { [groupId]: {
      名称: groupName, 创建者账号id: account, 成员: { [account]: { 成员区间: { [uid('period')]: { 加入时间: state.世界.当前时间 } } } },
    } } } }).手机.群[groupId];
  }
  const group = phone.群[groupId];
  const template = Schema.parse({ 手机: { 会话: { template: { 类型: '私聊' } } } }).手机.会话.template;
  for (const target of targets) {
    let sessionId = sessions.get(target);
    if (!sessionId) {
      sessionId = uid('chat');
      phone.会话[sessionId] = { ...copy(template), 参与账号id: [account, target] };
    }
    const text = `群组邀约：邀请你加入「${group.名称 || '未命名群聊'}」（群组ID：${groupId}）。邀约说明：${action.text.trim()}。请按双方意愿决定，明确同意后再记录入群；尚未接受时不加入群组。`;
    recordPhoneMessage(state, account, sessionId, [{ 类型: '文字', id: uid('block'), 正文: text }], [target]);
  }
  return Schema.parse(state);
}

export function applyPhoneAction(state: State, action: PhoneAction) {
  const s: any = state,
    phone = s.手机,
    platform = action.platform ?? '邻信';
  const account = ownAccount(s, platform);
  if (!account) throw Error('请先建立本平台的玩家账号');
  if (action.kind === 'refresh') return Schema.parse(s);
  if (action.kind === 'invite') return applyGroupInvitations(state, action, account);
  const id = uid('phone'),
    time = s.世界.当前时间;
  const content = action.blocks ?? [{ 类型: '文字', id: uid('block'), 正文: action.text?.trim() ?? '' }];
  if (
    action.kind !== 'like' &&
    (!Array.isArray(content) || !content.length || (!action.blocks && !action.text?.trim()))
  )
    throw Error('内容不能为空');
  if (action.kind === 'send') {
    const recipients = recipientsFor(state, action.id!, account, time);
    recordPhoneMessage(state, account, action.id!, content, recipients, id);
    return Schema.parse(s);
  }
  const order = ++s._系统.稳定序号;
  const name = phone.账号[account].昵称 ?? phone.账号[account].账号名;
  const raw = phone.原文;
  if (action.kind === 'post') {
    raw.帖子[id] = {
      平台: platform === '邻信' ? '朋友圈' : '微澜',
      发布账号id: account,
      发布者称呼: name,
      故事时间: time,
      _顺序: order,
      内容块: content,
      话题: action.topics ?? [],
    };
    phone._动态流[raw.帖子[id].平台]._近期id.unshift(id);
  } else {
    const post = raw.帖子[action.id!];
    if (!post || post.删除时间) throw Error('动态不存在或已删除');
    if (action.kind === 'comment') {
      if (action.replyTo && raw.评论[action.replyTo]?.帖子id !== action.id) throw Error('回复目标不属于此帖子');
      raw.评论[id] = {
        帖子id: action.id,
        回复目标评论id: action.replyTo ?? null,
        评论账号id: account,
        评论者称呼: name,
        故事时间: time,
        _顺序: order,
        内容块: content,
      };
      phone._动态流[post.平台]._近期id = [
        action.id!,
        ...phone._动态流[post.平台]._近期id.filter((id: string) => id !== action.id),
      ];
    }
    if (action.kind === 'like') {
      const existing = Object.entries(raw.点赞).find(([, v]: any) => v.账号id === account && v.内容id === action.id);
      if (existing) delete raw.点赞[existing[0]];
      else raw.点赞[id] = { 账号id: account, 内容id: action.id, 时间: time };
    }
    if (action.kind === 'repost') {
      const repost = uid('post');
      raw.帖子[repost] = {
        平台: platform === '邻信' ? '朋友圈' : '微澜',
        发布账号id: account,
        发布者称呼: name,
        故事时间: time,
        _顺序: order,
        内容块: [...content, { 类型: '分享', id: uid('block'), 目标类型: '帖子', 目标id: action.id }],
      };
      raw.转发[id] = { 账号id: account, 原帖id: action.id, 新帖id: repost, 时间: time, 附言: action.text };
      phone._动态流[raw.帖子[repost].平台]._近期id.unshift(repost);
    }
  }
  return Schema.parse(s);
}
