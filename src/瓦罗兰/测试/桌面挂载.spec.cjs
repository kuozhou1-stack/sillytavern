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
    append(node) { node.parent = this; this.children.push(node); }
    after(node) { this.parent.append(node); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this); this.parent = undefined; }
    contains(node) { return this.children.some(child => child === node || child.contains(node)); }
    querySelector(selector) { return this.children.find(n => selector === '.mes_text' && n.tag === 'text'); }
    load() { const callback = this.handlers.get('load.cwDesktop'); this.handlers.delete('load.cwDesktop'); callback?.(); }
  }
  const doc = new Element('document');
  let floor;
  const replaceFloor = () => {
    floor?.remove(); floor = new Element('floor'); doc.append(floor); floor.append(new Element('text')); return floor;
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
  return { doc, counts, replaceFloor, creator, mountDesktop, frame: () => nodes.filter(n => n.tag === 'iframe').at(-1) };
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
  e.doc.getElementById = () => e.frame()?.isConnected ? e.frame() : null;
  e.doc.body = { classList: { contains: () => false } };
  const sync = vm.runInNewContext(ts.transpileModule('(' + initializer + ')', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, { stopped: false, recovering: false,
    lastRenderCheck: 0, lastFrame: null, doc: e.doc, mount, host: { __chengwanService: { ready: true } },
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

test('真实挂载异常继续传回，不伪造成功或自动重试', () => {
  const e = environment(), reason = Error('预期故障：桌面组件挂载失败');
  const mount = e.mountDesktop(e.doc, () => ({ mount() { throw reason; }, unmount() {} }));
  mount.render(); assert.throws(() => e.frame().load(), error => error === reason);
  mount.render(); assert.equal(e.counts.styles, 1); mount.unmount(); assert.equal(e.counts.removedStyles, 1);
  if (process.env.VALORAN_AUDIT_DIR) fs.appendFileSync(path.join(process.env.VALORAN_AUDIT_DIR,
    '日志/01-挂载接口不匹配-错误.log'), `\n${new Date().toISOString()} 预期故障：异常原样传回\n${reason.stack}\n`);
});
