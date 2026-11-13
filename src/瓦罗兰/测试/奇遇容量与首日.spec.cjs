const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Schema, copy, withEnv, block } = require('./修复宿主.cjs');
const { applyNovelAction, refreshNovelSystem, assertNovelModel, SYSTEM_GOODS } = require('../运行/novel-system.ts');
const at = 日 => ({ 年: 2026, 月: 9, 日, 时: 10, 分: 0 });
const initial = count => Schema.parse({ _系统: { 建档完成: true }, 玩家: { id: 'player' }, 世界: { 当前时间: at(22) },
  奇遇系统: { _启用: true, 任务: Object.fromEntries(Array.from({ length: count }, (_, i) => ['long_' + i, { 名称: '长期目标' + i, 类型: '成长', 目标: '长期目标内容' + i }])) } });

test('原卡未定日首次开启仍有三日常、九正价商品和一次30赠礼；首日衔接不双发', () => {
  const state = Schema.parse({ _系统: { 建档完成: true }, 玩家: { id: 'player' } });
  applyNovelAction(state, { kind: 'enable', operationId: 'enable' });
  assert.equal(Object.keys(state.奇遇系统.任务).length, 3);
  assert.equal(SYSTEM_GOODS.length, 9); assert(SYSTEM_GOODS.every(good => good.price > 0));
  assert.equal(state.奇遇系统._系统币, 30);
  const id = Object.keys(state.奇遇系统.任务)[0];
  applyNovelAction(state, { kind: 'accept', id, operationId: 'accept' });
  state.奇遇系统.任务[id].进度 = 50;
  const originalIds = Object.keys(state.奇遇系统.任务);
  state.世界.当前时间 = at(22); refreshNovelSystem(state); refreshNovelSystem(state);
  assert.deepEqual(Object.keys(state.奇遇系统.任务), originalIds);
  assert.equal(state.奇遇系统.任务[id].进度, 50);
  assert.equal(state.奇遇系统.任务[id].有效日, '2026-09-22');
  assert.equal(state.奇遇系统._任务记录[id].状态, '进行中');
  assertNovelModel(state, copy(state));
  applyNovelAction(state, { kind: 'enable', operationId: 'enable_again' });
  assert.equal(state.奇遇系统._系统币, 30);
  state.世界.当前时间 = at(23); refreshNovelSystem(state);
  assert.equal(Object.keys(state.奇遇系统.任务).length, 6);
  assert.equal(state.奇遇系统.任务[id].进度, 50);
});

test('0至8项已有长期任务只补剩余名额，同日重载不重复，长期任务不被挤走', () => {
  for (let count = 0; count <= 8; count++) {
    const state = initial(count), old = copy(state.奇遇系统.任务);
    refreshNovelSystem(state); refreshNovelSystem(state);
    assert.equal(Object.keys(state.奇遇系统.任务).length, count + Math.min(3, 8 - count));
    for (const [id, task] of Object.entries(old)) assert.deepEqual(state.奇遇系统.任务[id], task);
  }
});

for (const count of [8, 9]) test(`已有${count}项跨日且正文空补丁仍可保存，禁止增加超额新任务`, async () => {
  const state = initial(count), expected = copy(state.奇遇系统.任务);
  state.世界.当前时间 = at(23);
  refreshNovelSystem(state); assert.deepEqual(state.奇遇系统.任务, expected);
  assertNovelModel(state, copy(state));
  const added = copy(state); added.奇遇系统.任务.extra = Schema.parse({ 奇遇系统: { 任务: { extra: { 名称: '新增', 类型: '成长', 目标: '新增内容' } } } }).奇遇系统.任务.extra;
  assert.throws(() => assertNovelModel(state, added), /最多 8/);
  await withEnv(async e => {
    e.update = async () => block([]); await e.runtime.send('继续普通行程');
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
    assert.deepEqual(e.state().奇遇系统.任务, expected);
    assert.deepEqual(e.diskChat.at(-1).variables[0].stat_data.奇遇系统.任务, expected);
  }, state);
});
