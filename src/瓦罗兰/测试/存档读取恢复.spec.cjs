const { test } = require('node:test');
const assert = require('node:assert/strict');
const { environment, Schema, copy, createRuntime, block, deferred, until } = require('./修复宿主.cjs');

test('坏字段不会当作新档，修正后手动读取可恢复且不重置原存档', async () => {
  const e = environment();
  const valid = copy(e.messages[0].data);
  e.messages[0].data.stat_data.玩家.姓名 = [];
  const broken = copy(e.messages[0].data);
  try {
    await e.runtime.start();
    assert.equal(e.runtime.view.data, null);
    assert.match(e.runtime.view.loadError, /玩家.姓名.*格式不正确/);
    assert.deepEqual(e.messages[0].data, broken);
    assert.equal(e.calls.length, 0);
    e.messages[0].data = valid;
    await e.runtime.reload();
    assert.equal(e.runtime.view.loadError, '');
    assert.equal(e.runtime.view.error, '');
    assert.equal(e.runtime.view.data.玩家.姓名, valid.stat_data.玩家.姓名);
    assert.equal(e.runtime.view.data._系统.建档完成, true);
    assert.deepEqual(e.messages[0].data, valid);
    assert.equal(e.calls.length, 0);
  } finally { await e.runtime.dispose(); }
});

test('初次读取异常仍可手动恢复，恢复后事件刷新继续可用', async () => {
  const e = environment();
  const original = copy(e.messages[0].data);
  const read = Mvu.getMvuData;
  let failing = true;
  Mvu.getMvuData = options => { if (failing) throw Error('隔离存档暂时无法读取'); return read(options); };
  try {
    await e.runtime.start();
    assert.equal(e.runtime.view.data, null);
    assert.match(e.runtime.view.loadError, /暂时无法读取/);
    assert.deepEqual(e.messages[0].data, original);
    failing = false;
    await e.runtime.reload();
    assert.equal(e.runtime.view.loadError, '');
    assert.equal(e.runtime.view.data._系统.建档完成, true);
    e.messages[0].data.stat_data.玩家.姓名 = '事件刷新后的姓名';
    await e.listeners.get('edit')();
    assert.equal(e.runtime.view.data.玩家.姓名, '事件刷新后的姓名');
    failing = true;
    e.runtime.refresh();
    assert.match(e.runtime.view.loadError, /暂时无法读取/);
    failing = false;
    await e.runtime.reload();
    assert.equal(e.runtime.view.data.玩家.姓名, '事件刷新后的姓名');
    assert.equal(e.runtime.view.loadError, '');
  } finally { await e.runtime.dispose(); }
});

test('真正的新档和有效旧档可正常读取，玩家原文保存不改变变量或后续楼层', async () => {
  for (const initial of [Schema.parse({}), undefined]) {
    const e = environment(initial);
    try {
      await e.runtime.start();
      assert.equal(e.runtime.view.loadError, '');
      assert.equal(e.runtime.view.data._系统.建档完成, initial ? false : true);
      const text = '  **强调** <thinking>玩家的引用</thinking>\n<UpdateVariable><JSONPatch>[]</JSONPatch></UpdateVariable>\n  ';
      const state = copy(e.messages[0].data);
      e.messages.push({ role: 'user', message: text, data: {}, extra: { plugin: '保留' } });
      e.messages.push({ role: 'assistant', message: '保留后续楼层', data: {}, extra: { cw_incomplete: true } });
      const later = copy(e.messages[2]);
      await e.runtime.messageAction('edit', 1, text);
      assert.equal(e.diskChat[2].mes, text);
      assert.deepEqual(e.messages[0].data, state);
      assert.deepEqual(e.messages[2], later);
      assert.equal(e.calls.length, 0);
    } finally { await e.runtime.dispose(); }
  }
});

test('首次刷新成功后第3次读取失败，待结算正文保留并可重新读取', async () => {
  const e = environment();
  await e.runtime.start();
  e.update = async () => { throw Error('隔离变量尚未结算'); };
  await assert.rejects(e.runtime.send('保留待结算正文'), /尚未结算/);
  const pending = copy(e.vars.澄湾待更新正文);
  await e.runtime.dispose();
  e.runtime = createRuntime();
  const read = Mvu.getMvuData;
  let reads = 0;
  Mvu.getMvuData = options => { if (++reads === 3) throw Error('第三次读取临时失败'); return read(options); };
  try {
    await e.runtime.start();
    assert.match(e.runtime.view.loadError, /第三次读取/);
    assert.equal(e.runtime.view.data._系统.建档完成, true);
    assert.deepEqual(e.vars.澄湾待更新正文, pending);
    assert(e.listeners.has('edit'));
    await e.runtime.reload();
    assert.equal(e.runtime.view.loadError, '');
    assert.deepEqual(e.vars.澄湾待更新正文, pending);
    e.update = async () => block([]);
    await e.runtime.retry();
    assert.equal(e.vars.澄湾待更新正文, null);
    assert.equal(e.messages[2].message, '已经完成的正文');
  } finally { await e.runtime.dispose(); }
});

test('手动重读与恢复串行完成前，不接收业务写入或持久化新请求', async () => {
  const e = environment();
  await e.runtime.start();
  const before = copy(e.messages[0].data), vars = copy(e.vars), writes = e.writes;
  const read = getWorldbook, gate = deferred();
  let waiting = false;
  global.getWorldbook = async (...args) => { waiting = true; await gate.promise; return read(...args); };
  try {
    const recovering = e.runtime.reload();
    await until(() => waiting);
    assert.equal(e.runtime.view.loading, true);
    await assert.rejects(async () => e.runtime.commit(s => { s.玩家.姓名 = '不应提前写入'; }), /先完成存档读取和恢复/);
    await assert.rejects(e.runtime.send('不应提前发送'), /先完成存档读取和恢复/);
    assert.deepEqual(e.messages[0].data, before);
    assert.deepEqual(e.vars, vars);
    assert.equal(e.writes, writes);
    gate.resolve();
    await recovering;
    assert.equal(e.runtime.view.loading, false);
    assert.equal(e.runtime.view.loadError, '');
    await e.runtime.commit(s => { s.玩家.姓名 = '恢复后正常提交'; });
    assert.equal(e.state().玩家.姓名, '恢复后正常提交');
    assert.equal(e.diskChat[1].variables[0].stat_data.玩家.姓名, '恢复后正常提交');
  } finally { gate.resolve(); await e.runtime.dispose(); }
});
