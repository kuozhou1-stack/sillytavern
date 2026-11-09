const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { component, vue, scopes } = require('./手机重构测试夹具.cjs');
after(() => scopes.forEach(s => s.stop()));
function fixture() {
  const pending = vue.ref({});
  const meta = vue.ref({});
  let toggles = 0;
  const ui = component('../characters/MinorCharacterModal', vue.ref({}), null,
    { characters: { a: { 层级: '次要', 姓名: '甲' }, b: { 层级: '次要', 姓名: '乙' } } },
    { show: String, minorRecordSections: () => [], useCharacterDisplayState: () => ({
      charMetaMap: meta, operationPending: pending, toggleCharacterEnabled: async () => toggles++ }) });
  ui.view.minorContentView.value = { scrollTop: 0 };
  return { ...ui, pending, meta, toggles: () => toggles };
}
async function settled() { await vue.nextTick(); await vue.nextTick(); }
test('次要角色阅读位置分别按人物和 tab 记忆', async () => {
  const { view: v } = fixture();
  v.minorContentView.value.scrollTop = 123;
  v.currentSubTab.value = 'records'; await settled();
  assert.equal(v.minorContentView.value.scrollTop, 0);
  v.minorContentView.value.scrollTop = 456;
  v.handleSelectCharacter('b'); await settled();
  assert.equal(v.minorContentView.value.scrollTop, 0);
  v.minorContentView.value.scrollTop = 78;
  v.handleSelectCharacter('a'); await settled();
  assert.equal(v.minorContentView.value.scrollTop, 456);
  v.currentSubTab.value = 'base'; await settled();
  assert.equal(v.minorContentView.value.scrollTop, 123);
  v.currentSubTab.value = 'records'; v.handleSelectCharacter('b'); await settled();
  assert.equal(v.minorContentView.value.scrollTop, 78);
});
test('过期的滚动恢复回调不能覆盖新人物、新 tab', async () => {
  const { view: v } = fixture();
  v.minorScrollPositions.set(JSON.stringify(['a','base']), 900);
  v.restoreScroll('a', 'base'); v.handleSelectCharacter('b'); await settled();
  assert.equal(v.minorContentView.value.scrollTop, 0);
});
test('启停操作保存期间不能升格，已停用角色也不能升格', async () => {
  const ui = fixture();
  ui.pending.value = { 'char:b': true };
  ui.view.handlePromoteCurrentChar(); await ui.view.handleToggleCurrentChar();
  assert.equal(ui.emissions.length, 0); assert.equal(ui.toggles(), 0);
  ui.pending.value = {}; ui.meta.value = { a: { enabled: false } };
  ui.view.handlePromoteCurrentChar(); assert.equal(ui.emissions.length, 0);
  ui.meta.value.a.enabled = true; ui.view.handlePromoteCurrentChar();
  assert.deepEqual(Array.from(ui.emissions[0]), ['promoteCharacter', 'a']);
});
