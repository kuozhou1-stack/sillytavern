import { Schema } from '../schema';
import { copy, uid, type State } from './core';

/** 导入兼容：仅将专属标识的单段文字包成数组，保留原文及原始来源对象。 */
export function normalizeCharacterImport(character: any) {
  const normalized = copy(character);
  const signature = normalized?.专属标识;
  if (signature && typeof signature === 'object' && !Array.isArray(signature)) {
    for (const key of ['身体印记', '随身信物']) {
      const value = signature[key];
      if (typeof value === 'string') signature[key] = value.trim() ? [value] : [];
    }
  }
  return normalized;
}

/** Bare authoring templates use `player`; exported packages retain their source identities. */
export function bindTemplatePlayer(character: any, state: State, characterId: string) {
  const playerId = state.玩家.id;
  const relations = character.关系网;
  if (
    !playerId ||
    playerId === 'player' ||
    characterId === 'player' ||
    state.角色.player ||
    !relations ||
    !Object.hasOwn(relations, 'player')
  )
    return;
  relations[playerId] = { ...relations.player, 姓名: state.玩家.姓名 ?? relations.player.姓名, ...relations[playerId] };
  delete relations.player;
  // Remap identity references, never narrative text, event IDs or source snapshots.
  const visit = (value: any) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith('_')) continue;
      if (['人物id', '对象id'].includes(key) && child === 'player') value[key] = playerId;
      else visit(child);
    }
  };
  visit(character);
}

export function assertCharacterMapped(source: any, parsed: any) {
  const missing: string[] = [];
  // 本轮已明确退役的元数据允许旧包携带；社交事实由 Schema 迁入重要记录。
  const retired = (parts: string[]) =>
    (parts.length === 1 && ['年龄确认时间', '籍贯'].includes(parts[0])) ||
    (parts.length === 2 && parts[0] === '生活' && parts[1] === '近期社交交集') ||
    (parts.length === 4 && parts[0] === '生活' && parts[1] === '目标' && parts[3] === '来源') ||
    (parts.length === 3 && parts[0] === '重要记录' && parts[2] === '来源') ||
    (parts.length === 3 && parts[0] === '关系网' && parts[2] === '姓名');
  const scan = (before: any, after: any, parts: string[]) => {
    if (!before || typeof before !== 'object') return;
    for (const [key, value] of Object.entries(before)) {
      const field = [...parts, key];
      if (!Object.hasOwn(after ?? {}, key)) {
        if (!retired(field)) missing.push(field.join('.'));
      } else scan(value, after[key], field);
    }
  };
  scan(source, parsed, []);
  if (missing.length) throw Error('导入字段会被 Schema 删除，请修正：' + missing.join('、'));
}
export function validateCharacterPackage(pack: any) {
  if (!pack || pack.格式版本 !== '澄湾角色包/1' || typeof pack.id !== 'string' || !pack.角色)
    throw Error('角色包结构不完整');
  const data = Schema.parse({
    角色: { [pack.id]: normalizeCharacterImport(pack.角色) },
    手机: { 账号: pack.手机?.账号, 原文: pack.手机 },
    世界: { 当前时间: pack.来源?.导出故事时间 },
  });
  assertCharacterMapped(pack.角色, data.角色[pack.id]);
  for (const account of Object.values(data.手机.账号))
    if (account.人物id !== pack.id) throw Error('角色包包含其他人物账号');
  const ids = new Set(Object.keys(data.手机.账号));
  for (const [root, field] of Object.entries({
    消息: '发送账号id',
    帖子: '发布账号id',
    评论: '评论账号id',
    点赞: '账号id',
    转发: '账号id',
  }))
    for (const item of Object.values((data.手机.原文 as any)[root]) as any[])
      if (!ids.has(item[field])) throw Error('角色包包含非本人源内容：' + root);
  return pack;
}

export function exportCharacter(state: State, id: string) {
  if (!state.角色[id]) throw Error('人物不存在');
  const accounts = Object.fromEntries(Object.entries(state.手机.账号).filter(([, a]) => a.人物id === id));
  const accountIds = Object.keys(accounts);
  const own: Record<string, any> = { 账号: accounts };
  for (const [root, field] of Object.entries({
    消息: '发送账号id',
    帖子: '发布账号id',
    评论: '评论账号id',
    点赞: '账号id',
    转发: '账号id',
  })) {
    own[root] = Object.fromEntries(
      Object.entries((state.手机.原文 as any)[root]).filter(([, r]: any) => accountIds.includes(r[field])),
    );
  }
  return copy({
    格式版本: '澄湾角色包/1',
    id,
    角色: state.角色[id],
    手机: own,
    来源: { 来源存档id: state._系统.存档id, 导出故事时间: state.世界.当前时间 },
    来源档案: Object.fromEntries(Object.entries(state._系统.来源档案).filter(([, r]) => r.人物id === id)),
    关联约定: Object.fromEntries(Object.entries(state.约定).filter(([, r]) => Object.hasOwn(r.参与者, id))),
  });
}
export function deleteCharacter(state: State, id: string) {
  const person = state.角色[id];
  if (!person) throw Error('人物不存在');
  const pack = exportCharacter(state, id);
  for (const [root, records] of Object.entries(pack.手机))
    for (const key of Object.keys(records)) {
      if (root === '账号') delete state.手机.账号[key];
      else delete (state.手机.原文 as any)[root][key];
    }
  for (const [key, source] of Object.entries(state._系统.来源档案))
    if (source.人物id === id) delete state._系统.来源档案[key];
  for (const task of Object.values(state._系统.任务))
    if (task.目标id.includes(id) && task.状态 !== '已提交') {
      task.状态 = '失效';
      task.候选结果JSON = null;
    }
  state._系统.角色停用标识[id] = { 姓名: person.姓名, 版本: person._管理.版本 + 1 };
  delete state.角色[id];
}
export function importCharacter(state: State, id: string, character: any, pack?: any, hasDisabledSnapshot = true) {
  if (hasDisabledSnapshot && state._系统.角色库版本 && state._系统.角色停用标识[id])
    throw Error('该 ID 已停用，请在角色库重新开启，不能用导入覆盖关闭快照');
  if (pack) {
    validateCharacterPackage(pack);
    if (pack.id !== id) throw Error('角色包 ID 不一致');
  }
  const version = Math.max(state.角色[id]?._管理.版本 ?? 0, state._系统.角色停用标识[id]?.版本 ?? 0) + 1;
  if (state.角色[id]) deleteCharacter(state, id);
  const sourceId = uid('source');
  const validated = Schema.parse({ 角色: { [id]: normalizeCharacterImport(character) } }).角色[id];
  assertCharacterMapped(character, validated);
  if (!pack) bindTemplatePlayer(validated, state, id);
  validated._管理.版本 = version;
  validated._管理.来源档案id = sourceId;
  state.角色[id] = validated;
  delete state._系统.角色停用标识[id];
  // Foreign phone content remains source material until naturalization; never deliver it as current-world messages.
  state._系统.来源档案[sourceId] = {
    人物id: id,
    格式版本: pack?.格式版本 ?? '裸角色资料',
    来源存档id: pack?.来源?.来源存档id ?? null,
    导出故事时间: pack?.来源?.导出故事时间 ?? null,
    原时间锚点: validated.层级 === '主要' ? validated._更新循环.上次更新变量时间 : null,
    原始快照JSON: JSON.stringify(pack ?? { id, 角色: character }),
    当前融入状态: '待融入',
    资源清单: {},
  };
}
