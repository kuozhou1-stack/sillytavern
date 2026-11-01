import { Schema } from '../schema';
import { uid, copy, type State } from './core';
import { ownAccount, phoneNotificationPlatform } from './phone';

const currentMember = (member: State['手机']['群'][string]['成员'][string] | undefined) =>
  Object.values(member?.成员区间 ?? {}).some(interval => interval.离开时间 === null);

/** Open an existing conversation or create one from the referenced accounts. */
export function ensurePhoneSession(state: State, type: '私聊' | '群聊', target: string) {
  const phone = state.手机, self = ownAccount(state);
  if (!self) throw Error('尚无玩家邻信账号');
  const existing = Object.entries(phone.会话).find(([, session]) => session.类型 === type &&
    (type === '群聊' ? session.群id === target : session.参与账号id.includes(self) && session.参与账号id.includes(target)));
  if (type === '私聊') {
    if (existing) return { state, id: existing[0] };
    if (target === self || phone.账号[target]?.平台 !== '邻信') throw Error('目标邻信账号不存在');
    if (state._系统.角色停用标识[phone.账号[target].人物id ?? '']) throw Error('对方角色已停用，请先在角色库开启');
    const id = uid('chat');
    phone.会话[id] = Schema.parse({ 手机: { 会话: { [id]: { 类型: type, 参与账号id: [self, target] } } } }).手机.会话[id];
    return { state, id };
  }
  const group = phone.群[target];
  if (!group || !currentMember(group.成员[self])) throw Error('当前未加入此群聊');
  const members = Object.entries(group.成员).filter(([id, member]) => phone.账号[id]?.平台 === '邻信' && currentMember(member)).map(([id]) => id);
  if (existing) {
    // Preserve former participants for history while repairing the current membership list.
    existing[1].参与账号id = [...new Set([...existing[1].参与账号id, ...members])];
    return { state, id: existing[0] };
  }
  const id = uid('chat');
  phone.会话[id] = Schema.parse({ 手机: { 会话: { [id]: { 类型: type, 群id: target, 参与账号id: members } } } }).手机.会话[id];
  return { state, id };
}
export function managePhone(state: State, op: string, id: string, value?: string) {
  const s: any = state,
    phone = s.手机,
    self = ownAccount(s);
  if (op === 'createAccount') {
    if (!['邻信', '微澜'].includes(id) || !value?.trim()) throw Error('请选择平台并填写账号名称');
    if (!s.玩家.id) throw Error('请先建档');
    if (id === '邻信' && self) throw Error('已有邻信账号');
    phone.账号[uid('account')] = { 人物id: s.玩家.id, 平台: id, 账号名: value.trim(), 昵称: value.trim() };
    return Schema.parse(s);
  }
  if (op === 'follow') {
    const account = ownAccount(s, '微澜');
    if (!account || phone.账号[id]?.平台 !== '微澜') throw Error('平台账号不存在');
    const old = Object.entries(phone.关注).find(([, f]: any) => f.关注者账号id === account && f.被关注账号id === id);
    if (old) delete phone.关注[old[0]];
    else phone.关注[uid('follow')] = { 关注者账号id: account, 被关注账号id: id };
    return Schema.parse(s);
  }
  if (['editPost', 'deletePost', 'retract'].includes(op)) {
    const message = op === 'retract',
      record = message ? phone.原文.消息[id] : phone.原文.帖子[id];
    const author = record?.[message ? '发送账号id' : '发布账号id'];
    if (!author || phone.账号[author]?.人物id !== s.玩家.id) throw Error('只能修改本人的已发布内容');
    if (!s.世界.当前时间) throw Error('故事时间未知，不能确定编辑或撤回时间');
    if (op === 'retract') record.撤回时间 = copy(s.世界.当前时间);
    else if (op === 'deletePost') record.删除时间 = copy(s.世界.当前时间);
    else {
      if (!value?.trim()) throw Error('内容不能为空');
      record.编辑版本[uid('version')] = { 时间: record.编辑时间 ?? record.故事时间, 内容块: copy(record.内容块) };
      record.内容块 = [
        { 类型: '文字', id: uid('block'), 正文: value.trim() },
        ...record.内容块.filter((block: any) => block.类型 !== '文字'),
      ];
      record.编辑时间 = copy(s.世界.当前时间);
    }
    return Schema.parse(s);
  }
  if (op === 'readNotification') {
    const notice = phone._通知[id];
    if (!notice) throw Error('通知不存在');
    const platform = phoneNotificationPlatform(s, notice);
    const ownsAccount = platform
      ? !!ownAccount(s, platform)
      : !!s.玩家.id && Object.values(phone.账号).some((account: any) => account.人物id === s.玩家.id);
    if (!ownsAccount) throw Error('请先建立通知所属平台的玩家账号');
    // _通知 is derived only for the player. Unknown historical sources can still be dismissed.
    notice.已读 = true;
    return Schema.parse(s);
  }
  if (!self) throw Error('尚无玩家邻信账号');
  if (op === 'apply') {
    if (phone.账号[id]?.平台 !== '邻信' || id === self) throw Error('目标邻信账号不存在');
    if (s._系统.角色停用标识[phone.账号[id].人物id ?? '']) throw Error('对方角色已停用，请先在角色库开启');
    const contact = Object.values(phone.联系人).find((c: any) => c.本人账号id === self && c.对方账号id === id) as any;
    if (contact?.状态 === '正常') throw Error('对方已是好友');
    if (
      !s.玩家.已知信息.已知账号[id] &&
      !Object.values(phone.联系人).some((c: any) => c.本人账号id === self && c.对方账号id === id)
    )
      throw Error('尚未获知此账号');
    if (Object.values(phone.申请).some((a: any) => a.发起账号id === self && a.目标账号id === id && a.状态 === '待处理'))
      throw Error('已有待处理申请');
    if (Object.values(phone.申请).some((a: any) => a.发起账号id === id && a.目标账号id === self && a.状态 === '待处理'))
      throw Error('对方已发送好友申请，请先在待处理申请中回应');
    phone.申请[uid('application')] = {
      发起账号id: self,
      目标账号id: id,
      说明: value ?? null,
      时间: s.世界.当前时间,
    };
    return Schema.parse(s);
  }
  if (op === 'accept' || op === 'reject' || op === 'withdraw') {
    const a = phone.申请[id];
    if (!a || a.状态 !== '待处理') throw Error('申请已处理或不存在');
    if (op === 'withdraw' ? a.发起账号id !== self : a.目标账号id !== self) throw Error('不能替他人处理申请');
    a.状态 = op === 'accept' ? '接受' : op === 'reject' ? '拒绝' : '撤销';
    if (op === 'accept') {
      for (const [owner, target] of [
        [self, a.发起账号id],
        [a.发起账号id, self],
      ]) {
        const old = Object.entries(phone.联系人).find(
          ([, c]: any) => c.本人账号id === owner && c.对方账号id === target,
        );
        if (old) (old[1] as any).状态 = '正常';
        else
          phone.联系人[uid('contact')] = {
            本人账号id: owner,
            对方账号id: target,
            建立时间: s.世界.当前时间,
          };
      }
      if (
        !Object.values(phone.会话).some(
          (c: any) => c.类型 === '私聊' && c.参与账号id.includes(self) && c.参与账号id.includes(a.发起账号id),
        )
      )
        phone.会话[uid('chat')] = { 类型: '私聊', 参与账号id: [self, a.发起账号id] };
    }
  } else if (['remove', 'mute', 'remark'].includes(op)) {
    const c = phone.联系人[id];
    if (!c || c.本人账号id !== self) throw Error('不是本人的联系人');
    if (c.状态 === '移除') throw Error('联系人已删除，请重新申请添加好友');
    if (op === 'remove') c.状态 = '移除';
    if (op === 'mute') c.免打扰 = !c.免打扰;
    if (op === 'remark') c.备注 = value?.trim() || null;
  } else if (op === 'leaveGroup' || op === 'removeMember') {
    const g = phone.群[id];
    if (!g) throw Error('群不存在');
    if (!currentMember(g.成员[self])) throw Error('当前不在群成员期间');
    const target = op === 'leaveGroup' ? self : value!;
    if (!currentMember(g.成员[target])) throw Error('该账号当前不在群中');
    if (op === 'removeMember') {
      if (target === self) throw Error('请使用退出群聊操作');
    }
    if (!s.世界.当前时间) throw Error('当前故事时间未知，无法确定离群时间');
    for (const interval of Object.values(g.成员[target]?.成员区间 ?? {}) as any)
      if (interval.离开时间 === null) interval.离开时间 = s.世界.当前时间;
  } else if (op === 'readMessage') {
    const m = phone.原文.消息[id];
    if (!m) throw Error('消息不存在');
    phone._阅读进度[self] ??= {};
    const r = (phone._阅读进度[self][m.会话id] ??= { 已读内容id: [], 最后阅读消息id: null, 最后阅读顺序: 0 });
    if (!r.已读内容id.includes(id)) r.已读内容id.push(id);
    if (m._顺序 >= r.最后阅读顺序) {
      r.最后阅读顺序 = m._顺序;
      r.最后阅读消息id = id;
    }
    for (const b of m.内容块) {
      const source = { 方式: '阅读', 说明: '查看手机内容', 记录id: id, 获得时间: s.世界.当前时间 };
      if (b.类型 === '名片' && phone.账号[b.账号id]) s.玩家.已知信息.已知账号[b.账号id] ??= source;
      if (b.类型 === '位置' && s.地点[b.地点id]) s.玩家.已知信息.已知地点[b.地点id] ??= source;
    }
    for (const n of Object.values(phone._通知) as any[])
      if (n.来源id === m.会话id && n.内容id.every((id: string) => r.已读内容id.includes(id))) n.已读 = true;
  } else throw Error('未知手机管理操作');
  return Schema.parse(s);
}
