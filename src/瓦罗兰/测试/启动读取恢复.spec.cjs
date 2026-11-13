const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { environment, copy, deferred, until } = require('./修复宿主.cjs');

async function boot(options = {}) {
  const e = environment();
  const original = copy(e.messages[0].data);
  const host = window.parent;
  const getMvu = Mvu.getMvuData;
  const getVars = getVariables;
  let reads = 0, failing = !!options.persistent;
  let floorReady = !options.waitFloor;
  Mvu.getMvuData = option => {
    reads++;
    if (failing || (options.third && reads === 3)) throw Error(options.third ? '启动第3次读取失败' : '启动持续读取失败');
    return getMvu(option);
  };
  global.getVariables = option => option.type === 'message' && !floorReady ? {} : getVars(option);
  if (options.worldbook) global.getWorldbook = async () => { throw Error('隔离世界书暂时无法读取'); };
  const mvuGate = deferred();
  if (!options.waitMvu) mvuGate.resolve();
  let task, onHide;
  global.$ = value => typeof value === 'function' ? value() : { one(_name, fn) { onHide = fn; } };
  global.waitGlobalInitialized = () => mvuGate.promise;
  global.initializeGlobal = () => {};
  global.registerMacroLike = () => ({ unregister() {} });
  global.eventEmit = async () => {};
  global.errorCatched = fn => (...args) => { task = fn(...args); return task; };
  const entry = path.join(__dirname, '../脚本/辅助API/index.ts');
  delete require.cache[require.resolve(entry)];
  require(entry);
  return { e, host, original, task: () => task, reads: () => reads,
    recover() { failing = false; }, releaseMvu() { mvuGate.resolve(); }, releaseFloor() { floorReady = true; },
    async close() { onHide?.(); await host.__chengwanService?.runtime?.dispose(); await e.runtime.dispose(); } };
}

for (const scenario of [{ third: true }, { persistent: true }, { worldbook: true }]) {
  test('完整辅助API入口保留就绪和恢复入口：' + Object.keys(scenario)[0], async () => {
    const b = await boot(scenario);
    try {
      await b.task();
      assert.equal(b.host.__chengwanService.ready, true);
      const runtime = b.host.__chengwanService.runtime;
      assert.match(runtime.view.loadError, /暂时无法读取|读取失败/);
      assert.equal(runtime.view.loadPhase, scenario.worldbook ? 'worldbook' : scenario.third ? 'recovery' : 'read');
      assert(b.e.listeners.has('edit'));
      assert.deepEqual(b.e.messages[0].data, b.original);
      assert.equal(b.e.calls.length, 0);
      b.recover();
      if (scenario.worldbook) global.getWorldbook = async () => copy(b.e.rules);
      await runtime.reload();
      assert.equal(runtime.view.loadError, '');
      assert.equal(runtime.view.data._系统.建档完成, true);
      assert.equal(b.host.__chengwanService.runtime, runtime);
    } finally { await b.close(); }
  });
}

test('辅助API仍等待MVU和第0楼变量就绪，不用默认空数据替代', async () => {
  const b = await boot({ waitMvu: true, waitFloor: true });
  try {
    assert.equal(b.host.__chengwanService.ready, false);
    assert.equal(b.reads(), 0);
    b.releaseMvu();
    await until(() => !!b.host.__chengwanService);
    assert.equal(b.host.__chengwanService.ready, false);
    assert.equal(b.reads(), 0);
    b.releaseFloor();
    await b.task();
    assert.equal(b.host.__chengwanService.ready, true);
    assert.equal(b.host.__chengwanService.runtime.view.loadError, '');
  } finally { await b.close(); }
});
