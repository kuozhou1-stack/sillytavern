const { test } = require('node:test');
const assert = require('node:assert/strict');
const { component, html, scopes, vue } = require('./手机重构测试夹具.cjs');

test('任务按钮在各阶段保留，恢复沿用原请求，商店不会接管任务请求', async () => {
  const calls = [];
  const view = vue.reactive({
    operation: '', busy: false, updating: false, readOnly: false,
    activeNovelTarget: null, queued: [], recoverable: [], error: '',
  });
  const runtime = { view, novelRefresh() {}, resumeQueued: id => calls.push(['恢复', id]), cancelQueued: id => calls.push(['取消', id]) };
  const props = vue.reactive({ target: 'tasks', disabled: false });
  const button = component('../novel-system/NovelRefreshControl', null, runtime, props);
  try {
    assert.match(await html(button), /刷新任务/);
    await button.view.refresh();
    assert.deepEqual(button.emissions, [['refresh']]);

    props.disabled = true;
    view.operation = 'novel';
    view.activeNovelTarget = 'tasks';
    const running = await html(button);
    assert.match(running, /data-action="refresh-tasks"[^>]*disabled/);
    assert.match(running, /data-action="stop-refresh"/);
    assert.match(running, />刷新任务</);

    view.operation = '';
    view.activeNovelTarget = null;
    view.recoverable = [{ id: 'prior', kind: 'novel', target: 'tasks' }];
    assert.equal(button.view.primaryDisabled.value, false);
    await button.view.refresh();
    await button.view.cancel();
    assert.deepEqual(calls, [['恢复', 'prior'], ['取消', 'prior']]);
    props.target = 'shop';
    const shop = await html(button);
    assert.match(shop, /data-action="refresh-shop"[^>]*disabled/);
    assert.doesNotMatch(shop, /取消|stop-refresh/);
    view.recoverable = [{ id: 'opening', kind: 'novel', target: 'initial' }];
    assert.equal(button.view.primaryDisabled.value, true);
    props.target = 'tasks';
    await button.view.refresh();
    assert.deepEqual(calls.at(-1), ['恢复', 'opening']);

    view.recoverable = [];
    view.queued = [{ id: 'waiting', kind: 'novel', target: 'tasks' }];
    assert.match(await html(button), /data-action="refresh-tasks"[^>]*disabled/);
    await button.view.cancel();
    assert.deepEqual(calls.at(-1), ['取消', 'waiting']);
  } finally {
    scopes.pop().stop();
  }
});
