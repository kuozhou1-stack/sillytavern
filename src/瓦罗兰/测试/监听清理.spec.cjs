const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), vm = require('node:vm');
const { test } = require('node:test'), assert = require('node:assert/strict'), ts = require('typescript');
const fixture = path.join(__dirname, '双API流程.spec.cjs'), harness = new Module(fixture, module);
harness.filename = fixture; harness.paths = Module._nodeModulePaths(__dirname);
const originalRequire = harness.require.bind(harness);
harness.require = name => name === 'node:test' ? { test() {} } : originalRequire(name);
harness._compile(fs.readFileSync(fixture, 'utf8').split('const novelGoodReply =')[0] +
  '\nmodule.exports={environment,seed,copy,block,patch,deferred};', fixture);
const { environment, seed, copy, block, patch, deferred } = harness.exports;
const { connectRuntime } = require('../运行/bridge.ts');
const tavern = path.resolve(__dirname, '../../../../SillyTavern');

// Use the installed Helper's real callback mapping and Tavern's emitter. The old
// fixture's working stop() handle would hide this defect. Model/save IO stays synthetic.
function installedEvents(e) {
  const diagnostics = [];
  const context = vm.createContext({ console: { debug() {}, trace() {}, error: (...args) => diagnostics.push(args) },
    localStorage: { getItem: () => null } });
  vm.runInContext(fs.readFileSync(path.join(tavern, 'public/lib/eventemitter.js'), 'utf8')
    .replace('export { EventEmitter }', '') + '\nthis.Emitter=EventEmitter;', context);
  const bus = new context.Emitter(['app_ready', 'app_initialized']), api = {}, frame = {};
  e.emitNativeSettings=data=>bus.emit(tavern_events.CHAT_COMPLETION_SETTINGS_READY,data);
  const dependencies = {
    '@/function/script': { _getButtonEvent: name => name },
    '@/function/util': { _getIframeName: () => 'valoran-cleanup-fixture' },
    '@/util/algorithm': { getOrSet: (map, key, make) => {
      if (!map.has(key)) map.set(key, make());
      return map.get(key);
    } },
    '@sillytavern/script': { eventSource: bus },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(tavern,
    'public/scripts/extensions/third-party/JS-Slash-Runner/src/function/event.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports: api, require: name => {
    assert(name in dependencies, name); return dependencies[name];
  } });
  global.eventOn = (event, listener) => {
    e.listeners.set(event, (...args) => bus.emit(event, ...args));
    return api._eventOn.call(frame, event, listener);
  };
  global.eventRemoveListener = (event, listener) => api._eventRemoveListener.call(frame, event, listener);
  for (const name of ['Once', 'MakeFirst', 'MakeLast'])
    window['event' + name] = (event, listener) => api['_event' + name].call(frame, event, listener);
  const parse = Mvu.parseMessage;
  Mvu.parseMessage = async (text, old) => {
    const candidate = await parse(text, old);
    await bus.emit(Mvu.events.VARIABLE_UPDATE_ENDED, candidate, copy(old));
    return candidate;
  };
  return { bus, diagnostics, count: name => bus.events[name]?.length ?? 0,
    total: () => Object.values(bus.events).reduce((sum, listeners) => sum + listeners.length, 0) };
}
function setup() {
  const e = environment(seed());
  return { e, events: installedEvents(e) };
}

test('原助手句柄缺口仍存在，按原回调取消普通监听可用', async () => {
  const { events } = setup(); let called = 0;
  const callback = () => called++;
  const handle = eventOn('control', callback);
  handle.stop();
  assert.equal(events.count('control'), 1);
  eventRemoveListener('control', callback);
  await events.bus.emit('control');
  assert.equal(called, 0);
  assert.equal(events.total(), 0);
});

test('连续正文与变量请求清理各自监听，流式正文正常且不接收其他请求片段', async () => {
  const { e, events } = setup(); await e.runtime.start();
  const base = events.total(); let observed = 0; e.presetBudget.should_stream=true;
  events.bus.on(tavern_events.CHAT_COMPLETION_SETTINGS_READY, () => observed++);
  try {
    for (let index = 0; index < 3; index++) {
      e.story = async config => {
        assert.equal(events.count(tavern_events.CHAT_COMPLETION_SETTINGS_READY), 1);
        assert.equal(config.should_stream, true);
        await events.bus.emit(iframe_events.STREAM_TOKEN_RECEIVED_FULLY, '本轮流式正文', config.generation_id);
        assert.equal(e.runtime.view.streaming, '本轮流式正文');
        await events.bus.emit(iframe_events.STREAM_TOKEN_RECEIVED_FULLY, '其他请求的片段', 'other-request');
        assert.equal(e.runtime.view.streaming, '本轮流式正文');
        return '已完成正文第' + index + '轮';
      };
      e.update = async config => {
        assert.equal(config.should_stream, false);
        assert.equal(events.count(tavern_events.CHAT_COMPLETION_SETTINGS_READY), 1);
        return block([patch('/玩家/当前状态/体力值', 79 - index)]);
      };
      await e.runtime.send('连续清理测试' + index);
      assert.equal(e.state().玩家.当前状态.体力值, 79 - index);
      assert.equal(events.count(tavern_events.CHAT_COMPLETION_SETTINGS_READY), 1);
      assert.equal(events.total(), base + 1);
    }
    assert.equal(observed, 6);
    assert.equal(e.parses, 3);
  } finally { await e.runtime.dispose(); }
  assert.equal(events.total(), 1, '仅移除本卡监听，保留其他调用方的监听');
});

for (const entry of ['立即重试', '从玩家楼重新发送'])
test(`${entry}会在保存回复前显示当前正文流，其他请求和变量分片保持隐藏`, async () => {
  const { e, events } = setup();
  e.presetBudget.should_stream = true;
  await e.runtime.start();
  try {
    let failedId;
    e.story = async config => { failedId = config.generation_id; throw Error('首次正文断线'); };
    await assert.rejects(e.runtime.send('流式回复测试'), /首次正文断线/);
    e.story = async config => {
      assert.equal(config.should_stream, true);
      assert.notEqual(config.generation_id, failedId);
      await events.bus.emit(iframe_events.STREAM_TOKEN_RECEIVED_FULLY, '旧请求分片', failedId);
      assert.equal(e.runtime.view.streaming, '');
      await events.bus.emit(iframe_events.STREAM_TOKEN_RECEIVED_FULLY, '重试正文的一段', config.generation_id);
      assert.equal(e.runtime.view.streaming, '重试正文的一段');
      assert.deepEqual(e.messages.map(row => row.role), ['assistant', 'user']);
      return '重试正文的一段，随后结束。';
    };
    e.update = async config => {
      await events.bus.emit(iframe_events.STREAM_TOKEN_RECEIVED_FULLY, '变量分片', config.generation_id);
      assert.equal(e.runtime.view.streaming, '');
      return block([]);
    };
    if (entry === '立即重试') await e.runtime.retry();
    else await e.runtime.messageAction('player_send', 1);
    assert.equal(e.messages[2].message, '重试正文的一段，随后结束。');
    assert.equal(e.runtime.view.streaming, '');
  } finally { await e.runtime.dispose(); }
});

for (const phase of ['story', 'update', 'phone'])
test(`${phase}失败和原身份重试后均无请求监听残留`, async () => {
  const { e, events } = setup(); await e.runtime.start();
  const base = events.total(); const reason = 'synthetic-' + phase;
  e[phase === 'phone' ? 'update' : phase] = async () => { throw Error(reason); };
  try {
    const action = phase === 'phone' ? () => e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '失败后重试' })
      : () => e.runtime.send('失败后重试');
    await assert.rejects(action(), new RegExp(reason));
    assert.equal(events.count(tavern_events.CHAT_COMPLETION_SETTINGS_READY), 0);
    assert.equal(events.total(), base);
    const storyCount = e.calls.filter(call => call.kind === 'story').length;
    e.story = async () => '重试完成的正文';
    e.update = async () => block([patch('/玩家/当前状态/体力值', 78)]);
    await e.runtime.retry();
    assert.equal(e.state().玩家.当前状态.体力值, 78);
    if (phase === 'update') assert.equal(e.calls.filter(call => call.kind === 'story').length, storyCount);
    assert.equal(events.total(), base);
  } finally { await e.runtime.dispose(); }
  assert.equal(events.total(), 0);
});

test('手机请求继续走原手机API，提交一次后释放监听', async () => {
  const { e, events } = setup(); await e.runtime.start(); const base = events.total();
  try {
    e.update = async config => {
      assert.equal(config.custom_api.model, 'phone');
      assert.equal(config.should_stream, false);
      return block([]);
    };
    const result = await e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '手机清理测试' });
    assert.equal(result.status, 'confirmed');
    assert.equal(e.calls.length, 1);
    assert.equal(Object.keys(e.state().手机.原文.消息).length, 1);
    assert.equal(events.total(), base);
  } finally { await e.runtime.dispose(); }
  assert.equal(events.total(), 0);
});

for (const channel of ['story', 'phone'])
test(`${channel}停止后迟到响应不提交，监听在请求结束时移除`, async () => {
  const { e, events } = setup(); await e.runtime.start(); const base = events.total();
  const entered = deferred(), gate = deferred();
  e[channel === 'phone' ? 'update' : 'story'] = async () => { entered.resolve(); return gate.promise; };
  const pending = (channel === 'phone'
    ? e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '停止清理测试' })
    : e.runtime.send('停止清理测试')).then(() => null, error => error);
  try {
    await entered.promise;
    e.runtime.stop(); gate.resolve(channel === 'phone' ? block([]) : '迟到的正文');
    assert(await pending instanceof Error);
    assert.equal(events.total(), base);
    assert.equal(events.count(tavern_events.CHAT_COMPLETION_SETTINGS_READY), 0);
    assert.equal(Object.keys(e.state().手机.原文.消息).length, 0);
  } finally { gate.resolve(''); await pending; await e.runtime.dispose(); }
  assert.equal(events.total(), 0);
});

test('原生准备依赖失败清理请求内容上下文，原错误继续显示',async()=>{const {e,events}=setup();await e.runtime.start();const base=events.total(),previous=getPreset;
 try{global.getPreset=()=>{throw Error('合成原生准备失败');};await assert.rejects(e.runtime.send('观察'),/合成原生准备失败/);
 assert.equal(events.total(),base);assert.equal(events.count(tavern_events.CHAT_COMPLETION_SETTINGS_READY),0);
 }finally{global.getPreset=previous;await e.runtime.dispose();}});

test('异步提示词处理完成后才继续正文与变量请求', async () => {
  const { e, events } = setup(); await e.runtime.start(); const base = events.total();
  const entered = deferred(), gate = deferred();
  const nativePreparation = async () => { entered.resolve(); await gate.promise; };
  eventOn(tavern_events.CHAT_COMPLETION_SETTINGS_READY, nativePreparation);
  const pending = e.runtime.send('等待异步准备');
  try {
    await entered.promise;
    assert.equal(e.calls.length, 0, '等待最终提示词处理时不能先调用模型');
    gate.resolve(); await pending;
    eventRemoveListener(tavern_events.CHAT_COMPLETION_SETTINGS_READY, nativePreparation);
    assert.deepEqual(e.calls.map(call => call.kind), ['story', 'update']);
    assert.equal(e.parses, 1);
    assert.equal(events.total(), base);
  } finally { gate.resolve(); await pending; await e.runtime.dispose(); }
});

for (const channel of ['story', 'phone'])
test(`${channel}处理中销毁运行实例，迟到结果不提交且最终无监听残留`, async () => {
  const { e, events } = setup(); await e.runtime.start();
  const entered = deferred(), gate = deferred();
  e[channel === 'phone' ? 'update' : 'story'] = async () => { entered.resolve(); return gate.promise; };
  const pending = (channel === 'phone'
    ? e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '销毁测试' })
    : e.runtime.send('销毁测试')).then(() => null, error => error);
  await entered.promise;
  const disposing = e.runtime.dispose();
  gate.resolve(channel === 'phone' ? block([]) : '迟到结果');
  assert(await pending instanceof Error); await disposing;
  assert.equal(events.total(), 0);
  assert.equal(Object.keys(e.state().手机.原文.消息).length, 0);
});

test('两个桌面连接分别注销，保留连接仍接收状态事件', async () => {
  const { e, events } = setup(); await e.runtime.start();
  window.parent.__chengwanService = { ready: true, runtime: e.runtime };
  const first = connectRuntime(e.runtime), second = connectRuntime(e.runtime);
  try {
    e.runtime.view.streaming = '连接前'; await events.bus.emit('chengwan:runtime_changed');
    assert.equal(first.runtime.view.streaming, '连接前');
    assert.equal(second.runtime.view.streaming, '连接前');
    first.disconnect(); assert.equal(events.count('chengwan:runtime_changed'), 1);
    e.runtime.view.streaming = '连接后'; await events.bus.emit('chengwan:runtime_changed');
    assert.equal(first.runtime.view.streaming, '连接前');
    assert.equal(second.runtime.view.streaming, '连接后');
  } finally { first.disconnect(); second.disconnect(); await e.runtime.dispose(); }
  assert.equal(events.total(), 0);
});

for (const kind of ['desktop', 'streaming'])
test(`${kind}入口pagehide按原回调清理，不再响应后续事件`, async () => {
  const { events } = setup();
  const names = kind === 'desktop' ? ['recover', 'recovery'] : ['onChatChanged', 'listener', 'dispose'];
  const file = path.join(__dirname, kind === 'desktop' ? '../界面/桌面端/index.ts' : '../脚本/流式同层/index.ts');
  const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const ready = ast.statements.find(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
    && node.expression.expression.getText(ast) === '$');
  const statements = ready.expression.arguments[0].body.statements.filter(node => {
    if (ts.isVariableStatement(node)) return node.declarationList.declarations.some(d => names.includes(d.name.getText(ast)));
    const text = node.getText(ast);
    return text.startsWith('eventOn(') || text.startsWith("$(window).one('pagehide.");
  });
  let hidden, reloads = 0;
  const host = { __chengwanService: { ready: true, chat: 'other-chat' } };
  const context = { eventOn, eventRemoveListener, tavern_events, SillyTavern: { getCurrentChatId: () => 'other-chat' },
    window: { parent: host, location: { reload() { reloads++; } } },
    $: value => value?.location ? { one(_event, callback) { hidden = callback; } } : { removeClass() {} },
    stopped: false, failed: true, chat: 'previous-chat', host, token: 'fixture',
    app: undefined, mount: undefined, connection: undefined,
    timer: 1, clearInterval() {}, stopSizing() {}, removeNativeControls() {}, style: { remove() {} },
    doc: { body: {} }, eventEmit: async () => {}, console };
  vm.runInNewContext(ts.transpileModule(statements.map(s => s.getText(ast)).join('\n'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  const event = kind === 'desktop' ? 'chengwan:runtime_changed' : tavern_events.CHAT_CHANGED;
  await events.bus.emit(event); assert.equal(reloads, 1);
  hidden(); assert.equal(events.count(event), 0);
  await events.bus.emit(event); assert.equal(reloads, 1);
});

function messageFrameFixture() {
  const { events } = setup(), { mountMessageFrame } = require('../界面/桌面端/utils/message-frame.ts');
  const host = { addEventListener() {}, removeEventListener() {} }, handlers = {};
  const child = { addEventListener: (event, fn) => { handlers[event] = fn; } };
  const frame = { ownerDocument: { defaultView: host, head: { querySelectorAll: () => [] } }, contentWindow: child,
    setAttribute() {}, addEventListener() {}, removeEventListener() {} };
  global.document = { baseURI: 'http://fixture.invalid/' };
  global.TavernHelper = {};
  global.errorCatched = fn => fn;
  global.cancelAnimationFrame = () => {};
  global.DOMParser = class { parseFromString() { return { createElement: () => ({}), head: { prepend() {} },
    documentElement: { outerHTML: '<html></html>' } }; } };
  const unmount = mountMessageFrame(frame, '<p>fixture</p>', 2);
  host.__cwMessageFrames[frame.id](child);
  return { events, child, handlers, unmount, host };
}
test('消息iframe句柄与卸载清理全部监听，包括原生once包装器', async () => {
  const { events, child, handlers, unmount } = messageFrameFixture();
  let called = 0;
  child.eventOn('widget-active', () => called++).stop();
  await events.bus.emit('widget-active'); assert.equal(called, 0);
  for (const method of ['eventOn', 'eventMakeFirst', 'eventMakeLast', 'eventOnce']) child[method](method, () => called++);
  handlers.pagehide(); unmount();
  for (const method of ['eventOn', 'eventMakeFirst', 'eventMakeLast']) assert.equal(events.count(method), 0);
  assert.equal(events.count('eventOnce'), 0, '原生once可按原始回调身份清理包装器');
  await events.bus.emit('eventOnce');
  assert.equal(called, 0, '已取消的子页回调不应再执行');
  assert.equal(events.total(), 0);
});


test('卡内消息iframe once按原函数取消并等待异步完成，并发emit只执行一次', async () => {
  const { events, child, unmount } = messageFrameFixture();
  let called = 0;
  const original = () => called++;
  child.eventOnce('cancelled', original);
  child.eventRemoveListener('cancelled', original);
  await events.bus.emit('cancelled');
  assert.equal(called, 0);
  const blocker = deferred();
  let completed = false;
  child.eventOnce('once', async () => { called++; await blocker.promise; completed = true; });
  const first = events.bus.emit('once');
  await events.bus.emit('once');
  assert.equal(called, 1);
  assert.equal(completed, false);
  blocker.resolve(); await first;
  assert.equal(completed, true);
  assert.equal(events.count('once'), 0);
  unmount();
});

test('消息iframe清理失败仍清理其他监听及文档桥，保留失败项供再次清理', () => {
  const { events, child, unmount, host } = messageFrameFixture();
  child.eventOn('bad-cleanup', () => {});
  child.eventOn('good-cleanup', () => {});
  const remove = global.eventRemoveListener;
  global.eventRemoveListener = (event, callback) => {
    if (event === 'bad-cleanup') throw Error('remove failed');
    return remove(event, callback);
  };
  try {
    assert.throws(unmount, error => error instanceof AggregateError && error.errors[0].message === 'remove failed');
    assert.equal(events.count('bad-cleanup'), 1);
    assert.equal(events.count('good-cleanup'), 0);
    assert.equal(host.__cwMessageFrames, undefined);
  } finally { global.eventRemoveListener = remove; }
  unmount();
  assert.equal(events.total(), 0);
});


test('消息iframe once在两次emit预先取得相同监听快照时只执行一次', async () => {
  const { events, child, unmount } = messageFrameFixture();
  const gate = deferred(); let called = 0;
  child.eventOn('snapshot', () => gate.promise);
  child.eventOnce('snapshot', () => called++);
  const first = events.bus.emit('snapshot'), second = events.bus.emit('snapshot');
  gate.resolve(); await Promise.all([first, second]);
  assert.equal(called, 1);
  unmount();
});

test('原生once按原函数注销仍失败，卡内包装不依赖该缺陷', async () => {
  const { events } = setup(); let called = 0;
  const original = () => called++;
  events.bus.once('native-counterexample', original);
  events.bus.removeListener('native-counterexample', original);
  await events.bus.emit('native-counterexample');
  assert.equal(called, 1);
});

for (const method of ['eventOn', 'eventOnce', 'eventMakeFirst', 'eventMakeLast'])
  test(`消息iframe ${method}接收原生就绪事件的即时回放并可清理`, async () => {
    const { events, child, unmount } = messageFrameFixture();
    for (const event of ['app_ready', 'app_initialized']) {
      await events.bus.emit(event, 'ready');
      const seen = [];
      child[method](event, value => seen.push(value));
      assert.deepEqual(seen, ['ready']);
      assert.equal(events.count(event), method === 'eventOnce' ? 0 : 1);
      await events.bus.emit(event, 'again');
      assert.deepEqual(seen, method === 'eventOnce' ? ['ready'] : ['ready', 'again']);
    }
    unmount();
    assert.equal(events.total(), 0);
  });

test('消息iframe first和last移动原回调，重复on或once保持现有监听', async () => {
  const { events, child, unmount } = messageFrameFixture();
  const seen = [], first = () => seen.push('A'), second = () => seen.push('B');
  const handle = child.eventOn('ordered', first);
  child.eventOn('ordered', second);
  child.eventOn('ordered', first);
  child.eventOnce('ordered', first);
  child.eventMakeLast('ordered', first);
  await events.bus.emit('ordered');
  assert.deepEqual(seen, ['B', 'A']);
  seen.length = 0;
  child.eventMakeFirst('ordered', first);
  await events.bus.emit('ordered');
  assert.deepEqual(seen, ['A', 'B']);
  handle.stop();
  seen.length = 0;
  await events.bus.emit('ordered');
  assert.deepEqual(seen, ['B']);
  unmount();
  assert.equal(events.total(), 0);
});

test('消息iframe once重排保持一次语义，同回调注销后可重新注册', async () => {
  const { events, child, unmount } = messageFrameFixture();
  let called = 0;
  const callback = () => called++;
  child.eventOnce('ordered-once', callback);
  child.eventMakeLast('ordered-once', callback);
  child.eventMakeFirst('ordered-once', callback);
  await events.bus.emit('ordered-once');
  await events.bus.emit('ordered-once');
  assert.equal(called, 1);
  child.eventOn('ordered-once', callback);
  await events.bus.emit('ordered-once');
  assert.equal(called, 2);
  unmount();
});

test('消息iframe即时回放中注销及抛错后没有遗留监听', async () => {
  const { events, child, unmount } = messageFrameFixture();
  await events.bus.emit('app_ready');
  const callback = () => child.eventRemoveListener('app_ready', callback);
  child.eventOn('app_ready', callback);
  assert.equal(events.count('app_ready'), 0);
  const fail = () => { throw Error('replay failed'); };
  assert.throws(() => child.eventOn('app_ready', fail), /replay failed/);
  assert.equal(events.count('app_ready'), 0);
  unmount();
});

test('消息iframe变量按顶层覆盖，删除与缩短数组不复活且返回值独立', () => {
  const { child, unmount } = messageFrameFixture();
  const scope = {
    global: { shared: { from: 'global' }, globalOnly: '保留' },
    character: { shared: { from: 'character' } },
    chat: { shared: { from: 'chat' } },
  };
  const messages = [
    { data: { stat_data: { 仓库: { 旧书: 1 }, 名单: ['甲', '乙'] }, earlierOnly: '保留' } },
    { data: { stat_data: { 仓库: {}, 名单: ['新'] }, shared: { from: 'message' } } },
  ];
  global.getVariables = ({ type }) => scope[type];
  global.getChatMessages = range => { assert.equal(range, '0-2'); return messages; };
  const actual = child.getAllVariables();
  assert.deepEqual(actual, { globalOnly: '保留', earlierOnly: '保留', shared: { from: 'message' },
    stat_data: { 仓库: {}, 名单: ['新'] } });
  actual.stat_data.名单.push('局部');
  actual.shared.from = '局部';
  assert.deepEqual(messages[1].data.stat_data.名单, ['新']);
  assert.equal(messages[1].data.shared.from, 'message');
  unmount();
});
