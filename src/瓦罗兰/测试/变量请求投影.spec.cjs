const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const assert = require('node:assert/strict'), { test } = require('node:test');
const file = path.join(__dirname, '双API流程.spec.cjs'), harness = new Module(file, module);
harness.filename = file; harness.paths = Module._nodeModulePaths(__dirname);
const nativeRequire = harness.require.bind(harness);
harness.require = name => name === 'node:test' ? { test() {} } : nativeRequire(name);
harness._compile(fs.readFileSync(file, 'utf8').split('const novelGoodReply =')[0] +
  '\nmodule.exports={environment,Schema,copy};', file);
const { environment, Schema, copy } = harness.exports;
const { disabledIdentityPrompt, assertDisabledUnchanged } = require('../运行/character-activity.ts');
const { livePromptConfig } = require('../运行/prompts.ts');
const { withUpdateTasks } = require('../运行/update-tasks.ts');
const { importCharacter, exportCharacter } = require('../运行/characters.ts');
const { openingCharacterPrompt } = require('../运行/opening.ts');
const { promptProjections } = require('../运行/model-history.ts');

function seed() {
  return Schema.parse({ _系统: { 建档完成: true, 角色停用标识: {
    closed_a: { 姓名: '历史甲' }, closed_b: { 姓名: '历史乙' },
  } }, 玩家: { id: 'player' }, 角色: { npc: { 姓名: '开启人物', 层级: '次要' } } });
}

test('变量关闭身份只投影本次引用，完整关闭约束与原状态仍保留', () => {
  const before = seed(), original = copy(before);
  const scoped = disabledIdentityPrompt(before, [{ content: '历史记录引用 closed_a' }]);
  assert(scoped.includes('closed_a'));
  assert(!scoped.includes('closed_b'));
  assert(disabledIdentityPrompt(before).includes('closed_b'), '正文仍获得完整关闭名单');
  assert(disabledIdentityPrompt(before, [{ content: [{ type: 'text', text: '提及历史乙' }] }]).includes('closed_b'));
  const candidate = copy(before);
  candidate.角色.closed_b = copy(candidate.角色.npc);
  assert.throws(() => assertDisabledUnchanged(before, candidate), /已关闭角色不能由模型重建/);
  assert.deepEqual(before, original);
});

test('变量通道不携带卡描述中的开场职责，正文通道仍走原生描述', async () => {
  const state = seed(); environment(state);
  const worker = await livePromptConfig(state, '结算已发生事实', 'worker');
  const story = await livePromptConfig(state, '继续剧情', 'story');
  assert.equal(worker.overrides.char_description, '');
  assert.equal(worker.overrides.persona_description, '');
  assert(!Object.hasOwn(story.overrides, 'char_description'));
});

test('生活说明精简后每个任务身份与不同覆盖起点仍完整保留', () => {
  const state = seed();
  const times = [{ 年: 2026, 月: 11, 日: 1, 时: 9, 分: 0 }, { 年: 2026, 月: 11, 日: 1, 时: 9, 分: 5 }];
  for (const [i, start] of times.entries()) state._系统.任务['life_' + i] = {
    类别: '生活更新', 状态: '排队', 目标id: ['npc'], 目标版本: { npc: 0 },
    触发来源: '自动角色调度：当前生活检查', 起始时间: start,
  };
  const original = copy(state), prompt = withUpdateTasks({}, state, ['life_0', 'life_1']).injects[0].content;
  for (const [i, start] of times.entries()) {
    assert(prompt.includes('待办 life_' + i + '：'));
    assert(prompt.includes(JSON.stringify(start)));
  }
  assert(prompt.includes('每位本次调度目标必须有具体动态变化'));
  assert(!prompt.includes('按下方'));
  assert.deepEqual(state, original);
});

const sourceLabel = '只读来源资料补充（当前变量未提供）：';
const promptText = config => config.injects.map(prompt => prompt.content).join('\n');
function sourceExtras(config) {
  const line = promptText(config).split('\n').find(value => value.startsWith(sourceLabel));
  return line ? JSON.parse(line.slice(sourceLabel.length)) : {};
}
function importedSeed(pack) {
  const state = seed();
  state.角色 = {};
  const character = pack?.角色 ?? {
    层级: '主要', 姓名: '来源人物', 简介: 'SOURCE_CHARACTER_SENTINEL',
    关系网: { closed_a: { 姓名: '历史甲', 关系: '已有关系' } },
  };
  importCharacter(state, 'npc', character, pack);
  state._系统.任务.source = Schema.parse({ _系统: { 任务: { source: {
    类别: '建档', 状态: '排队', 目标id: ['npc'], 目标版本: { npc: state.角色.npc._管理.版本 },
  } } } })._系统.任务.source;
  return state;
}
function foreignPack() {
  return {
    格式版本: '澄湾角色包/1', id: 'npc',
    角色: { 层级: '主要', 姓名: '来源人物', 简介: 'SOURCE_CHARACTER_SENTINEL' },
    来源: { 来源存档id: 'foreign-save', 导出故事时间: { 年: 2025, 月: 5, 日: 4, 时: 8, 分: 0 } },
    手机: {
      账号: { foreign_account: { 人物id: 'npc', 平台: '邻信', 昵称: '来源账号' } },
      消息: { foreign_message: { 会话id: 'foreign-chat', 发送账号id: 'foreign_account',
        内容块: [{ id: 'foreign-body', 类型: '文字', 正文: 'FOREIGN_MESSAGE_SENTINEL' }] } },
    },
    关联约定: { foreign_agreement: { 内容: 'FOREIGN_AGREEMENT_SENTINEL',
      参与者: { npc: { 称呼: '来源人物', 响应: '接受' } } } },
  };
}

test('建档简表退出，裸角色与变量投影相同的资料不再附加，原始档案及导出均保留', async () => {
  const state = importedSeed(); environment(state);
  const original = copy(state), exported = exportCharacter(state, 'npc');
  const result = withUpdateTasks(await livePromptConfig(state, '', 'worker'), state, ['source']);
  for (const withStory of [true, false])
    assert(!openingCharacterPrompt(state, 'source', withStory).includes('初始角色关联简表'));
  assert(!promptText(result).includes('初始角色关联简表'));
  assert(!promptText(result).includes('只读来源资料'));
  assert.equal(promptText(result).split('SOURCE_CHARACTER_SENTINEL').length - 1, 1);
  assert.deepEqual(state, original);
  assert.deepEqual(exportCharacter(state, 'npc'), exported);
});

test('来源角色只补投影未提供字段，不把当前明确的null、0或空集合补回旧值', async () => {
  const state = importedSeed(); environment(state);
  const original = copy(state);
  const config = await livePromptConfig(state, '', 'worker');
  const projection = copy(promptProjections.get(config));
  delete projection.角色.npc.简介;
  projection.角色.npc.姓名 = null;
  projection.角色.npc.年龄 = 0;
  projection.角色.npc.关系网 = {};
  const scoped = { injects: [{ role: 'user', content: JSON.stringify(projection) }] };
  promptProjections.set(scoped, projection);
  const extra = Object.values(sourceExtras(withUpdateTasks(scoped, state, ['source'])))[0];
  assert.equal(extra.角色.简介, 'SOURCE_CHARACTER_SENTINEL');
  assert(!Object.hasOwn(extra.角色, '姓名'));
  assert(!Object.hasOwn(extra.角色, '年龄'));
  assert(!Object.hasOwn(extra.角色, '关系网'), '当前明确的空集合不补回旧条目');
  assert.deepEqual(state, original, '来源未被请求投影覆盖');
});

test('缺少关系字段时补充未知人物的来源姓名，已提供的相同身份姓名不重复', async () => {
  const state = importedSeed();
  const sourceId = state.角色.npc._管理.来源档案id;
  const raw = JSON.parse(state._系统.来源档案[sourceId].原始快照JSON);
  raw.角色.关系网.foreign_person = { 姓名: '独有来源人物名', 关系: '源存档相识' };
  state._系统.来源档案[sourceId].原始快照JSON = JSON.stringify(raw);
  environment(state);
  const config = await livePromptConfig(state, '', 'worker');
  const projection = copy(promptProjections.get(config));
  delete projection.角色.npc.关系网;
  const scoped = { injects: [{ role: 'user', content: JSON.stringify(projection) }] };
  promptProjections.set(scoped, projection);
  const extra = Object.values(sourceExtras(withUpdateTasks(scoped, state, ['source'])))[0];
  assert.equal(extra.角色.关系网.foreign_person.姓名, '独有来源人物名');
  assert(!Object.hasOwn(extra.角色.关系网.closed_a, '姓名'));
});

test('跨存档手机、约定和来源时间保留；已在变量中提供的相同记录不重复', async () => {
  const pack = foreignPack(), state = importedSeed(pack); environment(state);
  const original = copy(state);
  const extra = Object.values(sourceExtras(withUpdateTasks(await livePromptConfig(state, '', 'worker'), state, ['source'])))[0];
  assert(!Object.hasOwn(extra, '角色'));
  assert.equal(extra.手机.消息.foreign_message.内容块[0].正文, 'FOREIGN_MESSAGE_SENTINEL');
  assert.equal(extra.关联约定.foreign_agreement.内容, 'FOREIGN_AGREEMENT_SENTINEL');
  assert.equal(extra.来源.来源存档id, 'foreign-save');
  assert.deepEqual(extra.来源.导出故事时间, pack.来源.导出故事时间);
  assert(!JSON.stringify(extra).includes('原始快照JSON'));
  assert.deepEqual(state, original);
  state.手机 = Schema.parse({ 手机: { 账号: pack.手机.账号, 原文: pack.手机 } }).手机;
  state.约定 = Schema.parse({ 约定: pack.关联约定 }).约定;
  const provided = Object.values(sourceExtras(withUpdateTasks(await livePromptConfig(state, '', 'worker'), state, ['source'])))[0];
  assert(!Object.hasOwn(provided, '手机'));
  assert(!Object.hasOwn(provided, '关联约定'));
  assert.equal(provided.来源.来源存档id, 'foreign-save');
});

test('同ID但不同内容的跨存档原文保持完整，不按ID或部分字段误去重', async () => {
  const pack = foreignPack(), state = importedSeed(pack); environment(state);
  state.手机 = Schema.parse({ 手机: { 账号: pack.手机.账号, 原文: pack.手机 } }).手机;
  state.手机.原文.消息.foreign_message.内容块[0].正文 = 'CURRENT_WORLD_MESSAGE';
  const original = copy(state);
  const extra = Object.values(sourceExtras(withUpdateTasks(await livePromptConfig(state, '', 'worker'), state, ['source'])))[0];
  const message = extra.手机.消息.foreign_message;
  assert.equal(message.内容块[0].正文, 'FOREIGN_MESSAGE_SENTINEL');
  assert.equal(message.会话id, 'foreign-chat');
  assert.equal(message.发送账号id, 'foreign_account');
  assert.deepEqual(state, original);
});

test('历史来源递归补独有记录，跨任务及来源链共享原文一次，存档原始JSON不变', async () => {
  const pack = foreignPack();
  const older = copy(pack);
  older.手机.消息.ancestor_message = { ...copy(older.手机.消息.foreign_message),
    内容块: [{ id: 'ancestor-body', 类型: '文字', 正文: 'ANCESTOR_MESSAGE_SENTINEL' }] };
  older.来源.来源存档id = 'ancestor-save';
  pack.来源档案 = { ancestor: { 人物id: 'npc', 格式版本: '澄湾角色包/1', 原始快照JSON: JSON.stringify(older) } };
  const state = importedSeed(pack); environment(state);
  state._系统.任务.second = copy(state._系统.任务.source);
  const original = copy(state), exported = exportCharacter(state, 'npc');
  const body = promptText(withUpdateTasks(await livePromptConfig(state, '', 'worker'), state, ['source', 'second']));
  for (const sentinel of ['FOREIGN_MESSAGE_SENTINEL', 'ANCESTOR_MESSAGE_SENTINEL', 'FOREIGN_AGREEMENT_SENTINEL'])
    assert.equal(body.split(sentinel).length - 1, 1, sentinel);
  assert(body.includes('ancestor-save'));
  assert.deepEqual(state, original);
  assert.deepEqual(exportCharacter(state, 'npc'), exported);
});

test('没有当前变量投影时仍提供必要来源，不擅自假定资料已经发送', () => {
  const state = importedSeed(foreignPack()), original = copy(state);
  const extra = Object.values(sourceExtras(withUpdateTasks({ injects: [] }, state, ['source'])))[0];
  assert.equal(extra.角色.简介, 'SOURCE_CHARACTER_SENTINEL');
  assert.equal(extra.手机.消息.foreign_message.内容块[0].正文, 'FOREIGN_MESSAGE_SENTINEL');
  assert.deepEqual(state, original);
});
