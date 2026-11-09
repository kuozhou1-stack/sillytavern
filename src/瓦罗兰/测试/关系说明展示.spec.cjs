const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const vue = require('vue');
const sfc = require('vue/compiler-sfc');
const { renderToString } = require('vue/server-renderer');
const frontend = path.resolve(__dirname, '../界面/桌面端');

function evaluate(source, imports = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module, exports: module.exports,
    require(name) {
      if (name === 'vue') return vue;
      assert.ok(name in imports, `未提供的组件依赖：${name}`);
      return imports[name];
    },
  });
  return module.exports;
}

const labels = evaluate(fs.readFileSync(path.join(frontend, 'utils/relationship-labels.ts'), 'utf8'));

test('好感与信任边界遵循世界书，未知、零及两条轴分别解释', () => {
  for (const [values, expected] of [
    [[-100, -60], '强烈排斥'], [[-59, -20], '明显反感'], [[-19, 0, 19], '中立或轻微倾向'],
    [[20, 49], '愿意亲近'], [[50, 60, 79], '明显偏爱'], [[80, 100], '深厚情感或高度欣赏'],
  ]) for (const value of values) assert.equal(labels.favorLabel(value), expected);
  for (const [values, expected] of [
    [[-100, -1], '不同程度的不信任'], [[0], '尚无明确倾向'], [[1, 15], '有少量正面依据'],
    [[16, 35], '认可常规事务上的可靠性'], [[36, 60], '愿意在有依据的领域分享或托付'],
    [[61, 85], '可承担较重要的共同事务'], [[86, 100], '高度信赖'],
  ]) for (const value of values) assert.equal(labels.trustLabel(value), expected);
  for (const value of [null, undefined, NaN]) {
    assert.equal(labels.favorLabel(value), '未知');
    assert.equal(labels.trustLabel(value), '未知');
  }
  assert.doesNotMatch(labels.favorLabel(100), /信赖|托付/);
});

test('破壁阶段解释零与未知，范围外旧值保持待确认且不外推高阶', () => {
  const names = ['未记录私人交集', '日常往来', '察觉差异', '确认私密', '自愿分享', '稳定接纳'];
  names.forEach((name, value) => assert.equal(labels.privateLifeStageLabel(value), `${value} 阶 · ${name}`));
  assert.equal(labels.privateLifeStageLabel(null), '未知');
  assert.match(labels.privateLifeStageDescription(0), /不代表陌生或失忆/);
  assert.match(labels.privateLifeStageDescription(2), /仍可能只是推测/);
  assert.match(labels.privateLifeStageDescription(3), /不等于受邀/);
  for (const value of [-1, 6, 999, 2.5, NaN]) assert.equal(labels.privateLifeStageLabel(value), '待确认');
  assert.match(labels.privateLifeStageDescription(9), /旧值不在0～5阶内，需要核对，不推断更高阶段/);
  assert.doesNotMatch(labels.privateLifeStageDescription(9), /保留原记录/);
});

test('真实关系页同时正确展示玩家与他人方向，并共用好感信任说明', async () => {
  const filename = path.join(frontend, 'components/characters/major-tabs/TabRelations.vue');
  const descriptor = sfc.parse(fs.readFileSync(filename, 'utf8'), { filename }).descriptor;
  const compiled = sfc.compileScript(descriptor, { id: 'relationship-display', inlineTemplate: true });
  const component = evaluate(compiled.content, {
    '../../../utils/relationship-labels': labels,
    '../../../utils/context': { useWorldState: () => vue.ref({ 玩家: { id: 'player', 姓名: '玩家' } }) },
    '../../../utils/entity': { resolveEntityName: () => '' },
    '../../icons/SvgIcon.vue': { render: () => null },
  }).default;
  const character = {
    姓名: '艾克',
    关系网: {
      player: { 好感度: 60, 信任度: 0, 破壁阶段: 3, 已知私密: ['艾克保留旧工坊的钥匙'] },
      zeri: { 好感度: 10, 信任度: 36, 破壁阶段: 9, 已知私密: ['艾克准备搬家'] },
    },
  };
  const before = JSON.stringify(character);
  const html = await renderToString(vue.createSSRApp(component, {
    char: character, allCharacters: { zeri: { 姓名: '泽丽' } },
  }));
  assert.match(html, /好感度 \+60 · 明显偏爱/);
  assert.match(html, /信任度 0 · 尚无明确倾向/);
  assert.match(html, /破壁 3 阶 · 确认私密/);
  assert.match(html, /破壁 待确认/);
  assert.doesNotMatch(html, /破壁 9 阶/);
  assert.match(html, /你已知的对方私密：/);
  assert.match(html, /泽丽已知的本角色私密：/);
  assert.equal((html.match(/关系未设定/g) ?? []).length, 2);
  assert.doesNotMatch(html, /普通相识|普通关系/);
  assert.equal(JSON.stringify(character), before, '展示不得迁移或改写旧关系值');
});
