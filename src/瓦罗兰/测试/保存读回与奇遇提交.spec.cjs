const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), vm = require('node:vm');
const { test } = require('node:test'), assert = require('node:assert/strict');
const fixture = path.join(__dirname, '双API流程.spec.cjs'), harness = new Module(fixture, module);
harness.filename = fixture; harness.paths = Module._nodeModulePaths(__dirname);
const req = harness.require.bind(harness);
harness.require = name => name === 'node:test' ? { test() {} } : req(name);
harness._compile(fs.readFileSync(fixture, 'utf8').split('const novelGoodReply =')[0] +
  '\nmodule.exports={environment,seed,copy,block,patch,time,until,deferred,endpoint};', fixture);
const { environment, seed, copy, block, patch, time, until, deferred, endpoint } = harness.exports;
const { persistChat, chatSaveSnapshot } = require('../运行/chat-persistence.ts');
const ts = require('typescript');
const nativeFile = path.resolve(__dirname, '../../../../SillyTavern/public/script.js');
const nativeAst = ts.createSourceFile(nativeFile, fs.readFileSync(nativeFile, 'utf8'), ts.ScriptTarget.Latest, true);
const nativeSave = ['saveChat', 'saveChatConditional'].map(name => {
  const fn = nativeAst.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
  assert(fn, name); return fn.getText(nativeAst).replace(/^export\s+/, '');
}).join('\n');

// Actual installed save functions, synthetic transport and a separate disk image.
// A swallowed save error never updates that disk image.
function useInstalledSave(e, fail, waitUntilCondition = async () => {}) {
  const stats = { saves: 0, failed: 0, notifications: 0 };
  const context = vm.createContext({
    selected_group: null, characters: [{ chat: e.chat, name: 'fixture', avatar: 'fixture.png' }],
    this_chid: 0, name2: 'fixture', neutralCharacterName: 'neutral',
    compressRequest: async options => options, getRequestHeaders: () => ({}),
    fetch: async (_url, options) => {
      stats.saves++;
      const mode = fail?.();
      if (mode) {
        stats.failed++;
        if (mode === 'network') throw Error('synthetic network failure');
        return { ok: false, status: 503, statusText: 'synthetic HTTP failure', json: async () => ({ error: 'synthetic' }) };
      }
      e.diskChat = JSON.parse(options.body).chat;
      return { ok: true };
    },
    toastr: { error() { stats.notifications++; } }, console: { error() {}, warn() {}, trace() {} },
    t: (parts, ...args) => parts.map((p, i) => p + (args[i] ?? '')).join(''),
    waitUntilCondition, DEFAULT_SAVE_EDIT_TIMEOUT: 1000, isChatSaving: false,
    cancelDebouncedChatSave() {}, saveTokenCache() {}, saveItemizedPrompts() {}, getCurrentChatId: () => e.chat,
  });
  Object.defineProperties(context, {
    chat: { get: () => SillyTavern.chat }, chat_metadata: { get: () => ({ variables: copy(e.vars) }) },
  });
  vm.runInContext(nativeSave + '\nthis.actualSave=saveChatConditional;', context);
  SillyTavern.saveChat = context.actualSave;
  return stats;
}
const goods = () => JSON.stringify({ 商品: [{ 名称: '隔离商品', 价格: 12, 类别: '工具', 描述: '合成提交时序测试', 稀有: false }] });

for (const channel of ['story', 'phone']) for (const mode of ['network', 'http'])
test(`宿主吞掉${mode}保存错误仍拒绝${channel}确认，恢复后沿用原ID`, async () => {
  const e = environment(seed()); await e.runtime.start();
  let outage = false;
  const stats = useInstalledSave(e, () => outage && mode);
  e.update = async () => { outage = true; return block([patch('/玩家/当前状态/体力值', 79)]); };
  try {
    await assert.rejects(channel === 'story' ? e.runtime.send('保存故障合成输入')
      : e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '保存故障合成输入' }), /保存未确认/);
    const pending = channel === 'story' ? e.vars.澄湾待更新正文 : e.vars.澄湾待更新手机;
    assert(pending); assert(e.runtime.view.error); assert(stats.failed > 0); assert(stats.notifications > 0);
    const id = pending.id, calls = e.calls.length;
    outage = false;
    e.update = async () => { throw Error('不得重跑已收到的变量响应'); };
    await e.runtime.retry();
    assert.equal(e.calls.length, calls);
    assert.equal(e.state().玩家.当前状态.体力值, 79);
    assert(e.state()._系统.提交记录[id]);
    assert.equal(channel === 'story' ? e.vars.澄湾待更新正文 : e.vars.澄湾待更新手机, null);
    const disk = chatSaveSnapshot(e.diskChat.slice(1), e.diskChat[0].chat_metadata.variables);
    const live = chatSaveSnapshot(SillyTavern.chat, e.vars);
    assert.deepEqual(disk.messages, live.messages);
    const { 澄湾排队操作: deferredQueue = [], ...savedRecovery } = disk.recovery;
    const { 澄湾排队操作: _localQueue, ...liveRecovery } = live.recovery;
    assert.deepEqual(savedRecovery, liveRecovery);
    // Existing queue housekeeping is debounced. Durable commit IDs make any
    // not-yet-removed completed entries inert when the chat is reloaded.
    assert(deferredQueue.every(item => e.state()._系统.提交记录[item.id]));
  } finally { await e.runtime.dispose(); }
});

test('整轮断网在首个保存处停止，保留已输入消息和失败请求，不调用模型', async () => {
  const e = environment(seed()); await e.runtime.start();
  let outage = true; useInstalledSave(e, () => outage && 'network');
  try {
    await assert.rejects(e.runtime.send('保留未确认输入'), /保存未确认/);
    assert.equal(e.calls.length, 0); assert(e.vars.澄湾失败请求);
    const id = e.vars.澄湾失败请求.id;
    outage = false;
    await e.runtime.retry();
    assert.equal(e.messages.filter(m => m.role === 'user' && m.message === '保留未确认输入').length, 1);
    assert(e.state()._系统.提交记录[id]);
  } finally { await e.runtime.dispose(); }
});

for (const group of [false, true]) test(`服务端读回成功与HTTP错误均真实回传：群聊${group}`, async () => {
  const e = environment(seed());
  if (group) SillyTavern.groupId = 'synthetic-group';
  await persistChat(); assert.equal(e.diskReads, 1);
  e.readDisk = () => new Response('', { status: 503 });
  await assert.rejects(persistChat(), /服务端读回失败（HTTP 503）/);
  assert.equal(e.diskReads, 2, '每次保存只读一次，没有自动轮询');
  e.readDisk = () => { throw Error('synthetic read network failure'); };
  await assert.rejects(persistChat(), error => /无法读回服务端存档/.test(error.message) &&
    error.cause?.message === 'synthetic read network failure');
  assert.equal(e.diskReads, 3);
});

test('第三方元数据不影响保存确认；本卡正文、候选、变量和恢复记录的缺失均拒绝', async () => {
  const e = environment(seed());
  const nativeSave = SillyTavern.saveChat;
  SillyTavern.saveChat = async () => {
    await nativeSave(); e.diskChat[0].chat_metadata.variables.foreign = { changed: true };
    e.diskChat[1].extra.foreign = true;
  };
  await persistChat();
  for (const corrupt of [rows => { rows[1].mes = '旧正文'; },
    rows => { rows[1].variables[0].stat_data.玩家.当前状态.体力值 = 1; },
    rows => { rows[1].swipes = ['旧候选']; },
    rows => { rows[0].chat_metadata.variables.澄湾待确认提交 = { stale: true }; }]) {
    e.readDisk = () => { const rows = copy(e.diskChat); corrupt(rows); return Response.json(rows); };
    await assert.rejects(persistChat(), /服务端的正文、变量或恢复记录/);
  }
});

test('保存等候期间助手编号已写入原文与各候选，服务端逐项读回后可确认', async () => {
  const e = environment(seed());
  const row = e.messages[0];
  const planning = '<konatan_planning>候选计划</konatan_planning>\r\n';
  row.swipes = [row.message, planning + '另外一个候选'];
  useInstalledSave(e, undefined, async () => {
    row.message = '（第0楼）\n' + row.message;
    row.swipes = [row.message, planning + '（第0楼）\r\n另外一个候选'];
  });
  await persistChat();
  assert.equal(e.diskChat[1].mes, row.message);
  assert.deepEqual(e.diskChat[1].swipes, row.swipes);
});

test('保存回复和候选同时编号时，磁盘只写入其中一个字段不能确认', async () => {
  for (const reverted of ['mes', 'swipes[0]']) {
    const e = environment(seed());
    const row = e.messages[0], original = row.message;
    row.swipes = [original];
    useInstalledSave(e, undefined, async () => {
      row.message = '（第0楼）\n' + original;
      row.swipes[0] = row.message;
    });
    e.readDisk = () => {
      const rows = copy(e.diskChat);
      if (reverted === 'mes') rows[1].mes = original;
      else rows[1].swipes[0] = original;
      return Response.json(rows);
    };
    await assert.rejects(persistChat(), /服务端的正文、变量或恢复记录/);
    assert.equal(row.message, row.swipes[0]);
    assert.equal(e.diskReads, 1);
  }
});

test('保存读回仅磁盘多编号、用户或旁白被编号，以及编号夹带改文均拒绝', async () => {
  const e = environment(seed());
  const row = e.messages[0];
  for (const role of ['assistant', 'user', 'system']) {
    row.message = '未修改正文';
    row.role = role;
    row.swipes = [row.message];
    e.readDisk = () => {
      const rows = copy(e.diskChat);
      rows[1].mes = '（第0楼）\n' + rows[1].mes;
      if (role !== 'assistant') row.message = rows[1].mes;
      return Response.json(rows);
    };
    await assert.rejects(persistChat(), /本次保存不一致/);
  }
  row.role = 'assistant';
  e.readDisk = () => {
    const rows = copy(e.diskChat);
    row.swipes[0] = rows[1].swipes[0] = '（第0楼）\n真正编辑的候选内容';
    return Response.json(rows);
  };
  await assert.rejects(persistChat(), /本次保存不一致/);
});

for (const channel of ['story', 'phone']) test(`${channel}清除恢复记录保存失败，原记录保留且重试不再调用模型`, async () => {
  const e = environment(seed()); await e.runtime.start();
  const key = channel === 'story' ? '澄湾待更新正文' : '澄湾待更新手机';
  let observed = false, failed = false;
  useInstalledSave(e, () => {
    if (e.vars[key]) observed = true;
    if (observed && !failed && e.vars[key] === null) { failed = true; return 'http'; }
    return false;
  });
  try {
    await assert.rejects(channel === 'story' ? e.runtime.send('清除确认失败')
      : e.runtime.phoneAction({ kind: 'refresh', id: 'chat' }), /保存未确认/);
    assert(e.vars[key]); const id = e.vars[key].id, calls = e.calls.length;
    await e.runtime.retry();
    assert.equal(e.calls.length, calls); assert.equal(e.vars[key], null); assert(e.state()._系统.提交记录[id]);
  } finally { await e.runtime.dispose(); }
});

test('资料选择写入后保存失败，恢复原选择提交再更新failedSend上下文，不重选或重发输入', async () => {
  const e = environment(seed(), { characterAuto: false, informationAuto: true, variable: endpoint('variable'), phone: endpoint('phone') });
  await e.runtime.start(); let failed = false;
  useInstalledSave(e, () => {
    if (!failed && e.messages[0].data.stat_data._系统.资料加载.选择依据?.startsWith('story:')) {
      failed = true; return 'http';
    }
    return false;
  });
  e.update = async config => e.runtime.view.phase === 'information' ? JSON.stringify({ 地点: [], 组织: [] }) : block([]);
  try {
    await assert.rejects(e.runtime.send('资料保存合成输入'), /保存未确认/);
    assert(e.vars.澄湾待确认提交); assert(e.vars.澄湾失败请求);
    const id = e.vars.澄湾失败请求.id;
    const input = e.messages[1].message;
    e.messages[1].message = '恢复前编辑了输入';
    await assert.rejects(e.runtime.retry(), /源消息/);
    assert.equal(e.calls.filter(c => c.kind === 'story').length, 0);
    e.messages[1].message = input;
    await e.runtime.retry();
    assert(e.state()._系统.提交记录[id]); assert.equal(e.vars.澄湾失败请求, null);
    assert.equal(e.calls.filter(c => c.stage === 'information').length, 1);
    assert.equal(e.messages.filter(m => m.role === 'user' && m.message === '资料保存合成输入').length, 1);
  } finally { await e.runtime.dispose(); }
});

test('奇遇写入后的提交日志清除失败仍保留原日志，重试只确认同一提交', async () => {
  const e = environment(seed()); await e.runtime.start();
  await e.runtime.novelAction({ kind: 'enable', operationId: 'enable' }); e.update = async () => goods();
  let observed = false, failed = false;
  useInstalledSave(e, () => {
    if (e.vars.澄湾待确认提交) observed = true;
    if (observed && !failed && e.vars.澄湾待确认提交 === null) { failed = true; return 'http'; }
    return false;
  });
  try {
    await assert.rejects(e.runtime.novelRefresh('shop'), /保存未确认/);
    const id = e.vars.澄湾待确认提交?.commitId;
    assert(id); assert(e.state()._系统.提交记录[id]);
    await e.runtime.retry();
    assert.equal(e.calls.length, 1); assert.equal(Object.keys(e.state().奇遇系统._商店商品).length, 1);
    assert.equal(e.vars.澄湾待确认提交, null);
  } finally { await e.runtime.dispose(); }
});

for (const action of ['stop', 'edit']) test(`奇遇日志等待期间${action}不写入候选，恢复时也校验原消息`, async () => {
  const e = environment(seed()); await e.runtime.start();
  await e.runtime.novelAction({ kind: 'enable', operationId: 'enable' }); e.update = async () => goods();
  const gate = deferred(), journal = e.runtime.service.host.journal;
  let reached = false;
  e.runtime.service.host.journal = async value => { if (value) { reached = true; await gate.promise; } return journal(value); };
  const before = copy(e.messages[0].data.stat_data), originalText = e.messages[0].message;
  const operation = e.runtime.novelRefresh('shop').then(() => null, error => error);
  await until(() => reached); const writes = e.writes;
  if (action === 'stop') e.runtime.stop(); else e.messages[0].message = '日志保存期间编辑了源消息';
  gate.resolve();
  assert.match(String(await operation), action === 'stop' ? /取消|变化/ : /源消息/);
  assert.equal(e.writes, writes); assert.deepEqual(e.messages[0].data.stat_data, before);
  if (action === 'stop') assert.equal(e.vars.澄湾待确认提交, null);
  else {
    await assert.rejects(e.runtime.retry(), /源消息/); assert.equal(e.writes, writes);
    e.messages[0].message = originalText; await e.runtime.retry();
    assert.equal(Object.keys(e.state().奇遇系统._商店商品).length, 1);
    assert.equal(e.calls.length, 1, '从原提交日志恢复，不重新创作');
  }
  await e.runtime.dispose();
});

test('奇遇已发出变量写入后停止，确认原提交而不撤销或重复生成', async () => {
  const e = environment(seed()); await e.runtime.start();
  await e.runtime.novelAction({ kind: 'enable', operationId: 'enable' }); e.update = async () => goods();
  const gate = deferred(), write = e.runtime.service.host.write; let reached = false;
  e.runtime.service.host.write = async (...args) => { await write(...args); reached = true; await gate.promise; };
  const operation = e.runtime.novelRefresh('shop'); await until(() => reached);
  e.runtime.stop(); gate.resolve(); await operation;
  assert.equal(Object.keys(e.state().奇遇系统._商店商品).length, 1); assert.equal(e.calls.length, 1);
  assert.equal(e.vars.澄湾待确认提交, null); await e.runtime.dispose();
});
