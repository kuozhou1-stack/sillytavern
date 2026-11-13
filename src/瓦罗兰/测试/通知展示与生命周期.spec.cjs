// 执行真实组件的 setup 与模板；尺寸由隔离夹具提供，不代替浏览器排版或真机验收。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');
const sfc = require('vue/compiler-sfc');
const compiler = require('node:module').createRequire(require.resolve('vue'))('@vue/compiler-dom');
const { renderToString } = require('vue/server-renderer');
const frontend = path.resolve(__dirname, '../界面/桌面端');

function declarationNames(statement) {
  if (ts.isFunctionDeclaration(statement)) return [statement.name.text];
  if (!ts.isVariableStatement(statement)) return [];
  return statement.declarationList.declarations.flatMap(d => ts.isIdentifier(d.name) ? [d.name.text] : []);
}

function setup(relative, props = {}, additions = {}, selectedNames) {
  const filename = path.join(frontend, relative);
  const source = fs.readFileSync(filename, 'utf8');
  const descriptor = sfc.parse(source, { filename }).descriptor;
  const ast = ts.createSourceFile(filename + '.ts', descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true);
  const statements = ast.statements.filter(statement => {
    if (ts.isImportDeclaration(statement)) return false;
    if (!selectedNames) return true;
    if (declarationNames(statement).some(name => selectedNames.includes(name))) return true;
    return ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression) &&
      statement.expression.expression.getText(ast) === 'watch' &&
      statement.expression.arguments[0]?.getText(ast) === 'isGenerating';
  });
  const names = statements.flatMap(declarationNames);
  const emissions = [];
  const observed = [];
  const timers = [];
  class ResizeObserverFixture {
    constructor(callback) { this.callback = callback; this.targets = []; this.disconnected = false; observed.push(this); }
    observe(target) { this.targets.push(target); }
    disconnect() { this.disconnected = true; }
  }
  const context = {
    ...vue, console, ResizeObserver: ResizeObserverFixture,
    defineProps: () => props, defineEmits: () => (...args) => emissions.push(args),
    setTimeout: (...args) => { timers.push(args); return timers.length; }, clearTimeout() {},
    module: { exports: {} }, ...additions,
  };
  const code = statements.map(statement => statement.getText(ast)).join('\n') +
    `\nmodule.exports = {${names.join(',')}};`;
  const scope = vue.effectScope();
  scope.run(() => vm.runInNewContext(ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context, { filename }));
  return { view: context.module.exports, props, scope, observed, timers, descriptor, emissions };
}

async function html(fixture, extra = {}) {
  const templateCode = compiler.compile(fixture.descriptor.template.content, {
    mode: 'function', prefixIdentifiers: true, isTS: true,
  }).code;
  const render = new Function('Vue', ts.transpileModule(templateCode, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText)(vue);
  const components = {};
  for (const [, name] of fixture.descriptor.template.content.matchAll(/<([A-Z][A-Za-z]+)/g)) {
    components[name] = name === 'ComposerNotification'
      ? { props: ['toastMessage'], setup: props => () => vue.h('div', { 'data-notification': '' }, props.toastMessage) }
      : { render: () => null };
  }
  const app = vue.createSSRApp({
    setup: () => ({ ...fixture.props, ...fixture.view, ...extra }), render, components,
  });
  // App 这里只执行通知相关 setup；无关显示字段由空桩替代。
  app.config.warnHandler = () => {};
  return renderToString(app);
}

const notificationFile = 'components/chat/ComposerNotification.vue';
function notification(t, values = {}) {
  const props = vue.reactive({ toastMessage: null, errorText: '', ...values });
  const fixture = setup(notificationFile, props);
  t.after(() => fixture.scope.stop());
  return fixture;
}
function setElements(fixture, containerWidth, textWidth) {
  fixture.view.marqueeContainerRef.value = vue.markRaw({ clientWidth: containerWidth });
  fixture.view.marqueeTextRef.value = vue.markRaw({ scrollWidth: textWidth });
}

test('真实阶段优先于笼统生成/结算状态，阶段变化同步显示', async t => {
  const fixture = notification(t, { isGenerating: true, isUpdatingVariables: true, busyHint: '选择地点与组织资料…' });
  assert.equal(fixture.view.displayText.value, '选择地点与组织资料…');
  assert((await html(fixture)).includes('选择地点与组织资料…'));
  fixture.props.busyHint = '保存并确认结果…';
  await vue.nextTick();
  assert.equal(fixture.view.displayText.value, '保存并确认结果…');
  assert(!fixture.view.displayText.value.includes('正在更新剧情变量'));
});

test('保存未确认显示失败阶段和原始原因，保留恢复入口', async t => {
  const fixture = notification(t, { updateFailed: true, errorText: '合成保存确认失败', busyHint: '保存并确认结果未完成' });
  assert.equal(fixture.view.displayText.value, '保存并确认结果未完成 · 点击处理');
  assert(fixture.view.fullDetailText.value.includes('保存并确认结果未完成'));
  assert(fixture.view.fullDetailText.value.includes('合成保存确认失败'));
  fixture.view.isExpanded.value = true;
  const rendered = await html(fixture);
  assert(rendered.includes('立即重试'));
  assert(rendered.includes('合成保存确认失败'));
});

test('F01: 首次无通知、节点出现、隐藏及重新出现后均观察当前节点并释放旧观察器', async t => {
  const fixture = notification(t);
  const { view, props, observed } = fixture;
  assert.equal(view.hasNotification.value, false);
  assert.equal(observed.length, 0);

  props.toastMessage = '第一条通知';
  setElements(fixture, 160, 600);
  await vue.nextTick();
  assert.equal(observed.length, 1);
  assert.deepEqual(observed[0].targets, [view.marqueeContainerRef.value, view.marqueeTextRef.value]);
  assert.equal(view.overflowDistance.value, 440);
  assert.equal(600 - view.overflowDistance.value, 160, '最终位移应完整露出文本末尾');

  view.marqueeContainerRef.value.clientWidth = 100;
  observed[0].callback();
  assert.equal(view.overflowDistance.value, 500, '旋转等容器变化后重新测量');
  view.marqueeTextRef.value.scrollWidth = 680;
  observed[0].callback();
  assert.equal(view.overflowDistance.value, 580, '字体变化后重新测量');

  props.toastMessage = null;
  view.marqueeContainerRef.value = null;
  view.marqueeTextRef.value = null;
  await vue.nextTick();
  assert.equal(observed[0].disconnected, true);
  assert.equal(view.overflowDistance.value, 0);

  props.toastMessage = '重新出现';
  setElements(fixture, 200, 100);
  await vue.nextTick();
  assert.equal(observed.length, 2);
  assert.equal(view.isOverflowing.value, false, '能放下的文字必须静止');
  fixture.scope.stop();
  assert.equal(observed[1].disconnected, true, '卸载释放当前观察器');
});

test('F02: 错误摘要始终静止，恢复操作仅在展开详情后出现', async t => {
  const fixture = notification(t, { errorText: '错误详情：' + '路径很长'.repeat(40), updateFailed: true });
  setElements(fixture, 30, 220);
  await vue.nextTick();
  assert.ok(fixture.view.overflowDistance.value > 0);
  assert.equal(fixture.view.isOverflowing.value, false, '错误摘要即使过宽也不能进入跑马灯');
  assert.equal(fixture.view.displayText.value, '操作未完成 · 点击处理');
  const collapsed = await html(fixture);
  assert.doesNotMatch(collapsed, /立即重试|取消待处理请求|is-scrolling/);
  fixture.view.toggleExpand();
  const expanded = await html(fixture);
  assert.equal((expanded.match(/立即重试/g) ?? []).length, 1);
  assert.equal((expanded.match(/取消待处理请求/g) ?? []).length, 1);
  assert.ok(expanded.includes(fixture.props.errorText));
});

test('F01: 触碰暂停与展开全文不销毁通知，也不注册自动关闭计时器', async t => {
  const fixture = notification(t, { toastMessage: '长通知'.repeat(60) });
  setElements(fixture, 100, 1200);
  await vue.nextTick();
  fixture.view.isPaused.value = true;
  assert.match(await html(fixture), /is-paused/);
  fixture.view.isPaused.value = false;
  fixture.view.toggleExpand();
  assert.match(await html(fixture), /is-paused/);
  assert.ok((await html(fixture)).includes(fixture.props.toastMessage));
  assert.equal(fixture.timers.length, 0);
});

const appNames = [
  'activeModal', 'showSystemDrawer', 'showLowStatusAlert', 'itemToUse', 'toastMessage',
  'toastIsGenerationProgress', 'isCreationCompleted', 'isReviewingCreation', 'loadFailure', 'showCreation',
  'notificationOverlay', 'showToast', 'dismissToast',
];
function appNotification(t) {
  const state = vue.ref({ _系统: { 建档完成: true }, 世界: {}, 玩家: {}, 地点: {}, 手机: {} });
  const isGenerating = vue.ref(false);
  const fixture = setup('App.vue', {}, { props: {}, state, isGenerating, runtime: null }, appNames);
  t.after(() => fixture.scope.stop());
  return { ...fixture, state, isGenerating };
}

test('F04/F09: 主游玩、建档、回看建档、模态及独立抽屉均有且只有一个提示出口', async t => {
  const fixture = appNotification(t);
  fixture.view.showToast('已保存');
  const assertOne = async floating => {
    assert.equal(fixture.view.notificationOverlay.value, floating);
    const result = await html(fixture, { state: fixture.state, chatMessages: [], libraryCharacters: {} });
    assert.equal((result.match(/data-notification/g) ?? []).length, 1);
    assert.match(result, /已保存/);
    assert.equal(result.includes('cw-overlay-notification'), floating);
  };
  await assertOne(false);
  fixture.state.value._系统.建档完成 = false;
  assert.equal(fixture.view.showCreation.value, true);
  await assertOne(true);
  fixture.state.value._系统.建档完成 = true;
  fixture.view.isReviewingCreation.value = true;
  await assertOne(true);
  fixture.view.isReviewingCreation.value = false;
  for (const modal of ['settings', 'phone', 'major_chars']) {
    fixture.view.activeModal.value = modal;
    await assertOne(true);
  }
  fixture.view.activeModal.value = null;
  for (const field of ['showSystemDrawer', 'showLowStatusAlert']) {
    fixture.view[field].value = true;
    await assertOne(true);
    fixture.view[field].value = false;
  }
  fixture.view.itemToUse.value = { 名称: '测试物品' };
  await assertOne(true);
  fixture.view.itemToUse.value = null;
  await assertOne(false);
});

test('F01/F09: 长普通提示手动关闭，明确标记的旧生成进度结束后清除，错误文字不被误删', async t => {
  const fixture = appNotification(t);
  fixture.view.showToast('普通通知'.repeat(100));
  assert.equal(fixture.timers.length, 0, '不能在跑马灯读完之前自动清除');
  fixture.isGenerating.value = true;
  await vue.nextTick();
  fixture.isGenerating.value = false;
  await vue.nextTick();
  assert.ok(fixture.view.toastMessage.value);
  fixture.view.dismissToast();
  assert.equal(fixture.view.toastMessage.value, null);

  fixture.view.showToast('正在生成开场', true);
  fixture.isGenerating.value = true;
  await vue.nextTick();
  fixture.isGenerating.value = false;
  await vue.nextTick();
  assert.equal(fixture.view.toastMessage.value, null);

  fixture.isGenerating.value = true;
  await vue.nextTick();
  fixture.view.showToast('生成失败：请查看原因');
  fixture.isGenerating.value = false;
  await vue.nextTick();
  assert.equal(fixture.view.toastMessage.value, '生成失败：请查看原因');
});
