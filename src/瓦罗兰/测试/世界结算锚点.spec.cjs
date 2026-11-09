const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, parent, ...args) {
  if (name.startsWith('.') && parent && fs.existsSync(path.resolve(path.dirname(parent.filename), name + '.ts'))) name += '.ts';
  return resolve.call(this, name, parent, ...args);
};
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);
global.z = require('zod').z;
global._ = require('lodash');
const { Schema } = require('../schema.ts');
const { copy, validateModel } = require('../运行/core.ts');
const { normalizeWorldAnchorPatches, restoreWorldAnchors, finalizeWorld } = require('../运行/world.ts');
const { validateSettlement } = require('../运行/settlement.ts');
const { updateBlock } = require('../运行/message-protocol.ts');

const time = (hour, minute = 0) => ({ 年: 2026, 月: 10, 日: 3, 时: hour, 分: minute });
const sceneAnchor = '/世界/当前场景/_上次更新场景时间';
const weatherAnchor = '/世界/天气/_上次检查时间';
const parts = pointer => pointer.slice(1).split('/').map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'));
const patch = commands => `<UpdateVariable><JSONPatch>${JSON.stringify(commands)}</JSONPatch></UpdateVariable>`;
function seed() {
  return Schema.parse({
    世界: {
      当前时间: time(10),
      天气: { 天气状况: '晴', 气温: 20, 生效时间: time(8), _上次检查时间: time(10) },
      当前场景: { 场景id: 'scene', 环境状态: '咖啡馆安静', _上次更新场景时间: time(9) },
    },
    玩家: { id: 'player', 资金: { 余额分: 10000 } },
    角色: { a: { 层级: '次要', 姓名: '测试人物' } },
  });
}

// Match the existing host fixture's patch behavior, with an extra MVU-stage schema check:
// invalid timestamps must be normalized before this boundary, not only after parsing.
function mvuStub(text, before) {
  let raw = copy(before);
  for (const command of updateBlock(text).commands) {
    if (command.path === '') {
      if (!['replace', 'add'].includes(command.op)) throw Error('测试不支持的根操作');
      raw = copy(command.value);
    } else if (command.op === 'remove') _.unset(raw, parts(command.path));
    else if (['replace', 'add', 'insert'].includes(command.op)) _.set(raw, parts(command.path), copy(command.value));
    else throw Error('测试不支持的补丁操作');
  }
  Schema.parse(raw);
  return raw;
}
function candidate(before, commands) {
  const normalized = normalizeWorldAnchorPatches(before, commands);
  const raw = mvuStub(patch(normalized), before);
  return validateSettlement(before, validateModel(before, restoreWorldAnchors(before, raw)));
}
function settle(before, commands) {
  return finalizeWorld(before, candidate(before, commands));
}

test('显式锚点写入、删除和日期子字段均忽略，业务补丁保留且输入不变', () => {
  const before = seed(), saved = copy(before);
  const commands = [
    { op: 'replace', path: sceneAnchor, value: '坏时间' },
    { op: 'remove', path: weatherAnchor },
    { op: 'delta', path: sceneAnchor + '/分', value: 10 },
    { op: 'add', path: weatherAnchor + '/月', value: 99 },
    { op: 'replace', path: '/世界/当前场景/环境状态', value: '有人推门进来' },
  ];
  const savedCommands = copy(commands);
  assert.deepEqual(normalizeWorldAnchorPatches(before, commands), [commands[4]]);
  const result = candidate(before, commands);
  assert.equal(result.世界.当前场景.环境状态, '有人推门进来');
  assert.deepEqual(result.世界.当前场景._上次更新场景时间, time(9));
  assert.deepEqual(result.世界.天气._上次检查时间, time(10));
  assert.deepEqual(before, saved);
  assert.deepEqual(commands, savedCommands);
});

test('替换场景或天气父对象时，在 MVU 日期校验之前补回缺失及损坏的锚点', () => {
  const before = seed();
  for (const [root, field] of [['当前场景', '_上次更新场景时间'], ['天气', '_上次检查时间']]) {
    for (const op of ['replace', 'add', 'insert']) {
      for (const bad of [undefined, null, '坏时间', { 年: 2026, 月: 99 }]) {
        const value = copy(before.世界[root]);
        if (bad === undefined) delete value[field];
        else value[field] = bad;
        const commands = [{ op, path: '/世界/' + root, value }];
        const normalized = normalizeWorldAnchorPatches(before, commands);
        assert.deepEqual(normalized[0].value[field], before.世界[root][field]);
        assert.deepEqual(candidate(before, commands), before);
      }
    }
  }
});

test('替换世界和根对象也恢复两个锚点，仍保留其他完整数据', () => {
  const before = seed();
  for (const root of ['/世界', '']) {
    const value = copy(root ? before.世界 : before);
    const world = root ? value : value.世界;
    delete world.当前场景._上次更新场景时间;
    world.天气._上次检查时间 = '模型自行填写的日期';
    assert.deepEqual(candidate(before, [{ op: 'replace', path: root, value }]), before);
  }
});

test('MVU 返回值中的缺失或误写仅恢复指定锚点，不修改原始响应', () => {
  const before = seed(), raw = copy(before);
  delete raw.世界.当前场景._上次更新场景时间;
  raw.世界.天气._上次检查时间 = '仍然无效';
  const saved = copy(raw), restored = restoreWorldAnchors(before, raw);
  assert.deepEqual(restored, before);
  assert.deepEqual(raw, saved);
  assert.deepEqual(validateModel(before, restored), before);
});

test('仅锚点补丁归一化为空操作，不能提前更新场景或天气时间', () => {
  const before = seed();
  const commands = [
    { op: 'replace', path: sceneAnchor, value: time(23) },
    { op: 'replace', path: weatherAnchor, value: time(23) },
  ];
  assert.deepEqual(normalizeWorldAnchorPatches(before, commands), []);
  assert.deepEqual(settle(before, commands), before);
});

test('时间前进但场景没有实际变化，场景锚点及未到期天气锚点保持原值', () => {
  const before = seed();
  const result = settle(before, [
    { op: 'replace', path: '/世界/当前时间', value: time(10, 20) },
    { op: 'replace', path: sceneAnchor, value: null },
    { op: 'replace', path: weatherAnchor, value: time(10, 20) },
  ]);
  assert.deepEqual(result.世界.当前场景._上次更新场景时间, time(9));
  assert.deepEqual(result.世界.天气._上次检查时间, time(10));
  assert.deepEqual(result.世界.天气.生效时间, time(8));
});

test('环境、在场人物或玩家地点真正变化后，场景锚点取本轮故事时间', () => {
  const before = seed();
  for (const change of [
    { op: 'replace', path: '/世界/当前场景/环境状态', value: '开始下雨，客人纷纷收伞' },
    { op: 'replace', path: '/世界/当前场景/在场人物', value: ['a'] },
    { op: 'replace', path: '/玩家/当前状态/当前地点id', value: 'nearby_cafe' },
  ]) {
    const result = settle(before, [
      { op: 'replace', path: '/世界/当前时间', value: time(10, 20) },
      change,
      { op: 'replace', path: sceneAnchor, value: time(23) },
    ]);
    assert.deepEqual(result.世界.当前场景._上次更新场景时间, time(10, 20));
    assert.deepEqual(result.世界.天气._上次检查时间, time(10));
  }
});

test('天气真实变化更新检查与生效时间，未变化但满三小时只更新检查时间', () => {
  const before = seed();
  const changed = settle(before, [
    { op: 'replace', path: '/世界/当前时间', value: time(10, 20) },
    { op: 'replace', path: '/世界/天气/天气状况', value: '阴转小雨' },
    { op: 'replace', path: weatherAnchor, value: time(23) },
  ]);
  assert.deepEqual(changed.世界.天气._上次检查时间, time(10, 20));
  assert.deepEqual(changed.世界.天气.生效时间, time(10, 20));
  const due = settle(before, [{ op: 'replace', path: '/世界/当前时间', value: time(13) }]);
  assert.deepEqual(due.世界.天气._上次检查时间, time(13));
  assert.deepEqual(due.世界.天气.生效时间, time(8));
  assert.deepEqual(due.世界.当前场景._上次更新场景时间, time(9));
});

test('业务天气生效时间没有被当作技术锚点过滤，显式真实生效时间可保留', () => {
  const before = seed();
  const result = settle(before, [
    { op: 'replace', path: '/世界/当前时间', value: time(10, 20) },
    { op: 'replace', path: '/世界/天气/天气状况', value: '雨' },
    { op: 'replace', path: '/世界/天气/生效时间', value: time(10, 10) },
  ]);
  assert.deepEqual(result.世界.天气.生效时间, time(10, 10));
  assert.deepEqual(result.世界.天气._上次检查时间, time(10, 20));
});

test('故事时钟未知时不从模型锚点制造日期', () => {
  const before = seed();
  before.世界.当前时间 = null;
  before.世界.当前场景._上次更新场景时间 = null;
  before.世界.天气._上次检查时间 = null;
  before.世界.天气.生效时间 = null;
  const result = settle(before, [
    { op: 'replace', path: '/世界/当前场景/环境状态', value: '窗外正下雨' },
    { op: 'replace', path: '/世界/天气/天气状况', value: '雨' },
    { op: 'replace', path: sceneAnchor, value: time(23) },
    { op: 'replace', path: weatherAnchor, value: time(23) },
  ]);
  assert.equal(result.世界.当前场景._上次更新场景时间, null);
  assert.equal(result.世界.天气._上次检查时间, null);
  assert.equal(result.世界.天气.生效时间, null);
});

test('finalizeWorld 自身也不保留候选中的伪造锚点', () => {
  const before = seed(), raw = copy(before);
  raw.世界.当前场景._上次更新场景时间 = time(23);
  raw.世界.天气._上次检查时间 = time(23);
  assert.deepEqual(finalizeWorld(before, raw), before);
});

test('系统版本、角色管理与蓝色精粹仍由原保护拒绝，不受锚点兼容影响', () => {
  const before = seed();
  for (const command of [
    { op: 'replace', path: '/_系统/数据版本', value: 99 },
    { op: 'replace', path: '/奇遇系统/_系统币', value: 9999 },
    { op: 'replace', path: '/角色/a/_管理/版本', value: 99 },
    { op: 'remove', path: '/奇遇系统/_系统币' },
    { op: 'add', path: '/世界/当前场景/_私有状态', value: '新增的非默认管理字段' },
  ]) {
    assert.throws(() => candidate(before, [
      { op: 'replace', path: sceneAnchor, value: '坏时间' }, command,
    ]), /脚本管理字段/);
  }
});

test('父对象替换内夹带其他私有字段篡改不会被修复或被 schema 默默丢弃', () => {
  const before = seed(), value = copy(before);
  value.世界.当前场景._上次更新场景时间 = '坏时间';
  value._系统.数据版本 = 99;
  assert.throws(() => candidate(before, [{ op: 'replace', path: '', value }]), /脚本管理字段.*_系统/);
  const scene = copy(before.世界.当前场景);
  scene._上次更新场景时间 = null;
  scene._上次检查时间 = time(23); // Same leaf name, different full path: not a supported anchor.
  assert.throws(() => candidate(before, [{ op: 'replace', path: '/世界/当前场景', value: scene }]), /非默认脚本管理字段/);
});

test('金币未有交易凭据就增加仍然拒绝，兼容层不改变结算约束', () => {
  const before = seed();
  assert.throws(() => candidate(before, [
    { op: 'replace', path: weatherAnchor, value: time(23) },
    { op: 'replace', path: '/玩家/资金/余额分', value: 999999 },
  ]), /金币余额与交易未一致结算/);
});

test('异常业务父对象不被补锚点掩盖，跨字段 move 也不被整体吞掉', () => {
  const before = seed();
  for (const value of [null, 123, [], '坏场景']) {
    const commands = [{ op: 'replace', path: '/世界/当前场景', value }];
    assert.deepEqual(normalizeWorldAnchorPatches(before, commands), commands);
    assert.throws(() => candidate(before, commands));
  }
  const commands = [{ op: 'move', from: '/奇遇系统/_系统币', path: sceneAnchor }];
  assert.deepEqual(normalizeWorldAnchorPatches(before, commands), commands);
  const moved = copy(before);
  delete moved.奇遇系统._系统币;
  moved.世界.当前场景._上次更新场景时间 = 0;
  assert.throws(() => validateModel(before, restoreWorldAnchors(before, moved)), /脚本管理字段.*_系统币/);
});
