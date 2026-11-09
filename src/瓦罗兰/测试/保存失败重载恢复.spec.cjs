const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const { test } = require('node:test'), assert = require('node:assert/strict');
const fixture = path.join(__dirname, '保存读回与奇遇提交.spec.cjs'), harness = new Module(fixture, module);
harness.filename = fixture; harness.paths = Module._nodeModulePaths(__dirname);
const req = harness.require.bind(harness);
harness.require = name => name === 'node:test' ? { test() {} } : req(name);
harness._compile(fs.readFileSync(fixture, 'utf8').split('const goods =')[0] +
  '\nmodule.exports={environment,seed,copy,block,patch,endpoint,useInstalledSave,persistChat,deferred,until};', fixture);
const { environment, seed, copy, block, patch, endpoint, useInstalledSave, persistChat, deferred, until } = harness.exports;
const { createRuntime } = require('../运行/host.ts');
const { Schema } = require('../schema.ts');

async function reload(e, fromDisk = false) {
  await e.runtime.dispose();
  if (fromDisk) {
    e.vars = copy(e.diskChat[0].chat_metadata.variables);
    e.messages = e.diskChat.slice(1).map(m => ({ role: m.is_user ? 'user' : 'assistant', message: m.mes,
      data: copy(m.variables?.[m.swipe_id ?? 0] ?? {}), extra: copy(m.extra ?? {}),
      swipe_id: m.swipe_id, swipes: m.swipes, swipe_info: m.swipe_info,
      // 沿用原夹具：单候选以 data 为唯一状态，避免造出永远不随写入更新的副本。
      swipes_data: m.swipes ? m.variables : undefined }));
  }
  e.runtime = createRuntime();
  await e.runtime.start();
}
function rosterSeed() {
  const s = seed();
  for (let i = 0; i < 8; i++) s.角色['major' + i] = { 姓名: '合成人物' + i, 层级: '主要' };
  return Schema.parse(s);
}
const automatic = { characterAuto: true, variable: endpoint('variable'), phone: endpoint('phone') };
async function expectedFailure(operation, pattern) {
  await assert.rejects(operation, error => {
    console.error('[预期故障；隔离传输]', error);
    assert.match(String(error), pattern);
    return true;
  });
}

test('原生保存等待期间新增排队操作，不能误报已保存的正文或变量不一致', async () => {
  const e = environment(); await e.runtime.start();
  const gate = deferred(); let entered = false;
  useInstalledSave(e, undefined, async () => { if (!entered) { entered = true; await gate.promise; } });
  const first = e.runtime.send('第一条合成输入').then(() => null, error => error);
  await until(() => entered);
  const second = e.runtime.phoneAction({ kind: 'refresh', id: 'chat' }).then(() => null, error => error);
  gate.resolve();
  try {
    assert.equal(await first, null);
    assert.equal(await second, null);
    assert.equal(e.messages.filter(m => m.role === 'user').length, 1);
    assert.equal(e.calls.filter(c => c.kind === 'story').length, 1);
  } finally { await e.runtime.dispose(); }
});

for (const stage of ['candidate', 'clear', 'retry-context']) test(`名单${stage}保存失败后重载，保留原请求及journal，直接重试`, async () => {
  const e = environment(rosterSeed(), automatic); await e.runtime.start();
  let fault = true, observed = false;
  useInstalledSave(e, () => {
    const j = e.vars.澄湾待确认提交;
    if (String(j?.commitId).startsWith('character_roster_')) observed = true;
    return fault && observed && (stage !== 'clear'
      ? !!e.messages[0].data.stat_data._系统.提交记录[j?.commitId] : j === null) && 'http';
  });
  try {
    await expectedFailure(e.runtime.send('检查环境'), /保存未确认/);
    const id = e.vars.澄湾失败请求.id, journal = copy(e.vars.澄湾待确认提交);
    const snapshots = Object.keys(e.vars.澄湾角色库.snapshots).length;
    fault = false;
    await reload(e);
    assert.equal(e.vars.澄湾失败请求?.id, id, e.runtime.view.error);
    assert.equal(e.vars.澄湾待确认提交?.commitId, journal.commitId);
    if (stage === 'retry-context') {
      let failedAgain = false;
      useInstalledSave(e, () => {
        if (!failedAgain && e.vars.澄湾待确认提交 === null &&
            e.vars.澄湾失败请求.context.version === e.messages[0].data.stat_data._系统.数据版本) {
          failedAgain = true; return 'http';
        }
        return false;
      });
      await expectedFailure(e.runtime.retry(), /保存未确认/);
      await reload(e, true);
      assert.equal(e.vars.澄湾失败请求?.id, id, e.runtime.view.error);
    }
    await e.runtime.retry();
    assert(e.state()._系统.提交记录[id]);
    assert(e.state()._系统.提交记录[journal.commitId]);
    assert.equal(Object.keys(e.vars.澄湾角色库.snapshots).length, snapshots);
    assert.equal(e.calls.filter(c => c.kind === 'story').length, 1);
    assert.equal(e.messages.filter(m => m.role === 'user').length, 1);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
  } finally { await e.runtime.dispose(); }
});

for (const retryFault of ['none', 'clear', 'context']) test(`资料选择保存失败从磁盘重载，并在恢复${retryFault}阶段再次失败后直接重试`, async () => {
  const e = environment(seed(), { ...automatic, characterAuto: false, informationAuto: true });
  await e.runtime.start(); let fault = true;
  useInstalledSave(e, () => {
    if (fault && e.messages[0].data.stat_data._系统.资料加载.选择依据?.startsWith('story:')) {
      fault = false; return 'http';
    }
    return false;
  });
  e.update = async config => e.runtime.view.phase === 'information' ? JSON.stringify({ 地点: [], 组织: [] }) : block([]);
  try {
    await expectedFailure(e.runtime.send('选择资料'), /保存未确认/);
    const id = e.vars.澄湾失败请求.id, journalId = e.vars.澄湾待确认提交.commitId;
    await reload(e, true);
    assert.equal(e.vars.澄湾失败请求?.id, id, e.runtime.view.error);
    if (retryFault !== 'none') {
      let secondFault = false;
      useInstalledSave(e, () => {
        if (!secondFault && e.vars.澄湾待确认提交 === null && (retryFault === 'clear' ||
          e.vars.澄湾失败请求.context.version === e.messages[0].data.stat_data._系统.数据版本)) {
          secondFault = true; return 'http';
        }
        return false;
      });
      await expectedFailure(e.runtime.retry(), /保存未确认/);
      await reload(e, true);
      assert.equal(e.vars.澄湾失败请求?.id, id, e.runtime.view.error);
    }
    await e.runtime.retry();
    assert(e.state()._系统.提交记录[id]); assert(e.state()._系统.提交记录[journalId]);
    assert.equal(e.calls.filter(c => c.stage === 'information').length, 1);
    assert.equal(e.messages.filter(m => m.role === 'user').length, 1);
  } finally { await e.runtime.dispose(); }
});

for (const orphan of [false, true]) test(`刷新不让中断任务整理使已有正文及原提交失效，缺pending=${orphan}`, async () => {
  const s = rosterSeed();
  s._系统.任务.interrupted = Schema.shape._系统.unwrap().shape.任务.unwrap().valueType.parse({
    类别: '生活更新', 目标id: ['major0'], 目标版本: { major0: s.角色.major0._管理.版本 }, 状态: '生成中', 提交id: 'interrupted_commit',
  });
  const e = environment(s); await e.runtime.start();
  // 已持久化的旧任务状态；只在下次启动进入中断整理分支。
  e.messages[0].data.stat_data._系统.任务.interrupted = s._系统.任务.interrupted;
  e.update = async () => { throw Error('预期故障：变量请求 HTTP 500'); };
  try {
    await expectedFailure(e.runtime.send('保留正文'), /HTTP 500/);
    const id = e.vars.澄湾待更新正文.id, text = e.messages[2].message;
    if (orphan) delete e.vars.澄湾待更新正文;
    e.saveDisk(); await reload(e, true);
    assert.equal(e.vars.澄湾待更新正文?.id, id, e.runtime.view.error);
    e.update = async () => block([patch('/玩家/当前状态/体力值', 79)]);
    await e.runtime.retry();
    assert.equal(e.messages[2].message, text);
    assert.equal(e.calls.filter(c => c.kind === 'story').length, 1);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
  } finally { await e.runtime.dispose(); }
});

for (const changed of ['source', 'state']) for (const preparation of ['roster', 'information'])
test(`${preparation}恢复仍拒绝真实${changed}变更，不用旧结果覆盖`, async () => {
  const e = environment(rosterSeed(), { ...automatic, informationAuto: preparation === 'information',
    characterAuto: preparation === 'roster' });
  await e.runtime.start(); let fault = true;
  useInstalledSave(e, () => {
    const journal = e.vars.澄湾待确认提交;
    if (fault && journal && e.messages[0].data.stat_data._系统.提交记录[journal.commitId]) {
      fault = false; return 'http';
    }
    return false;
  });
  e.update = async config => e.runtime.view.phase === 'information' ? JSON.stringify({ 地点: [], 组织: [] }) : block([]);
  try {
    await expectedFailure(e.runtime.send('原始输入'), /保存未确认/);
    if (changed === 'source') e.messages[1].message = '实际编辑的新输入';
    else e.messages[0].data.stat_data.玩家.当前状态.体力值 = 78;
    const before = copy(e.messages), calls = e.calls.length;
    await expectedFailure(e.runtime.retry(), /源消息|上下文/);
    assert.deepEqual(e.messages, before); assert.equal(e.calls.length, calls);
  } finally { await e.runtime.dispose(); }
});

for (const corrupt of ['queue', 'pending', 'state']) test(`允许队列并发变化仍拒绝服务端${corrupt}丢失或篡改`, async () => {
  const e = environment();
  e.vars.澄湾排队操作 = [{ id: 'old' }]; e.vars.澄湾待更新正文 = { id: 'original' };
  useInstalledSave(e, undefined, async () => { e.vars.澄湾排队操作.push({ id: 'new' }); });
  e.readDisk = () => {
    const rows = copy(e.diskChat);
    if (corrupt === 'queue') rows[0].chat_metadata.variables.澄湾排队操作 = [{ id: 'corrupted' }];
    if (corrupt === 'pending') rows[0].chat_metadata.variables.澄湾待更新正文 = null;
    if (corrupt === 'state') rows[1].variables[0].stat_data.玩家.当前状态.体力值 = 1;
    return Response.json(rows);
  };
  await expectedFailure(persistChat(), /保存未确认/);
});

for (const channel of ['story', 'phone']) test(`${channel}候选写入后保存失败，从磁盘重载只提交已备妥结果`, async () => {
  const e = environment(); await e.runtime.start(); let fault = true;
  useInstalledSave(e, () => {
    const p = channel === 'story' ? e.vars.澄湾待更新正文 : e.vars.澄湾待更新手机;
    if (fault && p && e.messages.at(-1).data?.stat_data?._系统?.提交记录?.[p.id]) {
      fault = false; return 'http';
    }
    return false;
  });
  e.update = async () => block([patch('/玩家/当前状态/体力值', 79)]);
  try {
    await expectedFailure(channel === 'story' ? e.runtime.send('候选写入故障') :
      e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '候选写入故障' }), /保存未确认/);
    const p = channel === 'story' ? e.vars.澄湾待更新正文 : e.vars.澄湾待更新手机;
    const id = p.id, calls = e.calls.length;
    await reload(e, true);
    e.update = async () => { throw Error('不得重发已有候选的模型请求'); };
    await e.runtime.retry();
    assert.equal(e.calls.length, calls); assert(e.state()._系统.提交记录[id]);
    assert.equal(e.state().玩家.当前状态.体力值, 79);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
  } finally { await e.runtime.dispose(); }
});

test('手机名单第一阶段快照保存失败，无journal时仍可从原排队操作直接重试', async () => {
  const e = environment(rosterSeed(), automatic); await e.runtime.start(); let fault = true;
  useInstalledSave(e, () => {
    if (fault && e.vars.澄湾角色库 && !e.vars.澄湾待确认提交) { fault = false; return 'http'; }
    return false;
  });
  try {
    await expectedFailure(e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '保留手机操作' }), /保存未确认/);
    assert(!e.vars.澄湾待确认提交); assert(!e.vars.澄湾待更新手机);
    const id = e.vars.澄湾排队操作[0].id;
    await reload(e, true);
    const result = await e.runtime.retry();
    assert.equal(result.id, id); assert.equal(result.status, 'confirmed');
    assert(e.state()._系统.提交记录[id]);
    assert.equal(e.calls.length, 1);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
  } finally { await e.runtime.dispose(); }
});

for (const channel of ['story', 'variables', 'knowledge', 'phone']) test(`${channel}请求500后刷新直接重试，不重发玩家消息或重复生成已存正文`, async () => {
  const e = environment(seed(), { ...automatic, characterAuto: false, informationAuto: channel === 'knowledge' });
  await e.runtime.start(); let fault = true;
  const response = purpose => {
    if (fault && purpose === channel) throw Error('Got response status 500');
    return purpose === 'story' ? '合成测试正文' : purpose === 'knowledge' ? JSON.stringify({ 地点: [], 组织: [] }) : block([]);
  };
  e.story = async () => response('story');
  e.update = async config => response(e.runtime.view.phase === 'information' ? 'knowledge' : channel === 'phone' ? 'phone' : 'variables');
  try {
    await expectedFailure(channel === 'phone' ? e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '合成手机输入' }) :
      e.runtime.send('合成正文输入'), /Got response status 500/);
    const pending = e.vars.澄湾待更新正文 ?? e.vars.澄湾待更新手机 ?? e.vars.澄湾失败请求;
    const id = pending.id;
    fault = false; await reload(e, true);
    await e.runtime.retry();
    assert(e.state()._系统.提交记录[id]);
    assert.equal(e.messages.filter(m => m.role === 'user').length, channel === 'phone' ? 0 : 1);
    assert.equal(e.calls.filter(c => c.kind === 'story').length, channel === 'story' ? 2 : channel === 'phone' ? 0 : 1);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
  } finally { await e.runtime.dispose(); }
});
