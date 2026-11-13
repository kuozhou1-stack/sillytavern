import { Schema } from '../schema';
import { copy, uid, type State } from './core';
import { bindTemplatePlayer, importCharacter } from './characters';
import { planOpeningCharacters } from './opening';
import { ownAccount } from './phone';
import { ensurePhoneSession } from './phone-management';

/** 表单默认生成的关系槽不算点名；只保留玩家实际填写或勾选的初始联系。 */
export function initialConnectionIds(payload: { characters: any[]; details?: any }): string[] {
  const staged = new Set(payload.characters.map(character => character.id));
  return Object.entries(payload.details?.初始关系 ?? {}).filter(([id, raw]) => {
    if (!staged.has(id) || !raw || typeof raw !== 'object') return false;
    const row = raw as any;
    const entered = (key: 'relation' | 'basis') =>
      typeof row[key] === 'string' && Boolean(row[key].trim()) && (row[`${key}Edited`] ?? true);
    return row.contact === true || entered('relation') || entered('basis');
  }).map(([id]) => id);
}

export function createProfile(before: State, payload: { player: any; characters: any[]; details?: any }): State {
  if (before._系统.建档完成) throw Error('已有建档不会被覆盖；请在酒馆新建聊天后建档');
  const draft: any = copy(before),
    p = payload.player;
  if (typeof p.姓名 !== 'string' || !p.姓名.trim()) throw Error('请填写姓名');
  const text = (v: any) => (v === '' || v === undefined ? null : v);
  draft.玩家.id ??= uid('player');
  for (const key of ['姓名', '称呼', '性别', '年龄', '种族'])
    if (p[key] !== undefined) draft.玩家[key] = text(p[key]);
  for (const key of ['身高', '体重', '体型', '面容', '发型', '显著特征', '整体外貌描述'])
    if (p[key] !== undefined) draft.玩家.外貌[key] = text(p[key]);
  for (const key of ['成长背景', '家庭背景', '教育经历', '重要过往', '当前生活背景'])
    if (p[key] !== undefined) draft.玩家.背景[key] = text(p[key]);
  if (p.身份 !== undefined || p.当前职业 !== undefined)
    draft.玩家.身份.身份 = text(p.身份 !== undefined ? p.身份 : p.当前职业);
  if (p.社会身份 !== undefined) draft.玩家.身份.社会身份 = text(p.社会身份);
  if (p.技能栏 !== undefined) draft.玩家.技能栏 = copy(p.技能栏);
  if (p.工作就读单位 !== undefined) draft.玩家.身份.工作或就读单位 = text(p.工作就读单位);
  for (const key of ['饱食度', '水分值', '体力值'])
    if (p[key] !== undefined) draft.玩家.当前状态[key] = text(p[key]);
  if (p.住处描述 !== undefined) {
    const currentId = draft.玩家.生活.住处id;
    const residence = draft.地点[currentId];
    const name = p.住处描述?.trim();
    if (name) {
      const district = p.片区id === undefined ? residence?.片区id : p.片区id || null;
      if (!district || !draft.世界.片区[district]) throw Error('请选择住所所属片区');
      const id = currentId ?? uid('residence');
      draft.地点[id] = { ...(residence ?? { 类型: '住处' }), 名称: name, 片区id: district ?? null };
      draft.玩家.生活.住处id = id;
    } else if (residence?.名称) {
      // 解除玩家与住所的关联，其他人仍可引用这个地点。
      draft.玩家.生活.住处id = null;
    }
  }
  const details = payload.details ?? {};
  const selectedIds = new Set(payload.characters.map(character => character.id));
  for (const character of payload.characters) {
    const { id, __package, __imported, ...record } = character;
    if (!id) throw Error('初始角色缺少稳定 ID');
    if (__package || __imported) importCharacter(draft, id, record, __package);
    else {
      draft.角色[id] = copy(record);
      bindTemplatePlayer(draft.角色[id], draft, id);
    }
  }
  // Advanced starting facts are explicitly entered and previewed, never AI-filled implicitly.
  for (const key of ['世界', '地点', '手机', '约定'])
    if (details[key]) draft[key] = _.merge({}, draft[key], details[key]);
  if (details.玩家) draft.玩家 = _.merge({}, draft.玩家, details.玩家);
  for (const id of details.移除初始物品 ?? []) delete draft.玩家.物品栏[id];
  // 只有完整建档表单提供移除名单。局部调用未提交的人物继续沿用作者初值。
  for (const id of details.移除初始角色 ?? []) {
    if (selectedIds.has(id) || !Object.hasOwn(before.角色, id)) continue;
    // 姓名与停用标识保留历史引用的身份。既有联系人、投递、约定与其他人的记忆仍指向原 ID。
    const hasAccount = Object.values(draft.手机.账号).some((account: any) => account.人物id === id);
    if (hasAccount) {
      const character = before.角色[id];
      draft._系统.角色停用标识[id] = { 姓名: character.姓名, 版本: character._管理.版本 + 1 };
    }
    delete draft.角色[id];
    draft.世界.当前场景.在场人物 = draft.世界.当前场景.在场人物.filter((personId: string) => personId !== id);
  }
  for (const key of ['饱食度', '水分值', '体力值']) draft.玩家.当前状态[key] ??= 100;
  let playerAccount = ownAccount(draft);
  if (playerAccount && details.邻信账号名 !== undefined) {
    draft.手机.账号[playerAccount].账号名 = details.邻信账号名 || null;
  } else if (!playerAccount && details.邻信账号名) {
    playerAccount = uid('account');
    draft.手机.账号[playerAccount] = { 人物id: draft.玩家.id, 平台: '邻信', 账号名: details.邻信账号名, 昵称: p.姓名 };
  }
  for (const [id, relation] of Object.entries(details.初始关系 ?? {}) as any) {
    // Old browser drafts can retain a relationship after its staged character was removed.
    if (!selectedIds.has(id)) continue;
    if (!draft.角色[id]) throw Error('初始关系人物不存在');
    const network = draft.角色[id].关系网 ??= {};
    const existing = network[draft.玩家.id] ?? {};
    const relationEdited = relation.relationEdited ?? Boolean(relation.relation?.trim());
    const basisEdited = relation.basisEdited ?? Boolean(relation.basis?.trim());
    const relationship = relationEdited ? relation.relation?.trim() || null : existing.关系 ?? null;
    const basis = basisEdited ? relation.basis?.trim() || null : existing.关系备注 ?? null;
    if (((relationEdited && relationship) || (relation.contact && relation.contactEdited !== false)) && !basis)
      throw Error('请填写相识依据');
    if (relationEdited || basisEdited) network[draft.玩家.id] = { ...existing, 关系: relationship, 关系备注: basis };
    if (relation.contactEdited === false || (!relation.contact && !relation.contactEdited)) continue;
    const accounts = Object.entries(draft.手机.账号) as [string, State['手机']['账号'][string]][];
    let account = accounts.find(([, a]) => a.人物id === id && a.平台 === '邻信')?.[0];
    if (relation.contact) {
      if (!playerAccount) throw Error('交换联系方式前请建立玩家邻信账号');
      account ??= uid('account');
      draft.手机.账号[account] ??= { 人物id: id, 平台: '邻信', 昵称: draft.角色[id].姓名 };
      ensurePhoneSession(draft, '私聊', account);
    }
    if (!account || !playerAccount) continue;
    const contacts = Object.values(draft.手机.联系人) as State['手机']['联系人'][string][];
    for (const [owner, target] of [[playerAccount, account], [account, playerAccount]]) {
      const contact = contacts.find(row => row.本人账号id === owner && row.对方账号id === target);
      if (contact) contact.状态 = relation.contact ? '正常' : '移除';
      else if (relation.contact) draft.手机.联系人[uid('contact')] = { 本人账号id: owner, 对方账号id: target };
    }
  }
  draft.世界.开局时间 = copy(draft.世界.当前时间);
  draft.世界.天气._上次检查时间 = copy(draft.世界.当前时间);
  if (['天气状况', '气温', '风况', '适用区域'].some(key => draft.世界.天气[key] !== null))
    draft.世界.天气.生效时间 ??= copy(draft.世界.当前时间);
  for (const character of Object.values(draft.角色) as any[])
    if (character.层级 === '主要' && !character._管理?.来源档案id)
      character._更新循环 = { ...character._更新循环, 上次更新变量时间: copy(draft.世界.当前时间) };
  draft._系统.建档完成 = true;
  const result = Schema.parse(draft);
  const locationIds = [
    result.玩家.当前状态.当前地点id,
    result.玩家.生活.住处id,
    ...result.玩家.生活.工作地点id,
    ...result.玩家.生活.常去地点id,
  ];
  for (const id of locationIds) {
    if (!id) continue;
    if (!result.地点[id]) throw Error('起点引用了不存在的地点：' + id);
    // 玩家明确填写的日常地址是已知地点；其他公共场所与人物住处不随建档公开。
    if (!Object.hasOwn(result.玩家.已知信息.已知地点, id))
      result.玩家.已知信息.已知地点[id] = {
        方式: '玩家填写',
        说明: '开局设定中明确的当前位置、住处或日常地点',
        人物id: result.玩家.id,
        记录id: null,
        获得时间: copy(result.世界.开局时间),
      };
  }
  return planOpeningCharacters(
    result,
    payload.characters.filter(c => c.__package || c.__imported).map(c => c.id),
  );
}
