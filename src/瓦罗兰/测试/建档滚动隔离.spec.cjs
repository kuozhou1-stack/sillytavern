// 真实 CreationView setup + Vue 调度；尺寸和宿主滚动为隔离桩，不代替浏览器排版验收。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');
const sfc = require('vue/compiler-sfc');
const { Schema } = require('./修复宿主.cjs');

function fixture(t, { width = 1000, scrollWidth = width, scale = 1, step = 1 } = {}) {
  const filename = path.resolve(__dirname, '../界面/桌面端/components/creation/CreationView.vue');
  const descriptor = sfc.parse(fs.readFileSync(filename, 'utf8'), { filename }).descriptor;
  const ast = ts.createSourceFile(filename + '.ts', descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true);
  const statements = ast.statements.filter(statement => !ts.isImportDeclaration(statement));
  const names = statements.flatMap(statement => {
    if (ts.isFunctionDeclaration(statement)) return [statement.name.text];
    if (!ts.isVariableStatement(statement)) return [];
    return statement.declarationList.declarations.flatMap(d => ts.isIdentifier(d.name) ? [d.name.text] : []);
  });
  const mounted = [];
  const host = { scrollTop: 480, scrollLeft: 0, ancestorScrolls: 0 };
  const localScrolls = [];
  const bodyScrolls = [];
  const context = {
    ...vue, console, structuredClone,
    window: { parent: host, addEventListener() {}, removeEventListener() {} },
    defineProps: () => ({ initialProfile: { 姓名: '测试玩家', 性别: '女' } }),
    defineEmits: () => () => {},
    useWorldState: () => vue.ref(Schema.parse({})),
    copy: structuredClone,
    uid: () => 'isolated-creation',
    readCreationPreset: () => null,
    saveCreationPreset() { throw Error('滚动测试不得保存建档'); },
    onMounted: callback => mounted.push(callback),
    module: { exports: {} },
  };
  const scope = vue.effectScope();
  t.after(() => scope.stop());
  scope.run(() => vm.runInNewContext(ts.transpileModule(
    statements.map(statement => statement.getText(ast)).join('\n') + `\nmodule.exports = {${names.join(',')}};`,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText, context, { filename }));
  const view = context.module.exports;
  view.currentStep.value = step;
  const viewport = vue.markRaw({
    clientWidth: width, offsetWidth: width, clientLeft: 0, scrollWidth, scrollLeft: 0,
    getBoundingClientRect: () => ({ left: 50, right: 50 + width * scale, width: width * scale }),
    scrollTo(options) {
      assert.equal(options.top, undefined, '步骤栏只允许横向定位');
      localScrolls.push({ ...options });
      this.scrollLeft = options.left;
    },
  });
  const item = vue.markRaw({
    getBoundingClientRect() {
      const left = 50 + (12 + (view.currentStep.value - 1) * 120 - viewport.scrollLeft) * scale;
      return { left, right: left + 100 * scale, width: 100 * scale };
    },
    // scrollIntoView 的默认祖先链语义：记录任何向容器之外的定位请求。
    scrollIntoView() { host.ancestorScrolls++; host.scrollTop += 20; host.scrollLeft += 10; },
  });
  const track = vue.markRaw({ querySelector: () => item, parentElement: viewport });
  if (view.stepsViewportRef) view.stepsViewportRef.value = viewport;
  view.stepsTrackRef.value = track;
  const content = vue.markRaw({ scrollTop: 180, scrollTo(options) { bodyScrolls.push({ ...options }); this.scrollTop = options.top; } });
  view.contentViewportRef.value = content;
  return { view, host, viewport, item, content, localScrolls, bodyScrolls, mounted, descriptor };
}

async function settle() {
  await vue.nextTick();
  await vue.nextTick();
  await vue.nextTick();
}

function assertHostUnmoved(e) {
  assert.deepEqual(e.host, { scrollTop: 480, scrollLeft: 0, ancestorScrolls: 0 });
}

test('电脑建档连续下一步及返回：只重置表单阅读位置，不滚动宿主或已完整显示的步骤栏', async t => {
  const e = fixture(t);
  e.mounted.forEach(callback => callback());
  await settle();
  for (let step = 2; step <= 6; step++) {
    e.content.scrollTop = 180;
    e.view.handleNextStep();
    await settle();
    assert.equal(e.view.currentStep.value, step);
    assert.equal(e.content.scrollTop, 0);
    assertHostUnmoved(e);
  }
  e.view.goToStep(2);
  await settle();
  assertHostUnmoved(e);
  assert.equal(e.localScrolls.length, 0);
  assert.equal(e.bodyScrolls.length, 6);
});

test('窄屏建档：前进和回退只在步骤栏内定位，最后一步受滚动边界限制', async t => {
  const e = fixture(t, { width: 300, scrollWidth: 760 });
  for (const step of [4, 6, 2, 1]) {
    e.view.goToStep(step);
    await settle();
    const bounds = e.item.getBoundingClientRect();
    assert(bounds.left >= 50 && bounds.right <= 350, '活动步骤应完整可见');
    assert(e.viewport.scrollLeft >= 0 && e.viewport.scrollLeft <= 460);
    assertHostUnmoved(e);
  }
  assert(e.localScrolls.length > 0, '仍保留手机步骤定位');
  assert(e.localScrolls.every(options => options.behavior === 'smooth'));
});

test('界面缩放与恢复最后一步：按本地坐标定位，不把缩放后的像素当作scrollLeft', async t => {
  for (const scale of [0.75, 1.5]) {
    const e = fixture(t, { width: 300, scrollWidth: 760, scale, step: 6 });
    e.mounted.forEach(callback => callback());
    await settle();
    assert.equal(e.viewport.scrollLeft, 460);
    assertHostUnmoved(e);
    e.view.goToStep(3);
    await settle();
    assert.equal(e.viewport.scrollLeft, 152);
    assertHostUnmoved(e);
  }
});

test('尺寸尚未就绪或卸载后：不请求宿主定位；滚动ref绑定实际步骤视口', async t => {
  const e = fixture(t, { width: 0, scrollWidth: 760 });
  e.mounted.forEach(callback => callback());
  await settle();
  assertHostUnmoved(e);
  assert.equal(e.localScrolls.length, 0);
  e.view.goToStep(4);
  e.view.stepsTrackRef.value = null;
  if (e.view.stepsViewportRef) e.view.stepsViewportRef.value = null;
  e.view.contentViewportRef.value = null;
  await settle();
  assertHostUnmoved(e);
  assert.match(e.descriptor.template.content, /<nav\s+ref="stepsViewportRef"\s+class="cw-creation-steps-bar"/);
});
