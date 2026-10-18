// 隔离审查夹具：执行真实组件与底层函数，不连接或写入酒馆。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vue = require('vue');
const sfc = require('vue/compiler-sfc');
const root = path.resolve(__dirname, '..');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...args) {
  if (name.startsWith('.') && parent && fs.existsSync(path.resolve(path.dirname(parent.filename), name + '.ts'))) name += '.ts';
  return originalResolve.call(this, name, parent, ...args);
};
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);
global.z = require('zod').z;
global._ = require('lodash');
const { Schema } = require(root + '/schema.ts');
const phone = require(root + '/运行/phone.ts');
const { managePhone, ensurePhoneSession } = require(root + '/运行/phone-management.ts');
const { useLinxinDrafts } = require(root + '/界面/桌面端/utils/linxin-drafts.ts');
const scopes = [];
const results = [];
function seed() {
  const time = { 年: 2026, 月: 10, 日: 2, 时: 12, 分: 0 };
  return Schema.parse({ 玩家: { id: 'player', 姓名: '测试玩家', 生活: { 住处id: 'home' },
    已知信息: { 已知账号: { fox: {}, lux: {} } } }, 世界: { 当前时间: time }, 地点: { home: { 名称: '学院公寓' } },
    手机: { 账号: { self: { 人物id: 'player', 昵称: '测试玩家' }, fox: { 人物id: 'ahri', 昵称: '阿狸' },
      lux: { 人物id: 'lux', 昵称: '拉克丝' } }, 联系人: { cf: { 本人账号id: 'self', 对方账号id: 'fox', 备注: '狐狸朋友' } },
      群: { g1: { 名称: '学院群', 创建者账号id: 'fox', 管理员账号id: ['self'], 成员: {
        self: { 成员区间: { a: { 加入时间: time } } }, fox: { 成员区间: { a: { 加入时间: time } } } } },
        g2: { 名称: '咖啡群', 创建者账号id: 'self', 成员: { self: { 成员区间: { a: { 加入时间: time } } } } } },
      会话: { private: { 类型: '私聊', 参与账号id: ['self', 'fox'] }, gc: { 类型: '群聊', 群id: 'g1', 参与账号id: ['self', 'fox'] } },
      申请: { out1: { 发起账号id: 'self', 目标账号id: 'lux' }, out2: { 发起账号id: 'self', 目标账号id: 'fox' } } } });
}
function namesFor(name) {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap(el => el.name ? namesFor(el.name) : []);
}
function component(relative, state, runtime, props = {}, additions = {}) {
  const filename = path.join(root, '界面/桌面端/components/phone', relative + '.vue');
  const source = fs.readFileSync(filename, 'utf8');
  let code = sfc.parse(source).descriptor.scriptSetup.content;
  const ast = ts.createSourceFile(filename + '.ts', code, ts.ScriptTarget.Latest, true);
  const names = ast.statements.flatMap(stmt => ts.isFunctionDeclaration(stmt) ? [stmt.name.text] : ts.isVariableStatement(stmt)
    ? stmt.declarationList.declarations.flatMap(d => namesFor(d.name)) : []);
  for (const stmt of [...ast.statements].reverse()) if (ts.isImportDeclaration(stmt)) code = code.slice(0, stmt.pos) + code.slice(stmt.end);
  const emissions = [];
  const context = { ...vue, ...phone, managePhone, ensurePhoneSession, useLinxinDrafts, console, RuntimeKey: null,
    defineProps: () => props, defineEmits: () => (...args) => emissions.push(args), inject: () => runtime,
    useWorldState: () => state, useStableFeed: () => ({ viewport: vue.ref(), pending: vue.ref(0), latest() {} }),
    onActivated() {}, onDeactivated() {}, onBeforeUnmount() {}, onMounted() {}, onUnmounted() {}, defineExpose() {}, setInterval() { return 0; }, clearInterval() {},
    module: { exports: {} }, window: { prompt() { return null; } }, confirm: () => false, ...additions };
  const scope = vue.effectScope(); scopes.push(scope);
  scope.run(() => vm.runInNewContext(ts.transpileModule(code + '\nmodule.exports = {' + names.map(n => n).join(',') + '};', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context, { filename }));
  return { view: context.module.exports, source, emissions };
}
function runtimeFor(state, requests = []) {
  return { view: { busy: false, updating: false },
    async commit(fn) { state.value = Schema.parse(fn(structuredClone(vue.toRaw(state.value)))); },
    async phoneAction(a) { requests.push(a); } };
}
async function html(fixture) {
  const compiler = Module.createRequire(require.resolve('vue'))('@vue/compiler-dom');
  const templateCode = compiler.compile(sfc.parse(fixture.source).descriptor.template.content, {
    mode: 'function', prefixIdentifiers: true, expressionPlugins: ['typescript'],
  }).code;
  // 与真实 SFC 构建一致，去除模板表达式中的 TS 非空断言等语法后再执行。
  const render = new Function('Vue', ts.transpileModule(templateCode, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText)(vue);
  const app = vue.createSSRApp({
    setup: () => ({ ...fixture.view.props, ...fixture.view }), render, components: { SvgIcon: { render: () => null }, CharacterAvatar: { render: () => null },
      PhoneComments: { render: () => null }, PhoneComposer: { render: () => null }, PhoneDirectory: { render: () => null } } });
  app.directive('read', { getSSRProps: () => ({}) });
  return require('vue/server-renderer').renderToString(app);
}
module.exports = { Schema, phone, managePhone, ensurePhoneSession, component, runtimeFor, html, seed, scopes, vue };
