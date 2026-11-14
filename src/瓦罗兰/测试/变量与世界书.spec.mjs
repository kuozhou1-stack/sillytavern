import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import z from 'zod';
import YAML from 'yaml';
import ts from 'typescript';
import { Schema, root, read, readYaml, createInputJsonSchema } from '../工具/生成派生产物.mjs';
import { atPath, typeOf, ruleTypeOf, ruleLeaves, ruleTypeDeclarations } from '../工具/schema-utils.mjs';
import { compactJsonSchema } from '../工具/compact-json-schema.mjs';
import { generateRuleTypes, renderRuleTypes } from '../工具/生成规则类型.mjs';
import { bundleWorldbook } from '../工具/打包世界书.mjs';
import { collectWorldInformation } from '../工具/生成世界资料.mjs';

const seed = () => readYaml('世界书/变量/initvar.yaml');
const time = (年, 月, 日, 时 = 0, 分 = 0) => ({ 年, 月, 日, 时, 分 });
const actor = data => Schema.parse({ 角色: { a: data } }).角色.a;

test('旧身份值迁移到新键，保留其他分组内容，删除籍贯与交通字段且解析幂等', () => {
  const source = {
    玩家: { 籍贯: '旧值', 身份: { 当前职业: '学生', 社会身份: '社团成员', 工作或就读单位: '大学', 组织id: ['club'] } },
    角色: { a: { 层级: '主要', 姓名: '甲', 籍贯: '旧值', 身份: '教师', 种族: '人类', 当前形态: '人形' } },
    世界: { 交通情况: { old: { 状况: '拥堵' } } },
  };
  const before = structuredClone(source);
  const parsed = Schema.parse(source);
  assert.deepEqual(parsed.玩家.身份, { 身份: '学生', 社会身份: '社团成员', 工作或就读单位: '大学', 组织id: ['club'] });
  assert(!Object.hasOwn(parsed.玩家, '籍贯'));
  assert(!Object.hasOwn(parsed.角色.a, '籍贯'));
  assert(!Object.hasOwn(parsed.世界, '交通情况'));
  assert.equal(parsed.角色.a.身份, '教师');
  assert.deepEqual(Schema.parse(parsed), parsed);
  assert.deepEqual(source, before);
  const inputSchema = JSON.stringify(createInputJsonSchema());
  assert(!/当前职业|籍贯|交通情况/.test(inputSchema));
});

test('身份新值与明确清空优先于旧值，信任双向边界与未知分别保留', () => {
  for (const value of ['新身份', null])
    assert.equal(Schema.parse({ 玩家: { 身份: { 身份: value, 当前职业: '旧身份' } } }).玩家.身份.身份, value);
  for (const tier of ['主要', '次要']) {
    for (const [value, expected] of [[-150, -100], [-100, -100], [-35, -35], [0, 0], [100, 100], [150, 100], ['-25', -25], [null, null]])
      assert.equal(actor({ 层级: tier, 关系网: { player: { 信任度: value } } }).关系网.player.信任度, expected);
  }
});

test('旧存档补齐空技能栏与未知种族形态，已有事实不变且重复解析幂等', () => {
  const legacy = {
    玩家: { 姓名: '测试玩家', 资金: { 余额分: 0 } },
    角色: {
      major: { 层级: '主要', 姓名: '甲', 性别: '男', 当前地点id: 'place_a' },
      minor: { 层级: '次要', 姓名: '乙', 关系网: { major: { 信任度: 25 } } },
    },
  };
  const original = structuredClone(legacy);
  const parsed = Schema.parse(legacy);
  assert.deepEqual(parsed.玩家.技能栏, {});
  assert.equal(parsed.玩家.资金.余额分, 0);
  for (const person of Object.values(parsed.角色)) {
    assert.equal(person.种族, null);
    assert.equal(person.当前形态, null);
  }
  assert.equal(parsed.角色.major.当前地点id, 'place_a');
  assert.equal(parsed.角色.minor.关系网.major.信任度, 25);
  assert.deepEqual(Schema.parse(parsed), parsed);
  assert.deepEqual(legacy, original);
});

test('技能品质与角色种族形态无固定枚举，明确数据无损保存，错误类型拒绝', () => {
  const input = {
    玩家: { 技能栏: { cooking: { 名称: '家常烹饪', 品质: '生活精通', 描述: '能独立做好几道家常菜' }, unknown: {} } },
    角色: {
      major: { 层级: '主要', 种族: '人类', 当前形态: '常态' },
      minor: { 层级: '次要', 种族: '自定义种族', 当前形态: '自定义形态' },
    },
  };
  const state = Schema.parse(input);
  assert.deepEqual(state.玩家.技能栏.cooking, input.玩家.技能栏.cooking);
  assert.deepEqual(state.玩家.技能栏.unknown, { 名称: null, 品质: null, 描述: null });
  for (const id of ['major', 'minor']) {
    assert.equal(state.角色[id].种族, input.角色[id].种族);
    assert.equal(state.角色[id].当前形态, input.角色[id].当前形态);
  }
  assert.deepEqual(Schema.parse(JSON.parse(JSON.stringify(state))), state);
  for (const key of ['名称', '品质', '描述'])
    assert.equal(Schema.safeParse({ 玩家: { 技能栏: { bad: { [key]: 42 } } } }).success, false);
  for (const 层级 of ['主要', '次要'])
    for (const key of ['种族', '当前形态'])
      assert.equal(Schema.safeParse({ 角色: { bad: { 层级, [key]: ['错误数组'] } } }).success, false);
});

test('初值完整且解析不补写、无默认人物资产身份', () => {
  const s = seed();
  assert.deepEqual(Schema.parse(s), s);
  assert.deepEqual(Object.keys(s), ['世界', '玩家', '角色', '地点', '约定', '事件', '组织', '手机', '奇遇系统', '_系统']);
  assert.equal(s.奇遇系统._启用, false);
  assert.equal(s.奇遇系统._系统币, 0);
  assert.deepEqual(s.奇遇系统.任务, {});
  assert.equal(s.玩家.年龄, null);
  assert.equal(s.玩家.id, null);
  assert.equal(s.玩家.当前状态.当前地点id, null);
  assert.equal(s._系统.建档完成, false);
  for (const empty of [
    s.角色,
    s.手机.账号,
    s.手机.联系人,
    s.手机.群,
    s.玩家.物品栏,
    s.玩家.资金.交易,
  ])
    assert.deepEqual(empty, {});
});

test('瓦罗兰城市、周边文明与维度地标均与独立设定一致，所有归属和坐标有效', () => {
  const s = seed();
  assert.equal(Object.keys(s.世界.片区).length, 16);
  const expectedPlaces = {};
  const areaFiles = readYaml('世界资料来源.yaml').地区.map(文件 => ({ 文件 }));
  for (const entry of areaFiles) {
    const file = readYaml('世界书/' + entry.文件);
    if (!file.片区id) continue;
    assert.deepEqual(file.片区, s.世界.片区[file.片区id]);
    for (const [id, value] of Object.entries(file.场所)) {
      assert(!Object.hasOwn(expectedPlaces, id), `地点重复：${id}`);
      expectedPlaces[id] = value;
    }
  }
  assert.deepEqual(Object.keys(s.地点).sort(), Object.keys(expectedPlaces).sort());
  assert.deepEqual(s.地点, collectWorldInformation().地点);
  assert.deepEqual(s.组织, collectWorldInformation().组织);
  for (const place of Object.values(s.地点)) {
    assert(s.世界.片区[place.片区id]);
    if (place.地图位置.精度 === '地点') {
      assert(Number.isFinite(place.地图位置.x) && place.地图位置.x >= 0 && place.地图位置.x <= 1000);
      assert(Number.isFinite(place.地图位置.y) && place.地图位置.y >= 0 && place.地图位置.y <= 700);
    }
    assert.deepEqual(place.关联人物, {});
  }
});

test('除地点设定和程序状态外，建档前全部剧情标量留空', () => {
  const s = seed();
  function checkEmpty(value, parts = []) {
    if (parts[0] === '地点' || parts[0] === '组织' || parts[0] === '_系统' || parts.some(key => key.startsWith('_'))) return;
    if (['世界.基础信息', '世界.片区'].includes(parts.join('.'))) return;
    if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) checkEmpty(child, [...parts, key]);
    } else assert.equal(value, null, parts.join('.'));
  }
  checkEmpty(s);
  for (const input of [{}, { 世界: {}, 玩家: {} }]) {
    const parsed = Schema.parse(input);
    assert.equal(parsed.世界.当前时间, null);
    assert.equal(parsed.世界.开局时间, null);
    assert.equal(parsed.世界.天气.天气状况, null);
    assert.equal(parsed.世界.天气.适用区域, null);
    assert.equal(parsed.玩家.资金.余额分, null);
  }
  for (const 层级 of ['主要', '次要']) {
    const relation = actor({ 层级, 关系网: { player: {} } }).关系网.player;
    assert.equal(relation.好感度, null);
    assert.equal(relation.信任度, null);
  }
});

test('三条身体状态保持未知与零的区别，限制在0～100且拒绝非数值', () => {
  for (const field of ['饱食度', '水分值', '体力值']) {
    const parse = value => Schema.parse({ 玩家: { 当前状态: { [field]: value } } }).玩家.当前状态[field];
    for (const [input, expected] of [
      [undefined, null],
      [null, null],
      [0, 0],
      ['0', 0],
      [19.5, 19.5],
      [' 20 ', 20],
      [100, 100],
      [-3, 0],
      [140, 100],
    ])
      assert.equal(parse(input), expected, `${field}: ${input}`);
    for (const bad of ['', ' ', false, true, '未知', Number.NaN, Infinity, -Infinity])
      assert.equal(Schema.safeParse({ 玩家: { 当前状态: { [field]: bad } } }).success, false, `${field}: ${bad}`);
  }
  const state = Schema.parse({ 玩家: { 当前状态: { 饱食度: 15, 水分值: null, 体力值: 0 } } });
  assert.deepEqual(Schema.parse(state), state);
  for (const 层级 of ['主要', '次要']) {
    const npc = actor({ 层级 });
    for (const field of ['饱食度', '水分值', '体力值']) assert(!Object.hasOwn(npc, field));
  }
});

test('移除时间、天气或玩家状态后回到未知，不补旧开局默认', () => {
  const s = seed();
  delete s.世界.当前时间;
  delete s.世界.开局时间;
  delete s.世界.天气;
  delete s.玩家.当前状态;
  const parsed = Schema.parse(s);
  assert.equal(parsed.世界.当前时间, null);
  assert.equal(parsed.世界.开局时间, null);
  assert.equal(parsed.世界.天气.天气状况, null);
  for (const field of ['饱食度', '水分值', '体力值']) assert.equal(parsed.玩家.当前状态[field], null);
  assert.deepEqual(parsed.地点, seed().地点);
});

test('已确认旧存档事实不被新空值默认清除，旧类别不被擅自归为消耗品', () => {
  const old = seed();
  for (const field of ['饱食度', '水分值', '体力值']) delete old.玩家.当前状态[field];
  old.世界.当前时间 = time(2026, 9, 19, 9);
  old.世界.开局时间 = time(2026, 9, 19, 9);
  old.世界.天气.天气状况 = '晴';
  old.世界.天气.适用区域 = '全市';
  old.玩家.资金.币种 = 'CNY';
  old.玩家.物品栏 = { gift: { 名称: '赠礼', 类别: '礼物', 数量: null }, phone: { 类别: '电子设备', 数量: 1 } };
  const original = structuredClone(old);
  const parsed = Schema.parse(old);
  assert.deepEqual(parsed.世界, old.世界);
  assert.deepEqual(parsed.地点, old.地点);
  assert(!Object.hasOwn(parsed.玩家.资金, '币种'));
  assert.equal(parsed.玩家.物品栏.gift.类别, '礼物');
  assert.equal(parsed.玩家.物品栏.gift.数量, null);
  assert.equal(parsed.玩家.物品栏.phone.类别, '电子设备');
  for (const field of ['饱食度', '水分值', '体力值']) assert.equal(parsed.玩家.当前状态[field], null);
  assert.deepEqual(old, original);
  assert.deepEqual(Schema.parse(parsed), parsed);
});

test('消耗品仅数量确为零时移除，堆叠剩余、未知与非消耗品保留', () => {
  const input = {
    玩家: {
      物品栏: {
        used: { 类别: '消耗品', 数量: '0' },
        stack: { 类别: '消耗品', 数量: 2 },
        partial: { 类别: '消耗品', 数量: 0.5, 单位: '升' },
        unknown: { 类别: '消耗品', 数量: null },
        unclassified: { 类别: null, 数量: 0 },
        legacy: { 类别: '日用品', 数量: 0 },
        ...Object.fromEntries(
          ['工具与设备', '穿戴用品', '资料与凭证', '其他非消耗品'].map(类别 => [类别, { 类别, 数量: 1 }]),
        ),
      },
    },
    事件: { use: { 事实: '已使用的历史记录' } },
  };
  const original = structuredClone(input);
  const s = Schema.parse(input);
  assert(!Object.hasOwn(s.玩家.物品栏, 'used'));
  assert.equal(s.玩家.物品栏.stack.数量, 2);
  assert.equal(s.玩家.物品栏.partial.数量, 0.5);
  assert.equal(s.玩家.物品栏.unknown.数量, null);
  assert.equal(s.玩家.物品栏.unclassified.数量, 0);
  assert.equal(s.玩家.物品栏.legacy.数量, 0);
  for (const 类别 of ['工具与设备', '穿戴用品', '资料与凭证', '其他非消耗品'])
    assert.equal(s.玩家.物品栏[类别].数量, 1);
  assert.equal(s.事件.use.事实, '已使用的历史记录');
  assert.deepEqual(Schema.parse(s), s);
  assert.deepEqual(input, original);
});

test('时间接受合法闰日、月末、跨年结果及可转换数字字符串', () => {
  for (const t of [time(2024, 2, 29, 23, 59), time(2000, 2, 29), time(2026, 12, 31, 23, 59), time(2027, 1, 1)]) {
    assert.deepEqual(Schema.parse({ 世界: { 当前时间: t } }).世界.当前时间, t);
  }
  assert.deepEqual(
    Schema.parse({ 世界: { 当前时间: { 年: '2026', 月: '9', 日: '19', 时: '9', 分: '0' } } }).世界.当前时间,
    time(2026, 9, 19, 9),
  );
});

test('无效公历时间、缺字段、空字符串和布尔值不会静默变成另一时刻', () => {
  const invalid = [
    time(2026, 2, 29),
    time(1900, 2, 29),
    time(2026, 4, 31),
    time(2026, 13, 1),
    time(2026, 9, 19, 24),
    time(2026, 9, 19, 0, 60),
    time(2026.1, 9, 19),
    time(2026, 9, 19, null),
    time(2026, 9, 19, ''),
    time(2026, 9, 19, false),
    { 年: 2026, 月: 9, 日: 19 },
  ];
  for (const t of invalid) assert.equal(Schema.safeParse({ 世界: { 当前时间: t } }).success, false, JSON.stringify(t));
});

test('精简后时间校验覆盖11个代表年份的所有月日边界', () => {
  for (const 年 of [1, 99, 100, 1900, 2000, 2024, 2026, 2027, 2100, 2400, 9999]) {
    for (let 月 = 0; 月 <= 13; 月++) {
      for (let 日 = 0; 日 <= 32; 日++) {
        const reference = new Date(0);
        reference.setUTCFullYear(年, 月 - 1, 日);
        const expected =
          reference.getUTCFullYear() === 年 && reference.getUTCMonth() === 月 - 1 && reference.getUTCDate() === 日;
        const result = Schema.safeParse({ 世界: { 当前时间: time(年, 月, 日, 23, 59) } });
        assert.equal(result.success, expected, `${年}-${月}-${日}`);
        if (result.success) assert.deepEqual(result.data.世界.当前时间, time(年, 月, 日, 23, 59));
      }
    }
  }
  assert.equal(Schema.safeParse({ 世界: { 当前时间: { ...time(2026, 9, 19), 星期: '六' } } }).success, false);
});

function expandJsonSchema(compact) {
  function expand(node) {
    if (Array.isArray(node)) return node.map(expand);
    if (node === null || typeof node !== 'object') return node;
    if (node.$ref) {
      const { $ref, ...siblings } = node;
      const target = $ref
        .slice(2)
        .split('/')
        .reduce((value, key) => value[key], compact);
      assert(target, `悬空引用：${$ref}`);
      return expand({ ...target, ...siblings });
    }
    return Object.fromEntries(
      Object.entries(node)
        .filter(([key]) => key !== '$defs')
        .map(([key, value]) => [key, expand(value)]),
    );
  }
  return expand(compact);
}

test('JSON Schema共享日期、来源及内容块，全部引用展开后与原生生成结果相同', () => {
  const compact = createInputJsonSchema();
  assert(compact.$defs.故事时间);
  assert(compact.$defs.信息来源);
  for (const type of ['文字', '图片', '语音', '表情', '视频', '位置', '名片', '分享'])
    assert(compact.$defs[`${type}内容`]);
  const expected = z.toJSONSchema(Schema, { io: 'input' });
  delete expected.properties.玩家.properties.身份.properties.当前职业;
  assert.deepEqual(expandJsonSchema(compact), expected);
});

test('共享定义保留每处默认值，约束不同不误合并，默认数据不作为Schema遍历', () => {
  const child = {
    type: 'object',
    properties: {
      信息: { type: 'string', minLength: 5 },
      序号: { type: 'number' },
      状态: { enum: ['已确认', '待核实'] },
    },
    required: ['信息', '序号'],
  };
  const schema = {
    type: 'object',
    properties: {
      a: { ...child, default: { 信息: '甲甲甲甲甲', 序号: 1 } },
      b: { ...child, default: { 信息: '乙乙乙乙乙', 序号: 2 } },
      c: { ...child, required: ['信息'] },
    },
    default: { type: 'object', properties: { a: child, b: child } },
  };
  const compact = compactJsonSchema(schema);
  assert(compact.properties.a.$ref);
  assert.equal(compact.properties.a.$ref, compact.properties.b.$ref);
  assert(!compact.properties.c.$ref);
  assert.deepEqual(compact.default, schema.default);
  assert.deepEqual(expandJsonSchema(compact), schema);
});

test('未知数值保持null，零是零，不把空白或布尔值转为零', () => {
  assert.equal(Schema.parse({ 玩家: { 资金: { 余额分: null } } }).玩家.资金.余额分, null);
  assert.equal(Schema.parse({ 玩家: { 资金: { 余额分: 0 } } }).玩家.资金.余额分, 0);
  for (const bad of ['', ' ', false, true, -1, 1.1])
    assert.equal(Schema.safeParse({ 玩家: { 资金: { 余额分: bad } } }).success, false);
});

test('女性主要角色保留全部指定字段及未知性经验', () => {
  const a = actor({ 层级: '主要', 性别: '女' });
  assert.deepEqual(Object.keys(a.性特征), ['奶子信息', '蜜穴信息', '其他', '性经验']);
  assert.equal(a.性特征.性经验.性次数.确数, null);
  assert.equal(a.性特征.性经验.性人群, null);
  assert.equal(a.外貌.三围信息.胸围, null);
  assert.equal(a._更新循环.当前计数, 0);
  assert.equal(a._更新循环.更新阈值, 5);
  assert.equal(a._更新循环.上次更新变量时间, null);
  assert.deepEqual(Object.keys(a.网络倾向.通用), [
    '网络身份',
    '常用平台',
    '发布偏好',
    '活跃习惯',
    '互动风格',
    '公开边界',
  ]);
});

test('男性、不适用、未知性别与次要角色不保存性特征', () => {
  for (const data of [
    { 层级: '主要', 性别: '男', 性特征适用: true, 性特征: {} },
    { 层级: '主要', 性别: '男性', 性特征: {} },
    { 层级: '主要', 性别: null, 性特征: {} },
    { 层级: '主要', 性别: '女', 性特征适用: false, 性特征: {} },
    { 层级: '次要', 性别: '女', 性特征: {} },
  ])
    assert.equal(Object.hasOwn(actor(data), '性特征'), false);
  assert(actor({ 层级: '主要', 性别: '其他', 性特征适用: true }).性特征);
  const male = actor({ 层级: '主要', 性别: '男' });
  assert.equal(Object.hasOwn(male.外貌, '三围信息'), false);
  assert.equal(Object.hasOwn(male.外貌, '罩杯'), false);
});

test('次数未知时保留已知新增说明，不推算历史总数', () => {
  const a = actor({
    层级: '主要',
    性别: '女',
    性特征: { 性经验: { 性次数: { 确数: null, 已知新增说明: '已知新增一次' }, 依据事件id: ['event1'] } },
  });
  assert.equal(a.性特征.性经验.性次数.确数, null);
  assert.equal(a.性特征.性经验.性次数.已知新增说明, '已知新增一次');
});

test('双方关系独立，数值按指定范围修正，未知不变，关系不自动晋级', () => {
  const s = Schema.parse({
    角色: {
      a: { 层级: '主要', 关系网: { b: { 姓名: '乙', 好感度: 200, 信任度: null, 关系: '同事' } } },
      b: { 层级: '次要', 关系网: { a: { 姓名: '甲', 好感度: -120, 信任度: -3, 关系: '同事' } } },
    },
  });
  assert.equal(s.角色.a.关系网.b.好感度, 100);
  assert.equal(s.角色.b.关系网.a.好感度, -100);
  assert.equal(s.角色.b.关系网.a.信任度, -3);
  assert.equal(s.角色.a.关系网.b.信任度, null);
  assert.equal(s.角色.a.关系网.b.关系, '同事');
  assert(!Object.hasOwn(s.角色.a, '好感度'));
});

test('同名人物不合并，缺失目标引用与当时称呼保留', () => {
  const s = Schema.parse({
    角色: {
      a: { 层级: '次要', 姓名: '同名', 关系网: { removed: { 姓名: '旧友', 关系: '朋友' } } },
      b: { 层级: '次要', 姓名: '同名' },
    },
  });
  assert.equal(Object.keys(s.角色).length, 2);
  assert.equal(s.角色.a.关系网.removed.姓名, '旧友');
  assert(!s.角色.removed);
});

test('后台生活与玩家已知位置分开，未确定邀约保持待确认', () => {
  const s = Schema.parse({
    角色: { a: { 层级: '主要', 当前地点id: 'private_room', 当前状态: '休息' } },
    玩家: { 已知信息: { 已认识人物: { a: { 上次已知地点id: 'library', 位置获知时间: time(2026, 9, 19, 8) } } } },
    约定: { dinner: { 状态: '待确认', 参与者: { a: { 响应: '待确认' } }, 时间: null } },
  });
  assert.equal(s.玩家.已知信息.已认识人物.a.上次已知地点id, 'library');
  assert.equal(s.约定.dinner.状态, '待确认');
  assert.equal(s.约定.dinner.时间, null);
});

test('次数、阈值和升格严格类型；解析不消费请求、不结算计数', () => {
  const a = actor({ 层级: '主要', _管理: { 升格: true }, _更新循环: { 当前计数: 7, 更新阈值: 5 } });
  assert.equal(a._更新循环.当前计数, 7);
  assert.equal(a._管理.升格, true);
  for (const bad of [0, -1, 1.5])
    assert.equal(Schema.safeParse({ 角色: { a: { 层级: '主要', _更新循环: { 更新阈值: bad } } } }).success, false);
  assert.equal(Schema.safeParse({ 角色: { a: { 层级: '次要', _管理: { 升格: 'false' } } } }).success, false);
});

test('经历、聊天超出近期目标不由Schema静默裁剪', () => {
  const records = Object.fromEntries(
    Array.from({ length: 35 }, (_, i) => [
      'm' + i,
      { 会话id: 'chat', 内容块: [{ id: 'b' + i, 类型: '文字', 正文: '原文' + i }] },
    ]),
  );
  const recent = Object.fromEntries(
    Array.from({ length: 11 }, (_, i) => ['e' + i, { 日期说明: '2026年09月19日', 日期精度: '日', 经历: '已发生' + i }]),
  );
  const s = Schema.parse({
    角色: { a: { 层级: '主要', 经历: { 最近经历: recent } } },
    手机: { 原文: { 消息: records } },
  });
  assert.equal(Object.keys(s.角色.a.经历.最近经历).length, 11);
  assert.equal(Object.keys(s.手机.原文.消息).length, 35);
  assert.equal(s.手机.原文.消息.m0.内容块[0].正文, '原文0');
});

test('原文与近期id窗口独立，旧评论与接收记录不因源帖缺席消失', () => {
  const s = Schema.parse({
    手机: {
      原文: { 评论: { c: { 帖子id: 'removed', 评论账号id: 'b', 内容块: [{ id: 'cb', 类型: '文字', 正文: '收到' }] } } },
      _接收侧记录: {
        delivery: {
          原内容id: 'removed',
          接收账号id: 'b',
          已交付内容: [{ id: 'pb', 类型: '文字', 正文: '当时可见片段' }],
        },
      },
    },
  });
  assert(!s.手机.原文.帖子.removed);
  assert.equal(s.手机.原文.评论.c.帖子id, 'removed');
  assert.equal(s.手机._接收侧记录.delivery.已交付内容[0].正文, '当时可见片段');
});

test('消息八种内容块保留作者顺序，评论拒绝图片等完整消息类型', () => {
  const blocks = [
    { id: '1', 类型: '文字', 正文: '说明' },
    { id: '2', 类型: '图片', 图片描述: '桌上的茶' },
    { id: '3', 类型: '语音', 转写文字: '你好' },
    { id: '4', 类型: '表情', 表情内容: '微笑' },
    { id: '5', 类型: '视频', 画面过程描述: '海浪涌来' },
    { id: '6', 类型: '位置', 地点id: 'coast_seawall' },
    { id: '7', 类型: '名片', 账号id: 'account' },
    { id: '8', 类型: '分享', 目标类型: '帖子', 目标id: 'post' },
  ];
  const s = Schema.parse({ 手机: { 原文: { 消息: { m: { 内容块: blocks } } } } });
  assert.deepEqual(
    s.手机.原文.消息.m.内容块.map(b => b.id),
    blocks.map(b => b.id),
  );
  assert.equal(s.手机.原文.消息.m.内容块[1].拍摄时间, null);
  assert.equal(Schema.safeParse({ 手机: { 原文: { 评论: { c: { 内容块: [blocks[1]] } } } } }).success, false);
});

test('群成员重入区间、受众历史、待回应和分支任务可完整保存', () => {
  const s = Schema.parse({
    手机: {
      群: {
        g: {
          成员: {
            a: {
              成员区间: {
                one: { 加入时间: time(2026, 9, 1), 离开时间: time(2026, 9, 3) },
                two: { 加入时间: time(2026, 9, 5) },
              },
            },
          },
        },
      },
      _待回应: { w: { 涉及消息id: ['old'], 问题摘要: '邀约尚未答复', 状态: '等待' } },
    },
    _系统: {
      存档id: 'save',
      分支id: 'branch',
      任务: { t: { 分支id: 'branch', 状态: '失败', 计数截止点: { a: 5 }, 候选结果JSON: '{"candidate":true}' } },
    },
  });
  assert.equal(Object.keys(s.手机.群.g.成员.a.成员区间).length, 2);
  assert.equal(s.手机._待回应.w.涉及消息id[0], 'old');
  assert.equal(s._系统.任务.t.状态, '失败');
  assert.equal(s._系统.任务.t.计数截止点.a, 5);
});

test('单一余额为整数分，物品归属例外保留，不自动创造资产或物品', () => {
  const s = Schema.parse({
    玩家: {
      物品栏: { umbrella: { 数量: 1, 所有者id: 'other', 持有人id: 'player', 存放地点id: null } },
      资金: { 账户: { cash: { 余额分: '12345' } }, 交易: { t: { 事件id: 'purchase', 金额分: 350, 状态: '待结' } } },
    },
  });
  assert.equal(s.玩家.资金.余额分, 12345);
  assert.equal(s.玩家.资金.交易.t.状态, '待结');
  assert.equal(s.玩家.物品栏.umbrella.所有者id, 'other');
  assert(!Object.hasOwn(s.玩家.资金, '账户'));
  assert.equal(Schema.safeParse({ 玩家: { 物品栏: { a: { 数量: -1 } } } }).success, false);
});

test('多次解析幂等且不会修改传入数据', () => {
  for (const input of [
    seed(),
    { 角色: { a: { 层级: '主要', 性别: '女', 关系网: { b: { 好感度: 300 } } } } },
    { 角色: { a: { 层级: '主要', 性别: '男', 性特征: {} } } },
  ]) {
    const original = structuredClone(input);
    const once = Schema.parse(input);
    assert.deepEqual(Schema.parse(once), once);
    assert.deepEqual(Schema.parse(Schema.parse(once)), once);
    assert.deepEqual(input, original);
  }
});

test('清空可重建对象仍是完整结构，不用optional丢失玩家分组', () => {
  const s = seed();
  delete s.玩家.背景;
  delete s.世界.当前场景;
  const parsed = Schema.parse(s);
  assert.equal(parsed.玩家.背景.成长背景, null);
  assert.deepEqual(parsed.世界.当前场景.在场人物, []);
  assert.deepEqual(Schema.parse(parsed), parsed);
});

test('变量列表使用卡内上下文宏，更新规则说明MVU操作，schema.json与当前输入结构一致', () => {
  assert.equal(read('世界书/变量/变量列表.txt').trim(), '{{valoran_context}}');
  const output = readYaml('世界书/变量/变量输出格式.yaml').变量输出格式;
  const operations = ['replace', 'insert', 'delta', 'remove', 'move'];
  const instructions = YAML.stringify(output.rule, { lineWidth: 0 });
  for (const operation of operations) assert(instructions.includes(operation), `缺少操作说明：${operation}`);
  assert.match(instructions, /move.*from.*to/);
  assert.match(instructions, /_.*readonly/);
  assert(!instructions.includes('LifeCheck'), '已删除的独立回执不重新加入变量格式');
  assert(!/80 words|IN ENGLISH|<Analysis>/.test(output.format));
  assert.deepEqual(JSON.parse(read('schema.json')), createInputJsonSchema());
  assert(read('脚本/变量结构/index.ts').includes("await waitGlobalInitialized('Mvu')"));
  assert(!read('schema.ts').includes('Date.now'));
});

test('更新规则路径和类型与Schema一致，字符串省略type、只读字段无规则', () => {
  const rules = readYaml('世界书/变量/变量更新规则.yaml');
  assert.deepEqual(Object.keys(rules), ['变量更新规则']);
  const leaves = ruleLeaves(rules.变量更新规则);
  const expected = YAML.parse(renderRuleTypes(read('世界书/变量/变量更新规则.yaml'))).变量更新规则;
  const expectedTypes = new Map(ruleLeaves(expected).map(({ parts, value }) => [parts.join('.'), value.type]));
  assert.equal(rules.变量更新规则.公共类型定义, expected.公共类型定义);
  assert(leaves.length >= 35);
  for (const { parts, value } of leaves) {
    assert(parts.every(p => !p.startsWith('_')));
    const type = ruleTypeOf(atPath(parts));
    if (['string', 'string | null', 'null | string'].includes(type)) assert(!Object.hasOwn(value, 'type'));
    else assert.equal(value.type, expectedTypes.get(parts.join('.')), parts.join('.'));
    assert(value.check.length > 0);
    assert(!/^\s*_\w*:/m.test(value.type ?? ''));
  }
  for (const name of ['角色', '地点', '约定', '事件', '组织'])
    assert(rules.变量更新规则[name].type.includes('[id: string]'));
});

test('每条精简规则连同公共定义可编译，与完整展开类型双向等价', () => {
  const rules = readYaml('世界书/变量/变量更新规则.yaml').变量更新规则;
  const leaves = ruleLeaves(rules);
  const source = leaves
    .map(({ parts, value }, i) => {
      if (!value.type) return '';
      const declarations = ruleTypeDeclarations(value.type, rules.公共类型定义);
      return `namespace Rule${i} {\n${declarations}\ntype 完整值 = ${typeOf(atPath(parts))};\ntype 一致 = [变量值] extends [完整值] ? ([完整值] extends [变量值] ? true : false) : false;\nconst 验证: true = null as unknown as 一致;\n}`;
    })
    .join('\n');
  const file = path.join(root, '测试', '规则类型验证.generated.ts');
  const options = {
    noEmit: true,
    strict: true,
    skipLibCheck: true,
    types: [],
    lib: ['lib.es2022.d.ts'],
    target: ts.ScriptTarget.ES2022,
  };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, ...args) =>
    path.resolve(name) === file
      ? ts.createSourceFile(file, source, options.target, true)
      : getSourceFile(name, ...args);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, host));
});

test('规则类型再生成无漂移，更新条件与字段清单不被覆盖', () => {
  const before = read('世界书/变量/变量更新规则.yaml');
  generateRuleTypes();
  assert.equal(read('世界书/变量/变量更新规则.yaml'), before);
});

test('主次分支完整且层级必填，次要保留外貌标识与统一性格，主要专属字段仍隔离', () => {
  const common = {
    姓名: '甲',
    年龄: '28',
    当前地点id: 'place',
    生活: { 住处id: 'home', 目标: { g: { 内容: '交稿' } } },
    关系网: { b: { 好感度: 120 } },
  };
  const major = actor({ ...common, 层级: '主要', 外貌: { 今日穿搭: '外套' } });
  const minor = actor({
    ...common, 层级: '次要',
    外貌: { 身高: '182', 体重: 78, 整体体型: '修长', 详细外表: '束起长发', 今日穿搭: '外套' },
    性格: '做事专注，愿意耐心示范，闲时挑选唱片。',
    专属标识: { 身体印记: ['左眉浅痕'], 随身信物: ['尺八'], 感官特征: '低沉声线', 破防弱点: '熟人认真听完新曲' },
    即时状态: { 心境基调: '专注' }, 网络倾向: {}, 经历: {}, 性特征适用: false,
    _更新循环: { 当前计数: 9 },
  });
  for (const key of Object.keys(common)) assert.deepEqual(major[key], minor[key], key);
  assert.equal(major.年龄, 28);
  assert.equal(major.关系网.b.好感度, 100);
  assert.equal(minor.外貌.身高, 182);
  assert.equal(minor.外貌.今日穿搭, '外套');
  assert.equal(minor.性格, '做事专注，愿意耐心示范，闲时挑选唱片。');
  assert.deepEqual(minor.专属标识, { 身体印记: ['左眉浅痕'], 随身信物: ['尺八'], 感官特征: '低沉声线', 破防弱点: '熟人认真听完新曲' });
  for (const key of ['即时状态', '网络倾向', '经历', '性特征适用', '性特征', '_更新循环'])
    assert(!Object.hasOwn(minor, key), key);
  assert.equal(actor({ 层级: '次要' }).性格, null);
  assert.equal(Schema.safeParse({ 角色: { a: { 层级: '次要', 性格: { 里性格: '原则' } } } }).success, false);
  assert.equal(typeof major.性格, 'object');
  for (const 层级 of [undefined, null, '其他'])
    assert.equal(Schema.safeParse({ 角色: { a: { ...common, 层级 } } }).success, false);
  assert.deepEqual(Schema.parse({ 角色: { a: major, b: minor } }).角色, { a: major, b: minor });
});

test('世界书所有条目文件存在且唯一，概率递归配置完整，设定与更新规则分离', () => {
  const config = readYaml('世界书/index.yaml');
  const rows = config.条目.flatMap(g => g.条目);
  assert.equal(rows.length, 18);
  assert.equal(new Set(rows.map(e => e.uid)).size, rows.length);
  assert.equal(new Set(rows.map(e => e.名称)).size, rows.length);
  assert.equal(rows.filter(e => e.激活策略.类型 === '绿灯').length, 1);
  assert(!rows.some(e => [13, 17].includes(e.uid) || e.文件.includes('地区概况/')));
  assert.deepEqual(new Set(rows.filter(e => !e.启用).map(e => e.名称)), new Set([
    '[initvar]变量初始化勿开', '[mvu_update]变量更新规则', '[mvu_update]变量输出格式',
  ]), '模型结算条目由变量请求单独读取，不作为常驻条目重复发送');
  const resident = rows.filter(e => e.文件.startsWith('常驻/'));
  assert.equal(resident.length, 13, '叙事设定统一由常驻目录维护，不复制到变量规则');
  for (const row of resident) {
    assert.equal(row.启用, true);
    assert.equal(row.激活策略.类型, '蓝灯', '说明必须能独立于变量更新条目进入正文请求');
  }
  for (const row of rows) {
    const content = read('世界书/' + row.文件);
    assert(content.trim());
    assert.equal(row.激活概率, 100);
    assert.equal(row.递归.不可被其他条目激活, true);
    assert.equal(row.递归.不可激活其他条目, true);
    if (row.激活策略.类型 === '绿灯') {
      assert(row.激活策略.关键字.length > 0);
      assert.equal(row.激活策略.扫描深度, row.uid >= 35 ? 4 : 2);
    }
    if (row.文件.startsWith('设定/') || row.文件.startsWith('常驻/'))
      assert(!content.includes('变量更新规则:') && !content.includes('<JSONPatch>'));
    if (row.文件.endsWith('.yaml')) assert.deepEqual(YAML.parseDocument(content).errors, []);
  }
  assert.equal(rows.find(e => e.名称.startsWith('[initvar]')).启用, false);
  assert.equal(rows.find(e => e.名称 === '[mvu_update]变量更新规则').插入位置.深度, 0);
});

test('现有tavern_sync原生打包及条目配置回读一致', async () => {
  assert.deepEqual(readYaml('index.本地监听.yaml').条目, readYaml('世界书/index.yaml').条目.map(group => ({
    ...group, 条目: group.条目.map(entry => ({ ...entry, 文件: '世界书/' + entry.文件 })),
  })), '监听卡配置须包括完整世界书条目');
  const before = fs.readFileSync(path.join(root, '瓦洛兰.worldbook.json'));
  const bundled = await bundleWorldbook({ write: false });
  assert.deepEqual(fs.readFileSync(path.join(root, '瓦洛兰.worldbook.json')), before, '回归只做内存打包，不覆盖维护派生文件');
  const rows = readYaml('世界书/index.yaml').条目.flatMap(g => g.条目);
  const entries = Object.values(bundled.entries);
  assert.equal(entries.length, rows.length);
  for (const [i, row] of rows.entries()) {
    const result = entries[i];
    assert.equal(result.comment, row.名称);
    assert.equal(result.uid, row.uid);
    assert.equal(result.disable, !row.启用);
    assert.equal(result.order, row.插入位置.顺序);
    assert.equal(result.constant, row.激活策略.类型 === '蓝灯');
    assert.equal(result.position, row.插入位置.类型 === '指定深度' ? 4 : 0);
    if (row.插入位置.类型 === '指定深度') assert.equal(result.depth, row.插入位置.深度);
    if (row.激活策略.类型 === '绿灯') assert.deepEqual(result.key, row.激活策略.关键字);
    assert.equal(result.content.trim(), read('世界书/' + row.文件).trim());
  }
});
