const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { test } = require('node:test'), assert = require('node:assert/strict'), ts = require('typescript');

function environment() {
  const listeners = new Map(), events = new Map(), elements = new Map(), styles = new Set();
  const area = { insertBefore(node) { elements.set(node.id, node); } };
  const input = { id: 'send_textarea', parentElement: area };
  const nativeStop = { id: 'mes_stop', style: { display: 'none' } };
  elements.set(input.id, input); elements.set(nativeStop.id, nativeStop);
  const doc = {
    getElementById: id => elements.get(id),
    head: { append(node) { styles.add(node); } },
    createElement: tag => ({ tag, remove() { styles.delete(this); elements.delete(this.id); } }),
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name, callback) => { if (listeners.get(name) === callback) listeners.delete(name); },
  };
  let chat = 'test-chat';
  const runtime = { view: { busy: false, updating: false, generationId: null } };
  const exports = {};
  const file = path.join(__dirname, '../脚本/流式同层/native-controls.ts');
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: () => ({ isCommittedCandidate() { throw Error('非本例路径'); } }),
    eventOn: (name, callback) => { events.set(name, callback); return { stop: () => events.delete(name) }; },
    eventRemoveListener: (name, callback) => { if (events.get(name) === callback) events.delete(name); },
  }, { filename: file });
  const remove = exports.installNativeControls({ doc, host: { setInterval() {}, clearInterval() {} },
    chat, currentChat: () => chat, runtime: () => runtime, ready: () => true, error: assert.fail,
  });
  const change = patch => { Object.assign(runtime.view, patch); events.get('chengwan:runtime_changed')?.(); };
  const key = (patch = {}) => {
    const e = { key: 'Escape', target: input, blocked: false, ...patch,
      preventDefault() { this.blocked = true; }, stopImmediatePropagation() { this.stopped = true; } };
    listeners.get('keydown')?.(e); return e;
  };
  return { elements, nativeStop, events, listeners, styles, remove, change, key,
    switchChat: value => { chat = value; change({}); } };
}

test('资料、正文和变量实际请求期间复用宿主控件，单独的保存不占用', () => {
  const e = environment();
  e.change({ busy: true });
  assert.equal(e.styles.size, 0);
  for (const phase of ['information', 'story', 'variables']) {
    e.change({ phase, generationId: phase });
    e.change({});
    assert.equal(e.styles.size, 1);
    assert.equal([...e.styles][0].tag, 'style');
    assert(!e.elements.has('cw-native-stop'));
    e.change({ generationId: null, phase: 'saving', updating: true });
    assert.equal(e.styles.size, 0);
  }
  e.remove();
});

test('撤回本卡样式保留宿主对原生停止按钮的最新设置', () => {
  const e = environment();
  for (const externalDisplay of ['flex', 'none']) {
    e.change({ generationId: 'story' });
    e.nativeStop.style.display = externalDisplay;
    e.change({});
    assert.equal(e.styles.size, 1);
    e.change({ generationId: null });
    assert.equal(e.styles.size, 0);
    assert.equal(e.nativeStop.style.display, externalDisplay);
  }
  e.remove();
});

test('原生停止点击和 Escape 留给酒馆自己的事件处理', () => {
  const e = environment();
  e.change({ busy: true, generationId: 'story' });
  const click = {
    target: { closest: selector => selector.split(',').map(s => s.trim()).includes('#mes_stop') ? e.nativeStop : null },
    preventDefault: assert.fail, stopImmediatePropagation: assert.fail,
  };
  e.listeners.get('click')(click);
  assert.equal(e.key().blocked, false);
  assert.equal(e.key({ target: { id: 'curEditTextarea' } }).blocked, false);
  assert.equal(e.key({ isComposing: true }).blocked, false);
  assert.equal(e.key({ target: { id: 'popup-input' } }).blocked, false);
  e.remove();
});

test('切聊天和卸载移除本卡控件及监听，不修改外部控件', () => {
  const e = environment();
  e.change({ busy: true, generationId: 'story' });
  e.switchChat('another-chat');
  assert.equal(e.styles.size, 0);
  assert.equal(e.key().blocked, false);
  e.switchChat('test-chat');
  assert.equal(e.styles.size, 1);
  e.remove();
  assert.equal(e.styles.size, 0);
  assert.equal(e.events.size, 0);
  assert.equal(e.listeners.size, 0);
  assert.equal(e.nativeStop.style.display, 'none');
});
