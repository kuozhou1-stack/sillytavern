const assert = require('node:assert/strict');
const { test } = require('node:test');
const { locks } = require('node:worker_threads');
const { block, copy, createRuntime, deferred, environment } = require('./修复宿主.cjs');
const { messageSource } = require('../运行/request-source.ts');

const queue = '澄湾排队操作';
const ruleMarker = '专项世界书规则';
function fixture() {
  const e = environment(undefined, {
    characterAuto: false, informationAuto: false, variable: { mode: 'main' }, phone: { mode: 'main' },
  });
  Object.defineProperty(global, 'navigator', { configurable: true, value: { locks } });
  e.rules[0].content = ruleMarker;
  e.story = async () => '正文' + block([]);
  return e;
}
const saveMode = (e, independent) =>
  e.runtime.saveSettings({ variable: { ...e.runtime.settings.variable, independent } }, 'variable');

async function reopen(e) {
  await e.runtime.dispose();
  const [header, ...rows] = copy(e.diskChat);
  e.vars = header.chat_metadata.variables;
  e.messages = rows.map(row => ({
    role: row.is_user ? 'user' : 'assistant', message: row.mes,
    data: row.variables?.[row.swipe_id ?? 0] ?? {}, extra: row.extra ?? {},
    swipe_id: row.swipe_id, swipes: row.swipes, swipe_info: row.swipe_info,
    swipes_data: row.swipes ? row.variables : undefined,
  }));
  e.runtime = createRuntime();
  await e.runtime.start();
  assert.equal(e.runtime.view.loadError, '');
}

for (const [independent, firstFails] of [[false, false], [true, false], [false, true]]) {
  test(`世界书更新期间排入反向模式和正文，采用最后保存的${independent ? '独立' : '同次'}模式（前次${firstFails ? '失败' : '成功'}）`, async () => {
    const e = fixture(), entered = deferred(), release = deferred();
    const update = global.updateWorldbookWith;
    try {
      await e.runtime.start();
      await saveMode(e, independent);
      let firstWrite = true;
      global.updateWorldbookWith = async (...args) => {
        if (firstWrite) {
          firstWrite = false;
          entered.resolve();
          await release.promise;
          if (firstFails) throw Error('第一次世界书保存失败');
        }
        return update(...args);
      };
      const pending = saveMode(e, !independent);
      const earlier = firstFails ? assert.rejects(pending, /第一次世界书保存失败/) : pending;
      await entered.promise;
      const later = saveMode(e, independent);
      const story = e.runtime.send('重叠期间提交的正文');
      // Let the native shared-settings lock drain before releasing the older worldbook write.
      await locks.request('澄湾设置:' + e.chat, () => {});
      assert.equal(e.calls.length, 0);
      release.resolve();
      await Promise.all([earlier, later, story]);
      assert.equal(e.runtime.settings.variable.independent, independent);
      assert.equal(e.sharedFiles.get('/user/files/valoran-v1-api-variable.json').value.independent, independent);
      assert.deepEqual(e.rules.map(rule => rule.enabled), [!independent, !independent]);
      assert.equal(e.calls[0].config.finalMessages.some(m => m.content.includes(ruleMarker)), !independent);
      assert.equal(e.calls.length, independent ? 2 : 1);
    } finally { release.resolve(); global.updateWorldbookWith = update; await e.runtime.dispose(); }
  });
}

test('模式同步持续失败保留草稿；再发相同输入并重开时没有幽灵待办', async () => {
  const e = fixture(), update = global.updateWorldbookWith;
  let acknowledged = false;
  try {
    await e.runtime.start();
    global.updateWorldbookWith = async () => { throw Error('世界书保存失败'); };
    await assert.rejects(saveMode(e, false), /世界书保存失败/);
    await assert.rejects(e.runtime.send('同一输入', true, undefined, () => { acknowledged = true; }), /世界书保存失败/);
    assert.equal(acknowledged, false);
    assert.equal(e.messages.length, 1);
    assert.equal(e.calls.length, 0);
    assert.deepEqual(e.runtime.view.recoverable, []);
    assert.deepEqual(e.diskChat[0].chat_metadata.variables[queue], []);
    global.updateWorldbookWith = update;
    await e.runtime.send('同一输入', true, undefined, () => { acknowledged = true; });
    assert(acknowledged);
    await reopen(e);
    assert.equal(e.messages.filter(row => row.role === 'user').length, 1);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
    assert.equal(e.calls.length, 1);
    assert.deepEqual(e.runtime.view.recoverable, []);
  } finally { global.updateWorldbookWith = update; await e.runtime.dispose(); }
});

test('旧正文待办按 ID 移除或恢复，规则重试失败仍保留原操作', async () => {
  const e = fixture(), update = global.updateWorldbookWith;
  try {
    await e.runtime.start();
    e.vars[queue] = ['old-1', 'old-2'].map(id => ({
      id, kind: 'story', label: '正文：重复内容', text: '重复内容', append: true, chat: e.chat, source: messageSource(),
    }));
    e.saveDisk();
    await reopen(e);
    global.updateWorldbookWith = async () => { throw Error('世界书保存失败'); };
    await assert.rejects(saveMode(e, false), /世界书保存失败/);
    await assert.rejects(e.runtime.resumeQueued('old-1'), /世界书保存失败/);
    assert.deepEqual(e.runtime.view.recoverable.map(item => item.id), ['old-1', 'old-2']);
    await e.runtime.cancelQueued('old-1');
    assert.deepEqual(e.diskChat[0].chat_metadata.variables[queue].map(item => item.id), ['old-2']);
    assert.equal(e.calls.length, 0);
    global.updateWorldbookWith = update;
    await reopen(e);
    await e.runtime.resumeQueued('old-2');
    assert.equal(e.calls.length, 1);
    assert(e.state()._系统.提交记录['old-2']);
    assert.equal(e.messages.filter(row => row.role === 'user').length, 1);
    assert.deepEqual(e.diskChat[0].chat_metadata.variables[queue], []);
  } finally { global.updateWorldbookWith = update; await e.runtime.dispose(); }
});

test('正文准备失败且待办移除读回失败，报告两次错误并保留可按 ID 处理的记录', async () => {
  const e = fixture(), update = global.updateWorldbookWith;
  try {
    await e.runtime.start();
    global.updateWorldbookWith = async () => { throw Error('世界书保存失败'); };
    await assert.rejects(saveMode(e, false), /世界书保存失败/);
    const read = e.readDisk;
    e.readDisk = () => {
      if (e.diskChat[0].chat_metadata.variables[queue]?.length !== 0) return read();
      e.readDisk = read;
      return new Response('', { status: 503 });
    };
    await assert.rejects(e.runtime.send('清理确认失败的正文'), /世界书保存失败.*正文待办移除未确认.*503/);
    const [record] = e.runtime.view.recoverable;
    assert.equal(e.vars[queue][0].id, record.id);
    await e.runtime.cancelQueued(record.id);
    global.updateWorldbookWith = update;
    await reopen(e);
    assert.deepEqual(e.runtime.view.recoverable, []);
    assert.equal(e.messages.length, 1);
    assert.equal(e.calls.length, 0);
  } finally { global.updateWorldbookWith = update; await e.runtime.dispose(); }
});

test('世界书更新期间切换聊天，原保存和等待中的正文均停止且不更改新聊天', async () => {
  const e = fixture(), entered = deferred(), release = deferred(), update = global.updateWorldbookWith;
  try {
    await e.runtime.start();
    const before = copy(e.rules);
    global.updateWorldbookWith = async (...args) => {
      entered.resolve();
      await release.promise;
      return update(...args);
    };
    const saved = assert.rejects(saveMode(e, false), /页面已失效/);
    await entered.promise;
    const story = assert.rejects(e.runtime.send('旧聊天的输入'), /页面已失效/);
    await locks.request('澄湾设置:' + e.chat, () => {});
    e.chat = 'other-chat';
    e.vars = { 标记: '独立聊天' };
    release.resolve();
    await Promise.all([saved, story]);
    assert.deepEqual(e.rules, before);
    assert.deepEqual(e.vars, { 标记: '独立聊天' });
    assert.equal(e.messages.length, 1);
    assert.equal(e.calls.length, 0);
  } finally { release.resolve(); global.updateWorldbookWith = update; await e.runtime.dispose(); }
});
