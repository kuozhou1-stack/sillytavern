const test = require('node:test');
const assert = require('node:assert/strict');
require('./修复宿主.cjs');
const { savedChanges } = require('../运行/variable-changes.ts');
const { compactChangeRows } = require('../界面/桌面端/utils/change-display.ts');

const noon = { 年: 2026, 月: 11, 日: 18, 时: 12, 分: 0 };

test('不同记录的同名时间分别呈现；只变分钟时保留分钟，新增完整时间时合并五项', () => {
  const raw = savedChanges(
    { 事件: { A: { 起始时间: noon } } },
    { 事件: { A: { 起始时间: { ...noon, 分: 8 } }, B: { 起始时间: noon } } },
  );
  const original = structuredClone(raw);
  const rows = compactChangeRows(raw);
  assert.deepEqual(rows.map(row => [row.path, row.before, row.after, row.delta]), [
    ['/事件/A/起始时间', '0分', '8分', ''],
    ['/事件/B/起始时间', '未记录', '2026年11月18日 12:00', ''],
  ]);
  assert.deepEqual(raw, original);
});

test('整段日期从未知变为已知、再变回未知时列出实际时间', () => {
  const unknown = { 世界: { 当前时间: null } };
  const known = { 世界: { 当前时间: noon } };
  assert.equal(savedChanges(unknown, known)[0].after, '2026年11月18日 12:00');
  assert.equal(savedChanges(known, unknown)[0].before, '2026年11月18日 12:00');
});

test('跨午夜仅组合本轮有变化的日期和钟点，资金差额继续单列', () => {
  const raw = savedChanges(
    { 世界: { 当前时间: { ...noon, 日: 17, 时: 23, 分: 59 } }, 玩家: { 资金: { 余额分: 1200 } } },
    { 世界: { 当前时间: { ...noon, 时: 0 } }, 玩家: { 资金: { 余额分: 1100 } } },
  );
  const rows = compactChangeRows(raw);
  assert.deepEqual(rows.map(row => [row.before, row.after, row.delta]), [
    ['17日 23:59', '18日 00:00', ''],
    ['1200', '1100', '-100'],
  ]);
});
