const test = require('node:test');
const assert = require('node:assert/strict');
const { Schema, component, runtimeFor, seed, scopes, vue } = require('./手机重构测试夹具.cjs');
test.afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); });

function setup() {
  const data = seed();
  data.手机.账号.weilan = { ...data.手机.账号.self, 平台: '微澜' };
  data.手机.原文.帖子.post = { 平台: '微澜', 发布账号id: 'weilan' };
  data.手机._通知 = {
    linxin: { 来源id: 'private', 内容id: [], 已读: false },
    weilan: { 来源id: 'post', 内容id: [], 已读: false },
    legacy: { 来源id: 'missing', 内容id: [], 已读: false },
  };
  const state = vue.ref(Schema.parse(data));
  const runtime = runtimeFor(state);
  const props = { get phoneData() { return state.value.手机; } };
  return { state, runtime, fixture: component('PhoneShell', state, runtime, props) };
}

test('进入 App 一次保存本平台提醒，保持其他平台和会话阅读进度', async () => {
  const { state, runtime, fixture: { view } } = setup();
  let writes = 0;
  const commit = runtime.commit;
  runtime.commit = async fn => { writes++; return commit(fn); };
  const read = JSON.stringify(state.value.手机._阅读进度);
  assert.equal(view.unread('邻信'), 1);
  assert.equal(view.unread('微澜'), 1);
  await view.handleOpenApp('linxin');
  assert.equal(view.unread('邻信'), 0);
  assert.equal(view.unread('微澜'), 1);
  assert.equal(state.value.手机._通知.legacy.已读, false);
  assert.equal(JSON.stringify(state.value.手机._阅读进度), read);
  await view.handleOpenApp('linxin');
  await view.handleOpenApp('map');
  assert.equal(writes, 1, '无新提醒或地图无需额外保存');
  await view.handleOpenApp('weilan');
  assert.equal(view.unread('微澜'), 0);
  assert.equal(writes, 2);
});

test('排队保存只确认进入时的通知，不吞掉随后抵达的新提醒', async () => {
  const { state, runtime, fixture: { view } } = setup();
  const commit = runtime.commit;
  let apply;
  runtime.commit = fn => new Promise((resolve, reject) => {
    apply = () => commit(fn).then(resolve, reject);
  });
  const pending = view.handleOpenApp('linxin');
  state.value.手机._通知.new = structuredClone(vue.toRaw(state.value.手机._通知.linxin));
  await apply();
  await pending;
  assert.equal(state.value.手机._通知.linxin.已读, true);
  assert.equal(state.value.手机._通知.new.已读, false);
});

test('保存失败明确提示且红点保留，不以界面先行清除冒充保存', async () => {
  const { runtime, fixture } = setup();
  runtime.commit = async () => { throw Error('合成写回失败'); };
  await fixture.view.handleOpenApp('weilan');
  assert.equal(fixture.view.currentScreen.value, 'weilan');
  assert.equal(fixture.view.unread('微澜'), 1);
  assert.match(fixture.emissions[0][1], /通知已读保存失败.*合成写回失败/);
});
