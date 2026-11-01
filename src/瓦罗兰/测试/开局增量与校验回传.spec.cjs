const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const assert = require('node:assert/strict'), { test } = require('node:test');
const file = path.join(__dirname, '双API流程.spec.cjs'), harness = new Module(file, module);
harness.filename = file; harness.paths = Module._nodeModulePaths(__dirname);
const nativeRequire = harness.require.bind(harness);
harness.require = name => name === 'node:test' ? { test() {} } : nativeRequire(name);
harness._compile(fs.readFileSync(file, 'utf8').split('const novelGoodReply =')[0] +
  '\nmodule.exports={environment,withEnv,seed,block,patch,time,Schema,copy};', file);
const { environment, withEnv, seed, block, patch, time, Schema, copy } = harness.exports;
const { planOpeningCharacters } = require('../运行/opening.ts');
const { validateTaskResult } = require('../运行/tasks.ts');

test('开局资料已经满足要求时，无业务变化仍可完成原任务', () => {
  const state = planOpeningCharacters(seed(), [], true);
  const [id, task] = Object.entries(state._系统.任务).find(([, t]) => t.类别 === '建档');
  task.目标id = ['npc']; task.目标版本 = { npc: state.角色.npc._管理.版本 };
  const before = copy(state), result = validateTaskResult(state, copy(state), id, true, true);
  assert.equal(result._系统.任务[id].状态, '已提交');
  assert.equal(result._系统.任务[id].提交id, task.提交id);
  assert.equal(result.玩家.姓名, state.玩家.姓名);
  assert.equal(result.角色.npc.当前状态, state.角色.npc.当前状态);
  assert.deepEqual(state, before);
});

test('开局空数组正常提交一次，后续请求不再携带建档任务', async () => {
  await withEnv(async e => {
    await e.runtime.createProfile({ player: { 姓名: '已填完整的玩家' }, characters: [] });
    const [id, task] = Object.entries(e.state()._系统.任务).find(([, t]) => t.类别 === '建档');
    const originalTaskCommit = task.提交id;
    e.update = async () => block([]);
    await e.runtime.startOpening();
    assert.equal(e.state()._系统.任务[id].状态, '已提交');
    assert.equal(e.state()._系统.任务[id].提交id, originalTaskCommit);
    assert.equal(e.vars.澄湾待更新正文, null);
    const rounds = Object.keys(e.state()._系统.已计轮事件).length;
    e.update = async config => {
      assert(!JSON.stringify(config).includes('本次建档变量整理'));
      return block([]);
    };
    await e.runtime.send('继续观察');
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, rounds + 1);
    assert.equal(e.state()._系统.任务[id].提交id, originalTaskCommit);
  }, Schema.parse({}));
});

test('MVU吞掉事件异常时仍报告真实拒绝，保留正文与原身份供变量重试', async () => {
  const initial = seed();
  initial.角色.npc.关系网.closed = { 姓名: '已关闭人物', 关系: '既有同事' };
  initial._系统.角色停用标识.closed = { 姓名: '已关闭人物' };
  const e = environment(Schema.parse(initial)), groups = new Map(), originalOn = global.eventOn;
  global.eventOn = (name, fn) => {
    const handle = originalOn(name, fn), listeners = groups.get(name) ?? [];
    listeners.push(fn); groups.set(name, listeners);
    return { stop() { listeners.splice(listeners.indexOf(fn), 1); handle.stop(); } };
  };
  await e.runtime.start();
  const parse = Mvu.parseMessage, swallowed = [];
  Mvu.parseMessage = async (text, old) => {
    const candidate = await parse(text, old);
    // Match Tavern's event emitter: a listener's rejection is logged, not returned.
    for (const listener of groups.get(Mvu.events.VARIABLE_UPDATE_ENDED) ?? []) {
      try { await listener(candidate, copy(old)); }
      catch (error) { swallowed.push(String(error)); }
    }
    return candidate;
  };
  try {
    e.update = async () => block([
      patch('/世界/当前时间', time(1)), patch('/角色/npc/关系网', {}),
    ]);
    await assert.rejects(e.runtime.send('打个招呼'), /关闭角色不清除他人既有关系/);
    assert.equal(swallowed.length, 1);
    assert.match(e.vars.澄湾最近解析失败.error, /关闭角色不清除他人既有关系/);
    const pendingId = e.vars.澄湾待更新正文.id;
    assert.equal(e.state().世界.当前时间.分, 0);
    assert.equal(e.state().角色.npc.关系网.closed.关系, '既有同事');
    e.update = async () => block([patch('/世界/当前时间', time(1))]);
    await e.runtime.retry();
    assert.equal(e.calls.filter(call => call.kind === 'story').length, 1);
    assert(e.state()._系统.提交记录[pendingId]);
    assert.equal(e.vars.澄湾待更新正文, null);
    assert.equal(e.state().世界.当前时间.分, 1);
    assert.equal(e.state().角色.npc.关系网.closed.关系, '既有同事');
  } finally {
    await e.runtime.dispose();
  }
});
