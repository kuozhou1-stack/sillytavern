// Actual LinxinApp setup + UI draft store; Runtime/storage/model are isolated contract stubs.
const test = require('node:test');
const assert = require('node:assert/strict');
const { component, seed, scopes, vue } = require('./手机重构测试夹具.cjs');
test.afterEach(() => { for (const scope of scopes.splice(0)) scope.stop(); });

function setup(original = '十点见') {
  const state = vue.ref(seed());
  const context = vue.reactive({ chat: 'tavern-A', floor: 0, swipe: 0, branch: 'branch-A' });
  const identity = { id: 'request-A', kind: 'send', targetId: 'private', platform: '邻信', chatId: context.chat, floor: 0, swipe: 0 };
  const confirmed = () => ({ ...identity, type: 'phone', status: 'confirmed' });
  let discarded = 0;
  let calls = 0;
  const runtime = {
    service: { host: { context: () => ({ ...context }) } },
    view: vue.reactive({ data: state.value, busy: false, updating: false, operation: '', phoneRequest: null, error: '' }),
    async phoneAction(_action, onRequest) {
      calls++;
      onRequest?.({ ...identity });
      runtime.view.phoneRequest = { ...identity, status: 'sending' };
      runtime.view.phoneRequest = { ...identity, status: 'failed' };
      runtime.view.error = '隔离测试发送失败';
      throw Error(runtime.view.error);
    },
    async retry() {
      runtime.view.phoneRequest = null;
      runtime.view.error = '';
      return confirmed();
    },
    async discardPending() { discarded++; runtime.view.phoneRequest = null; runtime.view.error = ''; },
  };
  const mount = () => {
    const fixture = component('apps/LinxinApp', state, runtime, { player: state.value.玩家 });
    fixture.view.activeChatId.value = 'private';
    return fixture.view;
  };
  const view = mount();
  view.draftReply.value = original;
  return { view, mount, runtime, state, context, identity, confirmed, calls: () => calls, discarded: () => discarded };
}
function deferredRetry(e) {
  let release;
  let count = 0;
  e.runtime.retry = async () => {
    count++;
    e.runtime.view.phoneRequest = { ...e.identity, status: 'saving' };
    const result = await new Promise(resolve => { release = resolve; });
    e.runtime.view.phoneRequest = null;
    e.runtime.view.error = '';
    return result;
  };
  return { release: value => release(value), count: () => count };
}

test('F05/F06：失败→重试→保存确认，等待期间不重复发送，清理含空格的原稿', async () => {
  const e = setup('  十点见  ');
  await e.view.sendImReply();
  assert.equal(e.view.draftReply.value, '  十点见  ');
  assert.match(e.view.activeChatError.value, /失败/);
  const retry = deferredRetry(e);
  const pending = e.view.retryActiveTask();
  assert.equal(e.view.isPhoneBusy.value, true);
  assert.match(e.view.phoneStatusText.value, /保存/);
  assert.equal(e.view.activeChatError.value, '');
  e.runtime.view.phoneRequest = null;
  e.runtime.view.busy = false;
  assert.equal(e.view.isPhoneBusy.value, true, 'Runtime清状态后仍须等待最终Promise确认');
  await e.view.retryActiveTask();
  await e.view.sendImReply();
  assert.equal(retry.count(), 1);
  assert.equal(e.calls(), 1);
  retry.release(e.confirmed());
  await pending;
  assert.equal(e.view.draftReply.value, '');
  assert.equal(e.view.isPhoneBusy.value, false);
});

test('F06：重试再次失败或停止，保留草稿并显示错误', async () => {
  for (const reason of ['重试保存失败', '手机任务已取消']) {
    const e = setup();
    await e.view.sendImReply();
    e.runtime.retry = async () => { throw Error(reason); };
    await e.view.retryActiveTask();
    assert.equal(e.view.draftReply.value, '十点见');
    assert.ok(e.view.activeChatError.value.includes(reason));
    assert.equal(e.view.isPhoneBusy.value, false);
  }
});

test('F06：缺失、未确认或归属不符的回执均不能清稿', async () => {
  const variants = [undefined, { id: 'another' }, { targetId: 'gc' }, { chatId: 'other-chat' },
    { floor: 1 }, { swipe: 1 }, { platform: '论坛' }, { kind: 'post' }, { status: 'saving' }, { type: 'story' }];
  for (const patch of variants) {
    const e = setup();
    await e.view.sendImReply();
    e.runtime.retry = async () => patch ? { ...e.confirmed(), ...patch } : undefined;
    await e.view.retryActiveTask();
    assert.equal(e.view.draftReply.value, '十点见', JSON.stringify(patch));
  }
});

test('F06：用户已改草稿，匹配的成功回执也不能清掉新稿', async () => {
  const e = setup();
  await e.view.sendImReply();
  e.view.draftReply.value = '改为十一点见';
  await e.view.retryActiveTask();
  assert.equal(e.view.draftReply.value, '改为十一点见');
});

test('F06：重试前及重试中切换邻信会话，只清理原会话已确认的原稿', async () => {
  for (const switchDuring of [false, true]) {
    const e = setup();
    await e.view.sendImReply();
    const retry = deferredRetry(e);
    const switchChat = () => { e.view.activeChatId.value = 'gc'; e.view.draftReply.value = '群聊草稿'; };
    if (!switchDuring) switchChat();
    const pending = e.view.retryActiveTask();
    if (switchDuring) switchChat();
    retry.release(e.confirmed());
    await pending;
    assert.equal(e.view.draftReply.value, '群聊草稿');
    e.view.activeChatId.value = 'private';
    assert.equal(e.view.draftReply.value, '');
  }
});

test('F08：关闭/重开组件保留草稿、请求关联及等待确认锁', async () => {
  const e = setup();
  await e.view.sendImReply();
  const retry = deferredRetry(e);
  const pending = e.view.retryActiveTask();
  scopes.at(-1).stop();
  const reopened = e.mount();
  assert.equal(reopened.draftReply.value, '十点见');
  assert.equal(reopened.isPhoneBusy.value, true);
  retry.release(e.confirmed());
  await pending;
  assert.equal(reopened.draftReply.value, '');
  assert.equal(reopened.isPhoneBusy.value, false);
});

test('F08：关闭时请求尚在排队，稍后启动和确认仍归属原草稿', async () => {
  const e = setup();
  let release;
  e.runtime.phoneAction = async (_action, onRequest) => {
    await new Promise(resolve => { release = resolve; });
    onRequest?.({ ...e.identity });
    e.runtime.view.phoneRequest = { ...e.identity, status: 'sending' };
    e.runtime.view.phoneRequest = null;
    return e.confirmed();
  };
  const pending = e.view.sendImReply();
  scopes.at(-1).stop();
  const reopened = e.mount();
  assert.equal(reopened.isPhoneBusy.value, true);
  release();
  await pending;
  assert.equal(reopened.draftReply.value, '');
});

test('F08：Runtime、聊天、楼层、候选和分支均隔离；迟到结果不清其他范围草稿', async () => {
  for (const patch of [{ chat: 'tavern-B' }, { floor: 1 }, { swipe: 1 }, { branch: 'branch-B' }]) {
    const e = setup();
    await e.view.sendImReply();
    const oldContext = { ...e.context };
    const retry = deferredRetry(e);
    const pending = e.view.retryActiveTask();
    Object.assign(e.context, patch);
    assert.equal(e.view.draftReply.value, '');
    e.view.draftReply.value = '新范围草稿';
    retry.release(e.confirmed());
    await pending;
    assert.equal(e.view.draftReply.value, '新范围草稿');
    Object.assign(e.context, oldContext);
    assert.equal(e.view.draftReply.value, '十点见', '原范围未获当前有效确认，仍保留');
  }
  const first = setup('原Runtime草稿');
  const second = setup('');
  assert.equal(second.view.draftReply.value, '');
  assert.equal(first.view.draftReply.value, '原Runtime草稿');
});

test('F06：取消待处理保留原稿，旧成功结果不能沿用已取消关联清稿', async () => {
  const e = setup();
  await e.view.sendImReply();
  await e.view.discardActiveTask();
  assert.equal(e.discarded(), 1);
  assert.equal(e.view.draftReply.value, '十点见');
  await e.view.retryActiveTask();
  assert.equal(e.view.draftReply.value, '十点见');
});

test('F05：真实生命周期的结算/保存/停止状态可见且禁用重复动作', () => {
  const e = setup();
  for (const [status, text] of [['settling', '结算'], ['saving', '保存'], ['stopping', '停止']]) {
    e.runtime.view.phoneRequest = { ...e.identity, status };
    assert.equal(e.view.isPhoneBusy.value, true);
    assert.ok(e.view.phoneStatusText.value.includes(text));
  }
});

test('F06：首次发送也须核对回执；成功只清原稿，空回执保留', async () => {
  for (const success of [false, true]) {
    const e = setup();
    e.runtime.phoneAction = async (_action, onRequest) => {
      onRequest?.({ ...e.identity });
      e.runtime.view.phoneRequest = { ...e.identity, status: 'sending' };
      e.runtime.view.phoneRequest = null;
      return success ? e.confirmed() : undefined;
    };
    await e.view.sendImReply();
    assert.equal(e.view.draftReply.value, success ? '' : '十点见');
  }
});

test('F05：切到另一会话时，失败和进行中提示明确标注请求原会话', async () => {
  const e = setup();
  await e.view.sendImReply();
  e.view.activeChatId.value = 'gc';
  assert.match(e.view.activeChatError.value, /另一会话/);
  e.runtime.view.phoneRequest = { ...e.identity, status: 'saving' };
  assert.match(e.view.phoneStatusText.value, /另一会话/);
  e.runtime.view.phoneRequest = { ...e.identity, platform: '论坛', status: 'saving' };
  assert.match(e.view.phoneStatusText.value, /论坛操作/);
});

test('F06：同目标后续请求不能继承前一个请求的草稿关联', async () => {
  const e = setup();
  e.runtime.phoneAction = async (_action, onRequest) => {
    onRequest?.({ ...e.identity });
    e.runtime.view.phoneRequest = { ...e.identity, status: 'sending' };
    e.runtime.view.phoneRequest = { ...e.identity, id: 'request-B', status: 'sending' };
    return { ...e.confirmed(), id: 'request-B' };
  };
  await e.view.sendImReply();
  assert.equal(e.view.draftReply.value, '十点见');
  assert.deepEqual(Object.keys(e.view.draftSession.value.submitted), ['request-A']);
});

test('F08：运行服务进入只读后不接受迟到确认，恢复后仍保留原稿', async () => {
  const e = setup();
  await e.view.sendImReply();
  const retry = deferredRetry(e);
  const pending = e.view.retryActiveTask();
  e.runtime.view.readOnly = true;
  retry.release(e.confirmed());
  await pending;
  e.runtime.view.readOnly = false;
  assert.equal(e.view.draftReply.value, '十点见');
});
