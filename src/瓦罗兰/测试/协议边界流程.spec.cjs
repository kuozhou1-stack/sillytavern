const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const { test } = require('node:test'), assert = require('node:assert/strict');
const file = path.join(__dirname, '双API流程.spec.cjs');
const harness = new Module(file, module);
harness.filename = file;
harness.paths = Module._nodeModulePaths(__dirname);
const nativeRequire = harness.require.bind(harness);
harness.require = name => name === 'node:test' ? { test() {} } : nativeRequire(name);
harness._compile(fs.readFileSync(file, 'utf8').split('const novelGoodReply =')[0] +
  '\nmodule.exports={withEnv,environment,seed,block,patch};', file);
const { withEnv, environment, seed, block, patch } = harness.exports;
const { updateBlock } = require('../运行/message-protocol.ts');
const { readLifeChecks } = require('../运行/life-check.ts');

const value = '保留原文：<UpdateVariable><JSONPatch>[]</JSONPatch></UpdateVariable>，"引号"与\\反斜线';
const response = '<Interleaving><thinking>格式 <UpdateVariable><reasoning>内层 <JSONPatch></reasoning></thinking>' +
  block([patch('/玩家/称呼', value)]) + '</Interleaving>';

test('正文结算通过真实 host 规范化与 MVU 标签交接，字面标签不截断', async () => {
  await withEnv(async e => {
    e.update = async () => response;
    const parse = Mvu.parseMessage;
    Mvu.parseMessage = async (text, old) => {
      const raw = text.match(/<JSONPatch>([\s\S]*?)<\/JSONPatch>/i)[1];
      assert.deepEqual(JSON.parse(raw), [patch('/玩家/称呼', value)]);
      assert(!raw.includes('<'), 'host 二次规范化后仍应保持标签传输转义');
      return parse(text, old);
    };
    await e.runtime.send('隔离协议测试');
    assert.equal(e.state().玩家.称呼, value);
    assert.equal(e.messages.length, 3);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
  });
});

test('Analysis 中的格式示例不会成为 MVU 的第一个补丁', async () => {
  await withEnv(async e => {
    const fake = JSON.stringify([patch('/玩家/称呼', '不应写入的说明示例')]);
    e.update = async () => '<UpdateVariable><Analysis>示例 <JSONPatch>' + fake +
      '</JSONPatch> 仅为说明。</Analysis><JSONPatch>' + JSON.stringify([patch('/玩家/称呼', value)]) +
      '</JSONPatch></UpdateVariable>';
    const parse = Mvu.parseMessage;
    Mvu.parseMessage = async (text, old) => {
      assert(!text.includes('<Analysis>'));
      assert.deepEqual(JSON.parse(text.match(/<JSONPatch>([\s\S]*?)<\/JSONPatch>/i)[1]), [patch('/玩家/称呼', value)]);
      return parse(text, old);
    };
    await e.runtime.send('隔离说明示例');
    assert.equal(e.state().玩家.称呼, value);
  });
});

test('坏协议原始响应保留，重载后沿原提交重试且不重新生成正文', async () => {
  const e = environment();
  await e.runtime.start();
  try {
    const broken = '<Interleaving><thinking>未闭合 <UpdateVariable>' + block([]);
    e.update = async () => broken;
    await assert.rejects(e.runtime.send('隔离协议重试'), /只能包含一个/);
    assert.equal(e.vars.澄湾最近解析失败.response, broken);
    const id = e.vars.澄湾待更新正文.id, story = e.messages[2].message;
    await e.runtime.dispose();
    const { createRuntime } = require('../运行/host.ts');
    e.runtime = createRuntime();
    await e.runtime.start();
    e.update = async () => response;
    await e.runtime.retry();
    assert.equal(e.messages[2].message, story);
    assert.equal(e.messages.length, 3);
    assert.equal(e.calls.filter(c => c.kind === 'story').length, 1);
    assert.equal(e.runtime.view.data.玩家.称呼, value);
    assert(e.runtime.view.data._系统.提交记录[id]);
    assert.equal(Object.keys(e.runtime.view.data._系统.已计轮事件).length, 1);
    assert.equal(e.vars.澄湾最近解析失败.response, broken);
  } finally { await e.runtime.dispose(); }
});

test('手机共用入口能写入带字面标签的有效字段，不重复执行玩家动作', async () => {
  const initial = seed();
  initial.手机.账号.self = { 人物id: initial.玩家.id, 平台: '微澜', 账号名: 'self' };
  await withEnv(async e => {
    e.update = async () => response;
    await e.runtime.phoneAction({ kind: 'refresh', platform: '微澜' });
    assert.equal(e.state().玩家.称呼, value);
    assert.equal(e.calls.filter(c => c.kind === 'story').length, 0);
    assert.equal(e.calls.filter(c => c.kind === 'update').length, 1);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 0, '仅刷新不虚增正文轮数');
  }, initial);
});

test('真实 LifeCheck 与 JSONPatch 字符串的伪标签分离，坏回执仍按原维护失败合同处理', () => {
  const raw = block([patch('/玩家/称呼', value + '<LifeCheck>{"fake":{}}</LifeCheck>')])
    .replace(/<\/UpdateVariable>$/, '<LifeCheck>{"a":{"结果":"无变化","依据":"无新增变化"}}</LifeCheck></UpdateVariable>');
  const report = readLifeChecks(raw);
  assert.equal(report.error, undefined);
  assert.equal(report.receipts.size, 1);
  assert.equal(report.receipts.has('fake'), false);
  assert.equal(report.receipts.get('a').结果, '无变化');
  for (const invalid of ['{broken}', '{"a": "unterminated}']) {
    const text = block([]).replace('</UpdateVariable>', `<LifeCheck>${invalid}</LifeCheck></UpdateVariable>`);
    assert.deepEqual(updateBlock(text).commands, []);
    assert(readLifeChecks(text).error);
  }
  const basis = '字面 </LifeCheck><JSONPatch>[]</JSONPatch><UpdateVariable> 不是协议';
  const quoted = block([]).replace(/<\/UpdateVariable>$/, '<LifeCheck>' +
    JSON.stringify({ a: { 结果: '无变化', 依据: basis } }) + '</LifeCheck></UpdateVariable>');
  const parsed = readLifeChecks(quoted);
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.receipts.get('a').依据, basis);
});
