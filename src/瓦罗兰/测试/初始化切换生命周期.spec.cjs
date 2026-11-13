const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { environment, createRuntime, copy, deferred, until } = require('./修复宿主.cjs');
const { Schema } = require('../schema.ts');
const { registerPromptMacros } = require('../运行/prompt-context.ts');
const vue = require('vue');

// 执行完整辅助脚本及真实 Runtime。只有宿主事件、MVU、磁盘和模型边界使用隔离夹具。
function hostFixture() {
  const e = environment();
  const seed = copy(e.messages[0]);
  const chats = Object.fromEntries(['A', 'B'].map(chat => {
    const row = copy(seed);
    row.data.stat_data.玩家.姓名 = '聊天' + chat;
    row.data.stat_data = Schema.parse({ ...row.data.stat_data, _系统: {
      ...row.data.stat_data._系统, 存档id: 'save-' + chat, 数据版本: 12,
      已计轮事件: Object.fromEntries([1, 2].map(n => [chat + '-round-' + n, { 提交id: chat + '-commit-' + n }])),
      提交记录: Object.fromEntries([1, 2].map(n => [chat + '-commit-' + n, { 数据版本: 10 + n, 状态: '已持久保存' }])),
    } });
    return [chat, { messages: [row], vars: {} }];
  }));
  const host = window.parent;
  const events = new Map(), macros = new Set(), locks = new Set();
  const frames = [], runtimes = [], reloads = [];
  const changes = [];
  function switchData(chat) { e.chat = chat; e.messages = chats[chat].messages; e.vars = chats[chat].vars; }
  switchData('A');
  const register = (name, fn) => {
    if (!events.has(name)) events.set(name, new Set());
    events.get(name).add(fn);
    return { stop() { events.get(name)?.delete(fn); } };
  };
  const unregister = (name, fn) => events.get(name)?.delete(fn);
  global.eventOn = register;
  global.eventRemoveListener = unregister;
  global.eventEmit = async name => { for (const fn of [...events.get(name) ?? []]) await fn(); };
  global.registerMacroLike = () => {
    const token = {};
    macros.add(token);
    return { unregister() { macros.delete(token); } };
  };
  Object.defineProperty(global, 'navigator', { configurable: true, value: {
    locks: { request: async (name, options, fn) => {
      if (locks.has(name)) return fn(null);
      locks.add(name);
      try { return await fn({ name }); } finally { locks.delete(name); }
    } },
  } });
  const update = global.updateWorldbookWith;
  global.updateWorldbookWith = async (...args) => { changes.push(e.chat); return update(...args); };
  host.TavernHelper.updateWorldbookWith = global.updateWorldbookWith;
  const read = global.getWorldbook;
  let bookGate, bookEntered = false;
  global.getWorldbook = async (...args) => {
    if (bookGate && !bookEntered) {
      bookEntered = true;
      await bookGate.promise;
    }
    return read(...args);
  };
  const getVariables = global.getVariables;
  let floorReady = true;
  global.getVariables = option => option.type === 'message' && !floorReady ? {} : getVariables(option);
  const initial = copy(chats);
  function frame(name, { mvuGate } = {}) {
    let task, hide;
    const win = { parent: host, location: { reload() { reloads.push(name); } } };
    // Actual Runtime functions share the same current-chat host, as Tavern's exported APIs do.
    global.window = win;
    const context = {
      exports: {}, console, _, z,
      window: win, SillyTavern, getLastMessageId: global.getLastMessageId,
      getVariables: (...args) => global.getVariables(...args), tavern_events,
      eventOn: register, eventRemoveListener: unregister, eventEmit: global.eventEmit,
      waitGlobalInitialized: () => mvuGate?.promise ?? Promise.resolve(),
      initializeGlobal(name, runtime) { if (name === 'ChengwanRuntime') win.initialized = runtime; },
      errorCatched: fn => (...args) => { task = fn(...args); return task; },
      $: value => typeof value === 'function' ? value() : { one(_name, fn) { hide = fn; } },
      require(specifier) {
        if (specifier === '../../运行/host') return { activeContext: require('../运行/host.ts').activeContext,
          createRuntime() { const runtime = createRuntime(); runtimes.push({ name: name, runtime }); return runtime; } };
        if (specifier === '../../schema') return { Schema };
        if (specifier === '../../运行/prompt-context') return { registerPromptMacros };
        if (specifier === 'vue') return vue;
        return require(specifier);
      },
    };
    const file = path.join(__dirname, '../脚本/辅助API/index.ts');
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, context, { filename: file });
    const entry = { name, win, done: () => task, hide: () => hide?.() };
    frames.push(entry);
    return entry;
  }
  return { e, host, chats, initial, events, macros, locks, frames, runtimes, reloads, changes, frame,
    setChat: switchData,
    setChatName(chat) { e.chat = chat; },
    async change(chat) { switchData(chat); for (const fn of [...events.get('chat') ?? []]) await fn(chat); },
    holdBook() { bookGate = deferred(); return { release: () => bookGate.resolve(), entered: () => bookEntered }; },
    setFloorReady(value) { floorReady = value; },
    async close() {
      for (const f of frames) f.hide();
      await Promise.all(frames.map(f => f.done()));
      for (const item of runtimes) await item.runtime.dispose();
      await e.runtime.dispose();
    },
  };
}

function protectedState(h) {
  for (const chat of ['A', 'B']) {
    assert.deepEqual(h.chats[chat], h.initial[chat], chat + '原数据未改变');
    assert.equal(Object.keys(h.chats[chat].messages[0].data.stat_data._系统.已计轮事件).length, 2);
  }
  assert.equal(h.e.calls.length, 0);
  assert.equal(h.e.writes, 0);
}

for (const waiting of ['MVU', '首楼变量']) {
  test(waiting + '等待期间切换聊天，新聊天接管一次，旧等待返回不能覆盖', async () => {
    const h = hostFixture(), gate = deferred();
    if (waiting === '首楼变量') h.setFloorReady(false);
    const a = h.frame('A', waiting === 'MVU' ? { mvuGate: gate } : {});
    try {
      await until(() => !!h.host.__chengwanService);
      await h.change('B');
      assert.deepEqual(h.reloads, ['A']);
      assert.equal(h.macros.size, 0);
      h.setFloorReady(true);
      const b = h.frame('B');
      await b.done();
      const slot = h.host.__chengwanService;
      gate.resolve();
      await a.done();
      assert.equal(h.host.__chengwanService, slot);
      assert.equal(slot.chat, 'B');
      assert.equal(slot.ready, true);
      assert.equal(slot.runtime.view.data.玩家.姓名, '聊天B');
      assert.deepEqual(h.runtimes.map(r => r.name), ['B']);
      assert.equal(h.macros.size, 2);
      protectedState(h);
    } finally { gate.resolve(); h.setFloorReady(true); await h.close(); }
  });
}

for (const waiting of ['MVU', '初始化后半段']) {
  test(waiting + '等待先返回、CHAT_CHANGED稍后才发，仍由目标事件触发一次重载', async () => {
    const h = hostFixture(), gate = deferred();
    const book = waiting === '初始化后半段' ? h.holdBook() : null;
    const a = h.frame('A', book ? {} : { mvuGate: gate });
    try {
      if (book) await until(book.entered);
      // 酒馆先改聊天文件名；这时楼层仍属于原聊天，目标数据加载完才会发事件。
      h.setChatName('B');
      gate.resolve(); book?.release(); await a.done();
      assert.deepEqual(h.reloads, []);
      assert.equal(h.host.__chengwanService, undefined);
      assert.equal(h.events.get('chat').size, 1);
      await h.change('B');
      assert.deepEqual(h.reloads, ['A']);
      const b = h.frame('B'); await b.done();
      assert.equal(h.host.__chengwanService.chat, 'B');
      assert.equal(h.host.__chengwanService.runtime.view.data.玩家.姓名, '聊天B');
      assert.equal(h.events.get('edited').size, 1);
      protectedState(h);
    } finally { gate.resolve(); book?.release(); await h.close(); }
  });
}

test('初始化后半段切换释放旧写入权，不在返回后重装监听或发布旧服务', async () => {
  const h = hostFixture(), book = h.holdBook(), a = h.frame('A');
  try {
    await until(book.entered);
    const oldRuntime = h.host.__chengwanService.runtime;
    assert(h.locks.has('澄湾写入:A'));
    await h.change('B');
    assert.deepEqual(h.reloads, ['A']);
    const b = h.frame('B');
    await b.done();
    const slot = h.host.__chengwanService, changes = h.changes.length;
    book.release();
    await a.done();
    assert.equal(h.host.__chengwanService, slot);
    assert.equal(h.host.__chengwanRuntime, slot.runtime);
    assert.equal(slot.ready, true);
    assert.equal(slot.runtime.view.readOnly, false);
    assert.equal(h.locks.has('澄湾写入:A'), false);
    assert(h.locks.has('澄湾写入:B'));
    assert.equal(h.events.get('edited').size, 1);
    assert.equal(h.events.get('chat').size, 2);
    assert.equal(h.changes.length, changes);
    await assert.rejects(async () => oldRuntime.commit(s => { s.玩家.姓名 = '不能串入新聊天'; }), /失效/);
    protectedState(h);
  } finally { book.release(); await h.close(); }
});

test('就绪后双向切换，每次只重载一次，运行时不再重复要求重载', async () => {
  const h = hostFixture();
  try {
    const a = h.frame('A'); await a.done();
    await h.change('B'); await h.change('B');
    assert.deepEqual(h.reloads, ['A']);
    const b = h.frame('B'); await b.done();
    await h.change('A'); await h.change('A');
    assert.deepEqual(h.reloads, ['A', 'B']);
    const again = h.frame('A2'); await again.done();
    assert.equal(h.host.__chengwanService.chat, 'A');
    assert.equal(h.host.__chengwanService.ready, true);
    assert.equal(h.host.__chengwanService.runtime.view.data.玩家.姓名, '聊天A');
    assert.equal(h.events.get('edited').size, 1);
    assert.equal(h.macros.size, 2);
    protectedState(h);
  } finally { await h.close(); }
});

test('本聊天世界书准备错误仍保留可用错误页，切到健康聊天可正常接管', async () => {
  const h = hostFixture(), readBook = global.getWorldbook;
  global.getWorldbook = async (...args) => {
    if (h.e.chat === 'A') throw Error('聊天A的世界书准备失败');
    return readBook(...args);
  };
  try {
    const a = h.frame('A'); await a.done();
    assert.equal(h.host.__chengwanService.ready, true);
    assert.equal(h.host.__chengwanService.runtime.view.loadPhase, 'worldbook');
    assert.match(h.host.__chengwanService.runtime.view.loadError, /聊天A的世界书准备失败/);
    await h.change('B');
    assert.deepEqual(h.reloads, ['A']);
    a.hide();
    const b = h.frame('B'); await b.done();
    assert.equal(h.host.__chengwanService.chat, 'B');
    assert.equal(h.host.__chengwanService.ready, true);
    assert.equal(h.host.__chengwanService.runtime.view.loadError, '');
    assert.equal(h.events.get('edited').size, 1);
    assert.equal(h.macros.size, 2);
    protectedState(h);
  } finally { await h.close(); }
});

test('旧初始化被同聊天新实例接管，迟到返回与旧卸载不会删除新服务', async () => {
  const h = hostFixture(), book = h.holdBook(), a = h.frame('old');
  try {
    await until(book.entered);
    const old = h.host.__chengwanService.runtime;
    const b = h.frame('new'); await b.done();
    const slot = h.host.__chengwanService;
    assert.equal(slot.runtime.view.readOnly, false);
    assert.notEqual(slot.runtime, old);
    book.release(); await a.done(); a.hide();
    assert.equal(h.host.__chengwanService, slot);
    assert.equal(h.host.__chengwanRuntime, slot.runtime);
    assert.equal(h.events.get('edited').size, 1);
    assert.equal(h.macros.size, 2);
    assert.deepEqual(h.reloads, []);
    protectedState(h);
  } finally { book.release(); await h.close(); }
});

for (const waiting of ['MVU', '初始化后半段']) {
  test(waiting + '等待期间卸载，异步返回后不发布服务、不遗留监听', async () => {
    const h = hostFixture(), gate = deferred();
    const book = waiting === '初始化后半段' ? h.holdBook() : null;
    const a = h.frame('A', book ? {} : { mvuGate: gate });
    try {
      if (book) await until(book.entered);
      a.hide();
      gate.resolve(); book?.release(); await a.done();
      assert.equal(h.host.__chengwanService, undefined);
      assert.equal(h.host.__chengwanRuntime, undefined);
      assert.equal(h.macros.size, 0);
      assert.equal([...h.events.values()].reduce((n, set) => n + set.size, 0), 0);
      assert.equal(h.locks.size, 0);
      assert.deepEqual(h.reloads, []);
      protectedState(h);
    } finally { gate.resolve(); book?.release(); await h.close(); }
  });
}
