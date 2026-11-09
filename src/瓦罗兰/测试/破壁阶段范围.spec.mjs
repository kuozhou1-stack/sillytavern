import assert from 'node:assert/strict';
import test from 'node:test';
import z from 'zod';
import _ from 'lodash';

globalThis.z = z;
globalThis._ = _;
const { Schema } = await import('../schema.ts');

function source(tier, stage) {
  return {
    玩家: { id: 'player', 姓名: '玩家' },
    角色: {
      actor: {
        层级: tier,
        姓名: '测试角色',
        关系网: {
          player: { 破壁阶段: stage, 关系: '队友', 来源事件id: ['shared_event'] },
          colleague: { 破壁阶段: stage, 关系: '同事', 已知私密: ['有一项未公开的个人目标'] },
        },
      },
    },
  };
}

function assertStages(state, expected) {
  for (const target of ['player', 'colleague']) {
    assert.equal(state.角色.actor.关系网[target].破壁阶段, expected, target);
  }
}

function freezeDeep(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

for (const tier of ['主要', '次要']) {
  test(`${tier}角色：破壁阶段保留旧档0和1至5，继续接受数字字符串`, () => {
    for (const stage of [0, 1, 2, 3, 4, 5]) {
      for (const value of [stage, String(stage), ` ${stage} `]) {
        assertStages(Schema.parse(source(tier, value)), stage);
      }
    }
    assertStages(Schema.parse(source(tier, '1.0')), 1);
    assertStages(Schema.parse(source(tier, '2e0')), 2);
  });

  test(`${tier}角色：未知或缺失阶段保持null，不变成旧档0或主动创建关系`, () => {
    for (const value of [null, undefined]) assertStages(Schema.parse(source(tier, value)), null);
    const omitted = source(tier, 2);
    delete omitted.角色.actor.关系网.player.破壁阶段;
    delete omitted.角色.actor.关系网.colleague.破壁阶段;
    assertStages(Schema.parse(omitted), null);
    assert.deepEqual(Schema.parse({ 角色: { actor: { 层级: tier } } }).角色.actor.关系网, {});
  });

  test(`${tier}角色：越界历史整数安全转null，不制造最高阶段或改写其他关系事实`, () => {
    for (const value of [-1, 6, 99, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, '-1', '6', ' 99 ']) {
      const input = source(tier, value);
      const before = structuredClone(input);
      freezeDeep(input);
      const parsed = Schema.parse(input);
      assertStages(parsed, null);
      assert.equal(parsed.角色.actor.关系网.player.关系, '队友');
      assert.deepEqual(parsed.角色.actor.关系网.player.来源事件id, ['shared_event']);
      assert.equal(parsed.角色.actor.关系网.colleague.关系, '同事');
      assert.deepEqual(parsed.角色.actor.关系网.colleague.已知私密, ['有一项未公开的个人目标']);
      assert.deepEqual(Schema.parse(parsed), parsed);
      assert.deepEqual(input, before);
    }
  });

  test(`${tier}角色：小数与非法类型仍拒绝，不通过越界迁移掩盖错误`, () => {
    for (const value of [0.5, 5.5, -1.5, '1.5', '6.5', '', '  ', '未知', true, false, [], {}, NaN, Infinity, -Infinity]) {
      const result = Schema.safeParse(source(tier, value));
      assert.equal(result.success, false, `不应接受 ${String(value)}`);
      assert(result.error.issues.some(issue => issue.path.includes('破壁阶段')));
    }
  });
}

test('主要与次要角色混合旧档：归一化后可反复解析，零值、未知及全部其他事实不变，输入不变', () => {
  const input = {
    世界: { 当前时间: { 年: 2026, 月: 10, 日: 3, 时: 12, 分: 0 } },
    角色: {
      major: { 层级: '主要', 关系网: { minor: { 破壁阶段: 0, 好感度: 0, 信任度: -10 } } },
      minor: { 层级: '次要', 关系网: { major: { 破壁阶段: '5' }, unknown: { 破壁阶段: 42 }, newcomer: {} } },
    },
  };
  const before = structuredClone(input);
  freezeDeep(input);
  const once = Schema.parse(input);
  const twice = Schema.parse(once);
  assert.deepEqual(twice, once);
  assert.deepEqual(Schema.parse(twice), once);
  assert.equal(once.角色.major.关系网.minor.破壁阶段, 0);
  assert.equal(once.角色.major.关系网.minor.好感度, 0);
  assert.equal(once.角色.major.关系网.minor.信任度, -10);
  assert.equal(once.角色.minor.关系网.major.破壁阶段, 5);
  assert.equal(once.角色.minor.关系网.unknown.破壁阶段, null);
  assert.equal(once.角色.minor.关系网.newcomer.破壁阶段, null);
  assert.deepEqual(input, before);
});
