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
const { registerMvuSchema, assertMvuCommandResult } = require('../运行/mvu-schema.ts');
global.klona = require('klona').klona;

function useRealSchema(e, { notify = false, collect = false } = {}) {
  const notifications = [], collected = [], candidates = [];
  global.$ = () => ({ prop: () => notify });
  global.toastr = { warning: (...args) => notifications.push(args), error: (...args) => notifications.push(args) };
  registerMvuSchema(Schema);
  const apply = e.listeners.get('mag_command_parsed_for_zod');
  const end = e.listeners.get('mag_command_parsed_ended_for_zod');
  Mvu.parseMessage = async (text, old) => {
    const candidate = copy(old);
    const commands = require('../运行/message-protocol.ts').updateBlock(text).commands.map(command => {
      assert.equal(command.op, 'replace');
      return { type: 'set', args: [command.path.slice(1).replaceAll('/', '.'), JSON.stringify(command.value)], full_match: JSON.stringify(command) };
    });
    apply(candidate, commands, text, collect ? error => collected.push(error) : undefined);
    end(candidate, commands);
    candidates.push(candidate);
    return candidate;
  };
  return { notifications, collected, candidates };
}

for (const mode of [{}, { notify: true }, { collect: true }])
  test(`真实Zod处理器拒绝整轮并保留原ID重试：${JSON.stringify(mode)}`, async () => {
    await withEnv(async e => {
      const schema = useRealSchema(e, mode), before = copy(e.state());
      e.update = async () => block([
        patch('/世界/当前时间', { ...time(1), 月: 99 }),
        patch('/玩家/当前状态/体力值', 79),
      ]);
      await assert.rejects(e.runtime.send('非法日期与合法体力混合'), /发生变量更新错误/);
      const id = e.vars.澄湾待更新正文.id;
      assert.equal(e.state().玩家.当前状态.体力值, before.玩家.当前状态.体力值);
      assert.deepEqual(e.state().世界.当前时间, before.世界.当前时间);
      assert(!e.state()._系统.已计轮事件[id]);
      assert.match(e.vars.澄湾最近解析失败.error, /发生变量更新错误/);
      assert.equal(schema.notifications.length, mode.notify ? 1 : 0);
      assert.equal(schema.collected.length, mode.collect ? 1 : 0);
      assert(!JSON.stringify(schema.candidates[0]).includes('valoran.mvu.commandErrors'));
      e.update = async () => block([patch('/玩家/当前状态/体力值', 79)]);
      await e.runtime.retry();
      assert.equal(e.calls.filter(call => call.kind === 'story').length, 1);
      assert.equal(e.state().玩家.当前状态.体力值, 79);
      assert(e.state()._系统.提交记录[id]);
      assert(e.state()._系统.已计轮事件[id]);
      assert.equal(e.vars.澄湾待更新正文, null);
    });
  });

for (const patches of [[], [patch('/世界/当前时间', time(0))]])
  test(`真实Zod处理器合法无变化仍完成：${JSON.stringify(patches)}`, async () => {
    await withEnv(async e => {
      useRealSchema(e);
      e.update = async () => block(patches);
      await e.runtime.send('合法无变化');
      assert.equal(e.vars.澄湾待更新正文, null);
      assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
      assert(!e.vars.澄湾最近解析失败);
    });
  });

test('手机Zod失败保留原请求，不提交混合补丁中的合法部分', async () => {
  await withEnv(async e => {
    useRealSchema(e);
    e.update = async () => block([patch('/世界/当前时间', { ...time(1), 月: 99 }), patch('/玩家/当前状态/体力值', 79)]);
    await assert.rejects(e.runtime.phoneAction({ kind: 'refresh', id: 'chat' }), /发生变量更新错误/);
    assert.equal(e.runtime.view.phoneRequest.status, 'failed');
    assert.equal(e.state().玩家.当前状态.体力值, 80);
    const id = e.runtime.view.phoneRequest.id;
    e.update = async () => block([]);
    await e.runtime.retry();
    assert(e.state()._系统.提交记录[id]);
  });
});

test('候选错误标记不进入序列化，其他候选不受影响', () => {
  const e = environment(seed()), schema = useRealSchema(e);
  const apply = e.listeners.get('mag_command_parsed_for_zod');
  const invalid = { stat_data: seed() }, valid = { stat_data: seed() };
  apply(invalid, [{ type: 'set', args: ['世界.当前时间.月', '99'], full_match: 'invalid-month' }]);
  assert.doesNotThrow(() => assertMvuCommandResult(valid));
  assert.throws(() => assertMvuCommandResult(invalid), /invalid-month/);
  assert.equal(Object.getOwnPropertySymbols(invalid).length, 0);
  assert.equal(schema.notifications.length, 0);
});

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
