// Compile and mount the complete Vue SFC. DOM and Tavern formatting are isolated hosts;
// the browser acceptance separately checks the installed native formatter and regex scripts.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');
const sfc = require('vue/compiler-sfc');
const { remark } = require('remark');
const remarkHtml = require('remark-html').default;
const { createRequire } = require('node:module');
const { parseDocument } = createRequire(require.resolve('html-loader'))('htmlparser2');
const frames = [];
const runtimeKey = Symbol('runtime');
const frontend = path.resolve(__dirname, '../界面/桌面端');
const calls = [];
let chats;
const markdown = remark().use(remarkHtml, { sanitize: false });
const native = {
  name1: '玩家', name2: '角色',
  messageFormatting(text, name, isSystem, isUser, floor) {
    const usable = chats.map((message, index) => ({ message, index })).filter(row => !row.message.is_system);
    const index = usable.findIndex(row => row.index === floor);
    const depth = index < 0 ? undefined : usable.length - index - 1;
    calls.push({ text, name, isSystem, isUser, floor, depth, source: 'native' });
    // Contract fixtures for AI-only depth-zero hiding, player-only styling, and a status marker.
    let shown = text;
    if (!isUser && depth === 0) shown = shown.replace(/<think>[\s\S]*?<\/think>/g, '');
    if (isUser) shown = shown.replace(/玩家标记/g, '玩家正则已应用');
    shown = shown.replace(/<StatusPlaceHolderImpl\s*\/>/g, '<span class="fixture-status">状态栏已应用</span>');
    return String(markdown.processSync(shown));
  },
};
function evaluate(source, imports, filename) {
  const module = { exports: {} };
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, console,
    SillyTavern: native, getLastMessageId: () => chats.length - 1,
    formatAsDisplayedMessage(text, { message_id }) {
      const floor = message_id ?? chats.length - 1;
      const row = chats[floor];
      calls.push({ source: 'helper', text, floor });
      return native.messageFormatting(text, row.is_user ? native.name1 : native.name2, false, row.is_user, floor);
    },
    require(name) {
      if (Object.hasOwn(imports, name)) return imports[name];
      throw Error(`缺少组件依赖 ${name}`);
    },
  }, { filename });
  return module.exports;
}
const protocol = evaluate(fs.readFileSync(path.resolve(__dirname, '../运行/message-protocol.ts'), 'utf8'), {
  remark: require('remark'),
  jsonrepair: require('jsonrepair'),
}, 'message-protocol.ts');
const display = evaluate(fs.readFileSync(path.join(frontend, 'utils/message-display.ts'), 'utf8'), {
  '../../../运行/message-protocol': protocol,
}, 'message-display.ts');
const componentFile = path.join(frontend, 'components/chat/MessageContent.vue');
const descriptor = sfc.parse(fs.readFileSync(componentFile, 'utf8'), { filename: componentFile }).descriptor;
const script = sfc.compileScript(descriptor, { id: 'message-native-display', inlineTemplate: true });
const component = evaluate(script.content, {
  vue,
  '../../../../运行/host': { RuntimeKey: runtimeKey },
  '../../../../运行/browser-crypto': { randomUUID: () => 'isolated-message' },
  '../../utils/message-display': display,
  '../../utils/message-frame': { mountMessageFrame(frame, html, id) { frames.push({ frame, html, id }); return () => {}; } },
}, componentFile).default;
const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
class Element {
  constructor(tag, doc) {
    this.tag = tag; this.ownerDocument = doc; this.childNodes = []; this.attributes = {};
    this.classList = { add() {}, remove() {} };
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  removeAttribute(name) { delete this.attributes[name]; }
  get className() { return this.attributes.class ?? ''; }
  get outerHTML() {
    const attributes = Object.entries(this.attributes).map(([name, value]) => ' ' + name + '="' + escape(String(value)) + '"').join('');
    return '<' + this.tag + attributes + '>' + this.innerHTML + '</' + this.tag + '>';
  }
  get innerHTML() { return this.childNodes.map(node => node.outerHTML ?? escape(node.text)).join(''); }
  set innerHTML(value) {
    const convert = node => {
      if (node.type === 'text') return { text: node.data };
      const element = new Element(node.name, this.ownerDocument);
      element.attributes = { ...node.attribs };
      element.replaceChildren(...(node.children ?? []).filter(child => child.type !== 'comment').map(convert));
      return element;
    };
    this.replaceChildren(...parseDocument(value).children.filter(node => node.type !== 'comment').map(convert));
  }
  get textContent() { return this.childNodes.map(node => node.textContent ?? node.text).join(''); }
  set textContent(value) { this.replaceChildren({ text: value }); }
  querySelectorAll(selector) {
    const results = [];
    const walk = parent => {
      for (const child of parent.childNodes) {
        if (!(child instanceof Element)) continue;
        if ((selector === 'style' && child.tag === 'style') ||
            (selector === 'pre > code' && child.tag === 'code' && parent.tag === 'pre')) results.push(child);
        walk(child);
      }
    };
    walk(this);
    return results;
  }
  closest(selector) {
    for (let node = this; node; node = node.parentElement) {
      if (selector.split(',').some(part => {
        part = part.trim();
        return part.startsWith('.') ? node.className.split(/\s+/).includes(part.slice(1)) :
          part.startsWith('[') && Object.hasOwn(node.attributes, part.slice(1, -1));
      })) return node;
    }
    return null;
  }
  replaceChildren(...children) {
    this.childNodes = children;
    for (const child of children) child.parentElement = this;
  }
  replaceWith(replacement) {
    const parent = this.parentElement;
    parent.childNodes.splice(parent.childNodes.indexOf(this), 1, replacement);
    replacement.parentElement = parent;
  }
}
function mount(props, rows) {
  calls.length = 0;
  frames.length = 0;
  chats = rows ?? [{ is_user: false }, { is_user: true }, { is_user: false }];
  const doc = { createElement: tag => new Element(tag, doc) };
  const root = new Element('root', doc);
  const renderer = vue.createRenderer({
    createElement: tag => doc.createElement(tag),
    createText: text => ({ text }), createComment: () => ({ text: '' }),
    insert(node, parent) { parent.childNodes.push(node); node.parentElement = parent; },
    remove(node) { node.parentElement.childNodes = node.parentElement.childNodes.filter(child => child !== node); },
    setText(node, value) { node.text = value; }, setElementText(node, value) { node.textContent = value; },
    parentNode: node => node.parentElement, nextSibling: () => null,
    patchProp(node, key, _old, value) { node.setAttribute(key, value); },
  });
  const runtime = { view: vue.reactive({ messages: [{ id: chats.length - 1 }], data: { _系统: { 数据版本: 0 } } }) };
  const app = renderer.createApp(component, props);
  app.provide(runtimeKey, runtime);
  app.mount(root);
  return { root, app, runtime, html: () => root.innerHTML };
}
const update = '<UpdateVariable><JSONPatch>[]</JSONPatch></UpdateVariable>';

for (const [label, sample] of [
  ['行内代码', '`' + update + '`'],
  ['代码围栏', '```xml\n' + update + '\n```'],
  ['思考内示例', '<think>不应显示的思考' + update + '</think>'],
]) test(`真实组件入口保留${label}并让助手显示正则执行一次`, () => {
  const content = '<think>隐藏内容</think>\n\n**真实正文**\n\n' + sample;
  const e = mount({ id: 2, role: 'assistant', content });
  try {
    assert.equal(calls.filter(call => call.source === 'helper').length, 1);
    assert.equal(calls.filter(call => call.source === 'native').length, 1);
    assert.doesNotMatch(e.html(), /隐藏内容|不应显示的思考/);
    assert.match(e.html(), /<strong>真实正文<\/strong>/);
    if (label !== '思考内示例') {
      assert.match(e.html(), /<code(?:>|\s)/);
      assert.match(e.html(), /&#x3C;UpdateVariable>|&lt;UpdateVariable&gt;/);
    }
  } finally { e.app.unmount(); }
});

test('真实玩家组件的代码示例与正文都走玩家显示规则，输入原文不变', () => {
  const content = '玩家标记 **加粗**\n\n```xml\n' + update + '\n```';
  const props = { id: 1, role: 'user', content };
  const e = mount(props);
  try {
    assert.equal(calls.filter(call => call.source === 'helper').length, 1);
    assert.equal(calls.at(-1).isUser, true);
    assert.match(e.html(), /玩家正则已应用/);
    assert.match(e.html(), /<strong>加粗<\/strong>/);
    assert.match(e.html(), /<code/);
    assert.equal(props.content, content);
    assert.equal(calls[0].text, content);
  } finally { e.app.unmount(); }
});

test('真实组件将状态栏占位符保留到酒馆显示正则', () => {
  const content = '正文\n\n<StatusPlaceHolderImpl/>';
  const e = mount({ id: 2, role: 'assistant', content });
  try {
    assert.equal(calls[0].text, content);
    assert.match(e.html(), /状态栏已应用/);
  } finally { e.app.unmount(); }
});

test('未落楼助手使用助手身份和深度0，末条玩家身份不参与选择', () => {
  const content = '<think>流式思考</think>\n\n**流式正文**';
  const e = mount({ id: -1, role: 'assistant', content, incomplete: true }, [{ is_user: false }, { is_user: true }]);
  try {
    assert.equal(calls.length, 1);
    assert.equal(calls[0].source, 'native');
    assert.equal(calls[0].name, '角色');
    assert.equal(calls[0].isUser, false);
    assert.equal(calls[0].floor, 1);
    assert.equal(calls[0].depth, 0);
    assert.doesNotMatch(e.html(), /流式思考/);
    assert.match(e.html(), /<strong>流式正文<\/strong>/);
  } finally { e.app.unmount(); }
});

test('正式协议被剥离后剩余正文只格式化一次，原始props不写回', () => {
  const content = '**正文**\n' + update;
  const props = { id: 2, role: 'assistant', content };
  const e = mount(props);
  try {
    assert.equal(calls[0].text, '**正文**');
    assert.equal(calls.filter(call => call.source === 'native').length, 1);
    assert.equal(props.content, content);
  } finally { e.app.unmount(); }
});

for (const [label, content] of [
  ['思考', '<think>变量示例\n<UpdateVariable>\n示例结束</think>\n\n**真实正文**'],
  ['缩进代码', '示例\n\n    <UpdateVariable>\n    示例内容\n\n**真实正文**'],
  ['引用内代码', '> 示例\n>\n>     <UpdateVariable>\n>     示例内容\n\n**真实正文**'],
]) test('未闭合变量标签位于' + label + '时保留后续真实正文', () => {
  const e = mount({ id: 2, role: 'assistant', content });
  try {
    assert.equal(calls[0].text, content);
    assert.match(e.html(), /<strong>真实正文<\/strong>/);
  } finally { e.app.unmount(); }
});

test('变量代码示例与普通HTML部件共存时只挂载普通部件', () => {
  const example = '<UpdateVariable><JSONPatch>[]</JSONPatch></UpdateVariable>';
  const widget = '<html><body><button>正常按钮</button></body></html>';
  const content = ['示例', '', '```html', example, '```', '', '```html', widget, '```'].join('\n');
  const e = mount({ id: 2, role: 'assistant', content });
  try {
    assert.equal(frames.length, 1);
    assert.equal(frames[0].html.trim(), widget);
    assert.match(e.html(), /&lt;UpdateVariable&gt;/);
  } finally { e.app.unmount(); }
});

test('真实未完成协议尾巴在显示副本中隐藏', () => {
  assert.equal(display.displayedNarrative('真实正文\n<UpdateVariable>\n<JSONPatch>['), '真实正文');
});
