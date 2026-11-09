const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const assert = require('node:assert/strict'), { test } = require('node:test');
const file = path.join(__dirname, '双API流程.spec.cjs'), harness = new Module(file, module);
harness.filename = file; harness.paths = Module._nodeModulePaths(__dirname);
const nativeRequire = harness.require.bind(harness);
harness.require = name => name === 'node:test' ? { test() {} } : nativeRequire(name);
harness._compile(fs.readFileSync(file, 'utf8').split('const novelGoodReply =')[0] +
  '\nmodule.exports={environment,withEnv,seed,block,patch,Schema};', file);
const { environment, withEnv, seed, block, patch, Schema } = harness.exports;
const { assertModelPrivatePatches, validateModel, privatePaths, copy } = require('../运行/core.ts');
const { publicModelData } = require('../运行/model-history.ts');
const { messageSource, assertMessageSource } = require('../运行/request-source.ts');
const { createRuntime } = require('../运行/host.ts');
const { registerMvuSchema } = require('../运行/mvu-schema.ts');

function mvuAdapter() {
  const env = environment();
  global.klona = require('klona').klona;
  global.$ = () => ({ prop: () => false });
  registerMvuSchema(Schema);
  return env.listeners.get('mag_command_parsed_for_zod');
}
test('实际MVU事件适配器允许下划线记录路径，仍保护真正私有路径', () => {
  const apply = mvuAdapter(), data = { stat_data: Schema.parse({ 角色: {
    _人物: { 姓名: '隔离人物', 层级: '次要' }, 普通人物: { 姓名: '普通人物', 层级: '次要' },
  } }) };
  const set = (path, value) => ({ type: 'set', args: [path, JSON.stringify(value)], full_match: '隔离set' });
  for (const path of ['角色._人物.当前状态', '角色.普通人物.当前状态']) {
    const commands = [set(path, '正常工作')]; apply(data, commands); assert.equal(commands.length, 0);
  }
  assert.equal(data.stat_data.角色._人物.当前状态, '正常工作');
  assert.equal(data.stat_data.角色.普通人物.当前状态, '正常工作');
  const before = copy(data.stat_data);
  for (const path of ['_系统.轮数', '角色._人物._管理.版本', '角色._人物._未知字段'])
    apply(data, [set(path, 99)]);
  assert.deepEqual(data.stat_data, before);
});

test('MVU事件适配器保留普通set/add/insert/delete/move与错误收集语义', () => {
  const apply = mvuAdapter(), data = { stat_data: Schema.parse({ 玩家: { id: 'p', 资金: { 余额分: 100 } } }) };
  const command = (type, args) => ({ type, args, full_match: '隔离命令' });
  apply(data, [command('set', ['玩家.姓名', '"甲"'])]);
  assert.equal(data.stat_data.玩家.姓名, '甲');
  apply(data, [command('add', ['玩家.资金.余额分', '5'])]);
  assert.equal(data.stat_data.玩家.资金.余额分, 105);
  apply(data, [command('insert', ['角色', '"_新人物"', JSON.stringify({ 姓名: '新人物', 层级: '次要' })])]);
  assert.equal(data.stat_data.角色._新人物.姓名, '新人物');
  apply(data, [command('move', ['角色._新人物', '角色._移动人物'])]);
  assert(!data.stat_data.角色._新人物); assert.equal(data.stat_data.角色._移动人物.姓名, '新人物');
  apply(data, [command('delete', ['角色._移动人物'])]);
  assert(!data.stat_data.角色._移动人物);
  const errors = [], before = copy(data.stat_data);
  apply(data, [command('set', ['玩家.资金.余额分', '"错误金额"'])], '', error => errors.push(error));
  assert.deepEqual(data.stat_data, before); assert.equal(errors.length, 1);
});

test('下划线是记录ID时保留公开资料与更新权限，记录内管理字段仍只读', () => {
  const before = Schema.parse({ 角色: { _合法人物: { 姓名: '隔离人物', 层级: '次要', 关系网: { _关系对象: { 关系: '朋友' } } } } });
  const projected = publicModelData(before);
  assert(projected.角色._合法人物);
  assert(projected.角色._合法人物.关系网._关系对象);
  assert(!Object.hasOwn(projected.角色._合法人物, '_管理'));
  assert(!Object.hasOwn(privatePaths(before), '/角色/_合法人物'));
  assert(Object.hasOwn(privatePaths(before), '/角色/_合法人物/_管理'));
  assert.doesNotThrow(() => assertModelPrivatePatches(before, [patch('/角色/_合法人物/当前状态', '正常工作')]));
  const after = copy(before); after.角色._合法人物.当前状态 = '正常工作';
  assert.equal(validateModel(before, after).角色._合法人物.当前状态, '正常工作');
  assert(!Object.hasOwn(projected, '_系统'));
  const nested = Schema.parse({ 角色: { _合法人物: { 姓名: '主要人物', 层级: '主要',
    关系网: { _关系对象: {} }, 经历: { 最近经历: { _记录: { 经历: '一次交谈' } } } } } });
  assert(publicModelData(nested).角色._合法人物.经历.最近经历._记录);
  assert(publicModelData(nested.角色._合法人物, ['角色', '_合法人物']).关系网._关系对象);
  assert.doesNotThrow(() => assertModelPrivatePatches(before, [{ op: 'add', path: '/角色/_新~1人物~0', value: { 姓名: '新人', 层级: '次要' } }]));
  assert.throws(() => assertModelPrivatePatches(before, [patch('/角色/_合法人物', {
    ...before.角色._合法人物, _管理: { ...before.角色._合法人物._管理, 版本: 99 },
  })]), /脚本管理字段/);
  for (const command of [patch('/角色/_合法人物/_管理/手动关闭', true),
    { op: 'move', from: '/角色/_合法人物/_管理', to: '/角色/_另一人物' },
    patch('/角色/_合法人物/_未知私有字段', true)]) {
    assert.throws(() => assertModelPrivatePatches(before, [command]), /脚本管理字段|非默认/);
  }
});

test('无关旧API不完整时，外观和另一个API仍可保存、读回与重载', async () => {
  await withEnv(async e => {
    const invalid = copy(e.runtime.settings.variable), beforeLegacy = copy(e.character.澄湾设置.variable);
    await e.runtime.saveSettings({ fontSize: 19 }, 'general');
    assert.equal(e.runtime.settings.fontSize, 19);
    assert.equal(e.runtime.settings.characterAuto, false);
    assert.equal(e.runtime.settings.informationAuto, false);
    assert.deepEqual(e.runtime.settings.variable, invalid);
    assert.deepEqual(e.character.澄湾设置.variable, beforeLegacy);
    await e.runtime.saveSettings({ phone: { mode: 'main', sendPreset: true } }, 'phone');
    assert.equal(Object.hasOwn(e.runtime.settings.phone, 'sendPreset'), false);
    assert.deepEqual(e.runtime.settings.variable, invalid);
    await e.runtime.saveSettings({ information: { reuseVariable: true, sendPreset: true },
      variable: { retries: '无关损坏字段' } }, 'information');
    assert.equal(Object.hasOwn(e.runtime.settings.information, 'sendPreset'), false);
    await e.runtime.reloadSettings();
    assert.equal(e.runtime.settings.fontSize, 19);
    assert.equal(Object.hasOwn(e.runtime.settings.phone, 'sendPreset'), false);
    assert.deepEqual(e.runtime.settings.variable, invalid);
    await assert.rejects(e.runtime.saveSettings({ variable: invalid }, 'variable'), /端点与模型/);
    assert.equal(e.calls.length, 0);
  }, seed(), { characterAuto: false, informationAuto: false,
    variable: { mode: 'extra', model: '旧不完整连接' }, phone: { mode: 'main' } });
});

test('旧外观快照晚保存不会覆盖新确认的API，非API保存不会复制连接字段', async () => {
  await withEnv(async e => {
    const stale = copy(e.runtime.settings), legacy = copy(e.character.澄湾设置);
    await e.runtime.saveSettings({ variable: { mode: 'main', sendPreset: true } }, 'variable');
    await e.runtime.saveSettings({ ...stale, fontSize: 20 }, 'general');
    assert.equal(e.runtime.settings.variable.mode, 'main');
    assert.equal(Object.hasOwn(e.runtime.settings.variable, 'sendPreset'), false);
    assert.deepEqual(e.character.澄湾设置.variable, legacy.variable);
    await e.runtime.dispose(); e.localFiles.clear();
    e.runtime = createRuntime(); await e.runtime.start();
    assert.equal(e.runtime.settings.fontSize, 20);
    assert.equal(e.runtime.settings.variable.mode, 'main');
    assert.equal(Object.hasOwn(e.runtime.settings.variable, 'sendPreset'), false);
  });
});

test('下划线人物结算失败后重载重试，复用原正文与提交ID且只计一轮', async () => {
  const state = seed(); state.角色._合法人物 = copy(state.角色.npc);
  await withEnv(async e => {
    e.update = async () => { throw Error('隔离变量首次失败'); };
    await assert.rejects(e.runtime.send('检查下划线人物'), /隔离变量首次失败/);
    const id = e.vars.澄湾待更新正文.id, text = e.messages[2].message;
    await e.runtime.dispose(); e.runtime = createRuntime(); await e.runtime.start();
    assert.equal(e.vars.澄湾待更新正文.id, id);
    e.update = async () => block([patch('/角色/_合法人物/当前状态', '正常工作')]);
    await e.runtime.retry();
    assert.equal(e.state().角色._合法人物.当前状态, '正常工作');
    assert.equal(e.calls.filter(c => c.kind === 'story').length, 1);
    assert.equal(e.messages[2].message, text);
    assert(e.state()._系统.提交记录[id]);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
    assert.equal(e.messages[2].extra.cw_story_settlements['0'].commitId, id);
    await e.runtime.dispose(); e.runtime = createRuntime(); await e.runtime.start();
    assert.equal(e.state().角色._合法人物.当前状态, '正常工作');
    assert(e.state()._系统.提交记录[id]);
    assert.equal(e.vars.澄湾待更新正文, null);
  }, state);
});

test('源快照只读取原生楼层身份和两层文本，不读取或复制variables', () => {
  environment();
  const raw = [{ name: '人', is_user: false, mes: '原文', swipes: ['旧候选'], swipe_id: 0, extra: {} }];
  Object.defineProperty(raw[0], 'variables', { get() { throw Error('不得读取楼层变量'); } });
  Object.defineProperty(global.SillyTavern, 'chat', { value: raw, configurable: true });
  const helper = global.getChatMessages;
  global.getChatMessages = () => { throw Error('不得经完整楼层接口复制变量'); };
  try {
    const source = messageSource();
    assert.deepEqual(source, [{ id: 0, role: 'assistant', swipe: 0, text: '原文', archive: '原文', candidate: '旧候选' }]);
    raw[0].swipes[0] = '原文';
    assert.doesNotThrow(() => assertMessageSource(source));
    raw[0].mes = '真编辑';
    assert.throws(() => assertMessageSource(source), /源消息/);
  } finally { global.getChatMessages = helper; }
});
