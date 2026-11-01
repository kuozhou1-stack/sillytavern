const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const { test } = require('node:test');

// Use the current Runtime/Tavern fixture without registering its unrelated tests.
const harnessFile = path.join(__dirname, '双API流程.spec.cjs');
const harness = new Module(harnessFile, module);
harness.filename = harnessFile;
harness.paths = Module._nodeModulePaths(__dirname);
const nativeRequire = harness.require.bind(harness);
harness.require = name => name === 'node:test' ? { test() {} } : nativeRequire(name);
harness._compile(fs.readFileSync(harnessFile, 'utf8').split('const novelGoodReply =')[0] +
  '\nmodule.exports = { environment, block, Schema, copy };', harnessFile);
const { environment, block, Schema, copy } = harness.exports;
const { validateModel } = require('../运行/core.ts');
const { applyNovelAction } = require('../运行/novel-system.ts');
const { createRuntime } = require('../运行/host.ts');
const worldVersion = require('../运行/world-information.json').版本;

function seed(quest = {}) {
  return Schema.parse({
    _系统: { 建档完成: true, 存档id: 'nx08-isolated', 资料加载: { 资料版本: worldVersion } },
    世界: { 当前时间: { 年: 2026, 月: 10, 日: 31, 时: 10, 分: 0 } },
    玩家: { id: 'player', 姓名: '隔离玩家' },
    地点: { privateHome: { 名称: '未展开住所', 简介: '完整存档保留标记' } },
    奇遇系统: { _启用: true, 任务: { legacy: { 类型: '探索', ...quest } } },
  });
}

for (const [name, quest] of [
  ['名称为空', { 名称: '', 目标: '旧目标' }],
  ['目标为空', { 名称: '旧任务', 目标: '' }],
  ['两者为空', { 名称: '', 目标: '' }],
  ['仅含空白', { 名称: '  ', 目标: '\t' }],
]) test(`NX08 ${name}：原样旧任务不阻断天气更新，不清理旧值`, () => {
  const before = seed(quest), original = copy(before), candidate = copy(before);
  candidate.世界.天气.气温 = 26;
  const result = validateModel(before, candidate);
  assert.equal(result.世界.天气.气温, 26);
  assert.deepEqual(result.奇遇系统, before.奇遇系统);
  assert.deepEqual(result.地点, before.地点);
  assert.deepEqual(before, original);
});

test('NX08 新建不完整任务仍拒绝；原样旧空任务不能成为放行新任务的条件', () => {
  const before = seed();
  for (const quest of [{ 名称: '', 目标: '新目标' }, { 名称: '新任务', 目标: '' }]) {
    const candidate = copy(before);
    candidate.奇遇系统.任务.newQuest = Schema.parse({ 奇遇系统: { 任务: { q: quest } } }).奇遇系统.任务.q;
    assert.throws(() => validateModel(before, candidate), /任务名称与目标不能为空/);
  }
});

test('NX08 修改旧坏任务但未补齐仍拒绝，完整补齐可以保存', () => {
  const before = seed();
  for (const change of [{ 名称: '只补名称' }, { 目标: '只补目标' }, { 进展说明: '改了旧空任务' }]) {
    const candidate = copy(before);
    Object.assign(candidate.奇遇系统.任务.legacy, change);
    assert.throws(() => validateModel(before, candidate), /任务名称与目标不能为空/);
  }
  const complete = copy(before);
  Object.assign(complete.奇遇系统.任务.legacy, { 名称: '已补齐任务', 目标: '已补齐目标' });
  assert.equal(validateModel(before, complete).奇遇系统.任务.legacy.名称, '已补齐任务');
});

test('NX08 把正常任务改空仍拒绝，未接取进度与手动接取限制保持', () => {
  const before = seed({ 名称: '旧任务', 目标: '旧目标' });
  const emptied = copy(before);
  emptied.奇遇系统.任务.legacy.目标 = '';
  assert.throws(() => validateModel(before, emptied), /任务名称与目标不能为空/);
  const progressed = seed(), candidate = copy(progressed);
  candidate.奇遇系统.任务.legacy.进度 = 1;
  assert.throws(() => validateModel(progressed, candidate), /未接取任务不能提前完成/);
  assert.throws(() => applyNovelAction(seed(), { kind: 'accept', id: 'legacy', operationId: 'nx08-accept' }), /任务名称或目标不完整/);
});

test('NX08 不跳过已接取定义保护，也不把旧空任务从原数量限制中删去', () => {
  const accepted = applyNovelAction(seed({ 名称: '已接任务', 目标: '原目标' }), {
    kind: 'accept', id: 'legacy', operationId: 'nx08-valid-accept',
  });
  const changed = copy(accepted);
  changed.奇遇系统.任务.legacy.目标 = '';
  assert.throws(() => validateModel(accepted, changed), /模型不能改写或删除已接取任务/);
  const before = seed();
  const task = Schema.parse({ 奇遇系统: { 任务: { q: { 名称: '有效任务', 目标: '有效目标', 类型: '探索' } } } }).奇遇系统.任务.q;
  for (let i = 0; i < 7; i++) before.奇遇系统.任务['existing' + i] = { ...copy(task), 名称: '旧有效任务' + i };
  const weather = copy(before);
  weather.世界.天气.气温 = 26;
  assert.doesNotThrow(() => validateModel(before, weather));
  weather.奇遇系统.任务.ninth = copy(task);
  assert.throws(() => validateModel(before, weather), /可接取任务最多 8 项/);
});

test('NX08 正文变量失败后同ID重试，旧任务与完整状态经写入读回和模拟重载保留', async () => {
  const e = environment(seed());
  await e.runtime.start();
  try {
    const oldTask = copy(e.state().奇遇系统.任务.legacy);
    let fail = true;
    e.update = async () => {
      if (fail) { fail = false; throw Error('NX08合成变量失败'); }
      return block([{ op: 'replace', path: '/世界/天气/气温', value: 26 }]);
    };
    await assert.rejects(e.runtime.send('天气变化的隔离样本'), /NX08合成变量失败/);
    const id = e.vars.澄湾待更新正文.id, story = e.messages.at(-1).message;
    await e.runtime.retry();
    const saved = copy(e.state());
    assert.equal(saved.世界.天气.气温, 26);
    assert.deepEqual(saved.奇遇系统.任务.legacy, oldTask);
    assert.equal(saved.地点.privateHome.简介, '完整存档保留标记');
    assert.equal(e.messages.at(-1).message, story);
    assert.equal(e.calls.filter(c => c.kind === 'story').length, 1);
    assert.equal(e.calls.filter(c => c.kind === 'update').length, 2);
    assert.deepEqual(Object.keys(saved._系统.已计轮事件), [id]);
    assert(saved._系统.提交记录[id]);
    assert.deepEqual(e.messages.at(-1).data.stat_data, saved);
    assert.equal(e.vars.澄湾待更新正文, null);
    const calls = e.calls.length;
    await e.runtime.dispose();
    e.runtime = createRuntime();
    await e.runtime.start();
    assert.deepEqual(e.state(), saved);
    assert.equal(e.messages.at(-1).message, story);
    assert.equal(e.calls.length, calls);
  } finally { await e.runtime.dispose(); }
});

test('NX08 候选已写入但保存确认失败，同ID确认不重跑模型或计轮', async () => {
  const e = environment(seed());
  await e.runtime.start();
  try {
    let fail = true;
    global.SillyTavern.saveChat = async () => {
      if (fail && Object.keys(e.messages.at(-1).data?.stat_data?._系统?.已计轮事件 ?? {}).length) {
        fail = false;
        throw Error('NX08合成保存确认失败');
      }
     e.saveDisk(); };
    e.update = async () => block([{ op: 'replace', path: '/世界/天气/气温', value: 26 }]);
    await assert.rejects(e.runtime.send('保存确认隔离样本'), /NX08合成保存确认失败/);
    const id = e.vars.澄湾待更新正文.id, saved = copy(e.messages.at(-1).data.stat_data), calls = e.calls.length;
    await e.runtime.retry();
    assert.equal(e.calls.length, calls);
    assert.deepEqual(e.state(), saved);
    assert.deepEqual(Object.keys(e.state()._系统.已计轮事件), [id]);
    assert.equal(e.vars.澄湾待更新正文, null);
  } finally { await e.runtime.dispose(); }
});
