const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { test } = require('node:test'), assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
function compile(file, dependencies, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: name => {
    assert(name in dependencies, name); return dependencies[name];
  }, ...globals }, { filename: file });
  return exports;
}
function environment() {
  const nodes = [], counts = { created: 0, mounted: 0, unmounted: 0, styles: 0, removedStyles: 0 };
  class Element {
    constructor(tag, parent) { this.tag = tag; this.children = []; this.parent = parent; this.handlers = new Map(); nodes.push(this); }
    get isConnected() { return this === doc || !!this.parent?.isConnected; }
    get parentElement() { return this.parent; }
    append(node) { node.parent = this; this.children.push(node); }
    prepend(node) { node.parent = this; this.children.unshift(node); }
    after(node) { this.parent.append(node); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this); this.parent = undefined; }
    contains(node) { return this.children.some(child => child === node || child.contains(node)); }
    querySelector(selector) {
      if (selector === '.mes_text') return this.children.find(n => n.tag === 'text');
      if (selector === ':scope > .mes[mesid="0"]') return this.children.find(n => n.tag === 'floor');
      if (selector === ':scope > .mes') return this.children.find(n => n.tag === 'floor' || n.tag === 'message');
    }
    load() { const callback = this.handlers.get('load.cwDesktop'); this.handlers.delete('load.cwDesktop'); callback?.(); }
  }
  const doc = new Element('document');
  const chat = new Element('chat'); doc.append(chat);
  doc.getElementById = id => id === 'chat' ? chat : null;
  let floor;
  const replaceFloor = () => {
    floor?.remove(); floor = new Element('floor'); chat.append(floor); floor.append(new Element('text')); return floor;
  };
  doc.querySelector = () => floor?.isConnected ? floor : null;
  doc.createElement = tag => new Element(tag);
  const $ = element => ({ 0: element,
    attr(name, value) { element[name] = value; return this; },
    one(name, callback) { element.handlers.set(name, callback); return this; },
    off(name) { element.handlers.delete(name); return this; },
  });
  const helpers = {
    createScriptIdIframe() { const frame = new Element('iframe'); frame.contentDocument = { head: {}, body: {}, querySelector: () => null }; return $(frame); },
    teleportStyle() { counts.styles++; return { destroy: () => counts.removedStyles++ }; },
  };
  const { mountDesktop } = compile(path.join(__dirname, '../脚本/流式同层/desktop-mount.ts'), { '@util/script': helpers }, { $, errorCatched: fn => fn });
  const creator = () => { counts.created++; return { mount() { counts.mounted++; }, unmount() { counts.unmounted++; } }; };
  replaceFloor();
  return { doc, chat, Element, counts, replaceFloor, creator, mountDesktop, helpers, $, frame: () => nodes.filter(n => n.tag === 'iframe').at(-1) };
}

test('真实公共工具不提供 renderMessage：保留旧错误证据', async () => {
  const empty = { first() { return this; }, attr() { return '0'; }, children() { return this; }, map() { return []; } };
  const api = compile(path.join(root, 'util/streaming.ts'), {
    '@util/script': {}, './common': { uuidv4: () => 'fixture' },
  }, { $: () => empty, tavern_events: {}, iframe_events: {}, errorCatched: fn => fn,
    eventOn: () => ({ stop() {} }), eventMakeFirst: () => ({ stop() {} }) });
  const old = api.mountStreamingMessages(() => assert.fail('没有原生楼层时不挂载'), { prefix: 'cw-streaming-floor' });
  let failure;
  try { await old.renderMessage(0); } catch (error) { failure = error; }
  assert.equal(failure?.name, 'TypeError');
  assert.match(failure.message, /renderMessage is not a function/);
  if (process.env.VALORAN_AUDIT_DIR) fs.appendFileSync(path.join(process.env.VALORAN_AUDIT_DIR,
    '日志/01-挂载接口不匹配-错误.log'), `\n${new Date().toISOString()} 预期故障：真实公共工具旧接口复现\n${failure.stack}\n`);
});

test('首次检查创建 iframe，load 后挂载，重复同步保持同一实例', () => {
  const e = environment(), mount = e.mountDesktop(e.doc, e.creator);
  mount.render(); const frame = e.frame(); assert.equal(e.counts.mounted, 0);
  frame.load();
  for (let i = 0; i < 20; i++) mount.render();
  assert.equal(e.frame(), frame); assert.equal(e.counts.created, 1); assert.equal(e.counts.mounted, 1);
  mount.unmount(); assert.equal(e.counts.unmounted, 1); assert.equal(e.counts.removedStyles, 1); assert.equal(frame.isConnected, false);
  mount.unmount(); mount.render(); assert.equal(e.counts.created, 1);
});

test('实际入口的 sync 连续执行，调用真实本卡挂载接口', async () => {
  const e = environment(), mount = e.mountDesktop(e.doc, e.creator);
  const source = ts.createSourceFile('index.ts', fs.readFileSync(path.join(__dirname,
    '../脚本/流式同层/index.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
  let initializer;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'sync') initializer = node.initializer.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source); assert(initializer);
  e.doc.getElementById = id => id === 'chat' ? e.chat : e.frame()?.isConnected ? e.frame() : null;
  e.doc.body = { classList: { contains: () => false } };
  const sync = vm.runInNewContext(ts.transpileModule('(' + initializer + ')', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, { stopped: false, recovering: false,
    chat: 'fixture', token: 'fixture', SillyTavern: { getCurrentChatId: () => 'fixture' },
    lastRenderCheck: 0, lastFrame: null, doc: e.doc, mount, host: { __chengwanService: { ready: true }, __chengwanScriptFrontendActive: 'fixture' },
    trace() {}, Date: { now: () => 4000 }, $: () => ({ toggleClass() {} }) });
  await sync(); e.frame().contentDocument.querySelector = () => null; e.frame().load();
  for (let i = 0; i < 20; i++) await sync();
  assert.equal(e.counts.created, 1); assert.equal(e.counts.mounted, 1); mount.unmount();
});

test('原生零楼替换后清理旧桌面，只挂载一个新实例', () => {
  const e = environment(), mount = e.mountDesktop(e.doc, e.creator);
  mount.render(); const old = e.frame(); old.load();
  e.replaceFloor(); mount.render(); e.frame().load(); mount.render();
  assert.equal(e.counts.unmounted, 1); assert.equal(e.counts.mounted, 2); assert.equal(old.isConnected, false);
  mount.unmount(); assert.equal(e.counts.unmounted, 2);
});

test('等待 iframe load 时退出或替换零楼，迟到回调不再连接 Runtime', () => {
  for (const replace of [false, true]) {
    const e = environment(), mount = e.mountDesktop(e.doc, e.creator);
    mount.render(); const old = e.frame(), late = old.handlers.get('load.cwDesktop');
    if (replace) { e.replaceFloor(); mount.render(); } else mount.unmount();
    late(); assert.equal(e.counts.created, 0); assert.equal(old.handlers.size, 0);
    if (replace) { e.frame().load(); assert.equal(e.counts.created, 1); mount.unmount(); }
  }
});

test('无零楼时不创建应用，零楼恢复后正常挂载', () => {
  const e = environment(), mount = e.mountDesktop(e.doc, e.creator);
  e.doc.querySelector().remove(); mount.render(); assert.equal(e.counts.created, 0);
  e.replaceFloor(); mount.render(); e.frame().load(); assert.equal(e.counts.mounted, 1); mount.unmount();
});

test('分页首屏只有后续消息时挂在聊天容器，首楼回来不重复挂载', () => {
  const e = environment(), mount = e.mountDesktop(e.doc, e.creator);
  e.doc.querySelector().remove();
  e.chat.append(new e.Element('message'));
  mount.render(); e.frame().load();
  assert.equal(e.counts.mounted, 1);
  const frame = e.frame();
  e.replaceFloor(); mount.render();
  assert.equal(e.frame(), frame);
  assert.equal(e.counts.mounted, 1);
  mount.unmount(); assert.equal(e.counts.unmounted, 1);
});

test('真实挂载异常继续传回，不伪造成功或自动重试', () => {
  const e = environment(), reason = Error('预期故障：桌面组件挂载失败');
  const mount = e.mountDesktop(e.doc, () => ({ mount() { throw reason; }, unmount() {} }));
  mount.render(); assert.throws(() => e.frame().load(), error => error === reason);
  mount.render(); assert.equal(e.counts.styles, 1); mount.unmount(); assert.equal(e.counts.removedStyles, 1);
  if (process.env.VALORAN_AUDIT_DIR) fs.appendFileSync(path.join(process.env.VALORAN_AUDIT_DIR,
    '日志/01-挂载接口不匹配-错误.log'), `\n${new Date().toISOString()} 预期故障：异常原样传回\n${reason.stack}\n`);
});

test('聊天归属变化后，迟到 iframe load 不创建旧聊天桌面', () => {
  const e = environment();
  let active = true;
  const mount = e.mountDesktop(e.doc, e.creator, () => active);
  mount.render();
  const frame = e.frame(), late = frame.handlers.get('load.cwDesktop');
  active = false;
  late(); mount.render();
  assert.equal(e.counts.created, 0);
  assert.equal(e.counts.mounted, 0);
  mount.unmount();
  assert.equal(frame.isConnected, false);
});

async function streamingLifecycle() {
  const e = environment(), events = new Map(), timers = new Set(), mounts = [], reloads = [], entries = [];
  let chat = 'A', serial = 0, nativeStopped = 0;
  const host = { document: e.doc, __chengwanService: { chat, ready: true, runtime: { owner: chat } } };
  e.doc.body = { attributes: new Map(), classes: new Set(),
    getAttribute(name) { return this.attributes.get(name); },
    setAttribute(name, value) { this.attributes.set(name, value); },
    classList: { contains(name) { return e.doc.body.classes.has(name); } } };
  e.doc.head = {};
  e.doc.querySelectorAll = () => [{ getAttribute: () => '0' }];
  e.doc.getElementById = id => id === 'chat' ? e.chat : e.frame()?.isConnected ? e.frame() : null;
  const createFrame = e.helpers.createScriptIdIframe;
  e.helpers.createScriptIdIframe = () => {
    const value = createFrame(), frame = value[0];
    frame.contentDocument.body = new e.Element('body');
    frame.contentDocument.body.ownerDocument = e.doc;
    frame.contentDocument.documentElement = {};
    frame.contentDocument.querySelector = () => frame.mounted ? {} : null;
    return value;
  };
  const bind = (name, fn) => { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(fn); };
  const unbind = (name, fn) => events.get(name)?.delete(fn);
  function boot(name) {
    let hide, task;
    const ownTimers = new Set();
    const style = { attr() { return this; }, text() { return this; }, appendTo() { return this; }, remove() {} };
    const window = { parent: host, location: { reload() { reloads.push(name); } } };
    const $ = value => {
      if (typeof value === 'function') return value();
      if (value === '<style>') return style;
      if (value === window) return { one(_event, fn) { hide = fn; } };
      return { toggleClass(name, on) { if (on) value.classes.add(name); else value.classes.delete(name); },
        removeClass(name) { value.classes.delete(name); } };
    };
    const dependencies = {
      'vue': { createApp() { let runtime; return { use() { return this; }, provide(_key, value) { runtime = value; return this; },
        mount() { mounts.push({ current: chat, owner: runtime.owner }); e.frame().mounted = true; }, unmount() {} }; } },
      'pinia': { createPinia: () => ({}), disposePinia() {} },
      'async-wait-until': require('async-wait-until'), './desktop-mount': { mountDesktop: e.mountDesktop },
      '../../界面/桌面端/App.vue': {}, '../../界面/store': { useChengwanStore: () => ({ bind() {} }) },
      '../../运行/host': { RuntimeKey: 'runtime' }, '../../运行/bridge': { connectRuntime: runtime => ({ runtime, disconnect() {} }) },
      '../../运行/browser-crypto': { randomUUID: () => name + ++serial },
      './native-controls': { installNativeControls: () => () => { nativeStopped++; } },
      '../../界面/桌面端/utils/desktop-sizing': { installDesktopSizing: () => () => {} },
      '../../界面/桌面端/styles/theme.scss': {}, '../../界面/桌面端/styles/typography.scss': {},
      '../../界面/桌面端/styles/common.scss': {},
    };
    compile(path.join(__dirname, '../脚本/流式同层/index.ts'), dependencies, {
      window, $, console, _: require('lodash'), Mvu: {}, getVariables: () => ({ stat_data: {} }), getLastMessageId: () => 0,
      getChatMessages: () => [], waitGlobalInitialized: async () => {}, tavern_events: { CHAT_CHANGED: 'chat' },
      eventOn: bind, eventRemoveListener: unbind, toastr: { error: message => assert.fail(message) },
      SillyTavern: { getCurrentChatId: () => chat },
      setInterval(fn) { timers.add(fn); ownTimers.add(fn); return fn; }, clearInterval: fn => timers.delete(fn),
      errorCatched: fn => (...args) => { const value = fn(...args); if (!task && value?.then) task = value; return value; },
    });
    const entry = { done: () => task, hide: () => hide(), tick: async () => { for (const fn of ownTimers) await fn(); } };
    entries.push(entry); return entry;
  }
  return { e, host, mounts, reloads, events, timers, nativeStopped: () => nativeStopped, boot,
    rename(name) { chat = name; },
    async changed() { for (const fn of [...events.get('chat') ?? []]) await fn(); },
    ready(name) { host.__chengwanService = { chat: name, ready: true, runtime: { owner: name } }; },
    close() { entries.forEach(entry => entry.hide()); } };
}

for (const loaded of [false, true]) {
  test('完整流式入口换聊立即清理，pagehide 前不重挂旧档：' + (loaded ? '已经挂载' : '等待load'), async () => {
    const h = await streamingLifecycle(), a = h.boot('A');
    try {
      await a.done();
      const old = h.e.frame(), late = old.handlers.get('load.cwDesktop');
      if (loaded) old.load();
      const before = h.mounts.length;
      h.rename('B');
      await a.tick(); if (!loaded) late();
      assert.equal(h.mounts.length, before);
      await h.changed(); await h.changed();
      assert.deepEqual(h.reloads, ['A']);
      assert.equal(old.isConnected, false);
      assert.equal(h.timers.size, 0);
      h.ready('B');
      const b = h.boot('B'); await b.done(); h.e.frame().load(); await b.tick();
      assert.deepEqual(h.mounts.slice(before), [{ current: 'B', owner: 'B' }]);
      assert.equal(h.host.__chengwanFrontendReady, true);
      a.hide();
      assert.equal(h.host.__chengwanFrontendReady, true);
      assert.equal(h.e.doc.body.classes.has('cw-layer-ready'), true);
      assert.equal(h.events.get('chat').size, 1);
    } finally { h.close(); }
  });
}
