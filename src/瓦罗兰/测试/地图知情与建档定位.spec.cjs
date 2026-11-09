const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');
const YAML = require('yaml');
const root = path.resolve(__dirname, '..');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (name, parent, ...args) {
  if (name.startsWith('.') && parent && fs.existsSync(path.resolve(path.dirname(parent.filename), name + '.ts')))
    name += '.ts';
  return originalResolve.call(this, name, parent, ...args);
};
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);
global.z = require('zod').z;
global._ = require('lodash');
const { Schema } = require('../schema.ts');
const { visibleLocations } = require('../运行/map.ts');
const { normalizeMapLandmarks } = require('../运行/地图地标.ts');
const { createProfile } = require('../运行/creation.ts');
const { planOpeningCharacters, openingCharacterPrompt, validateOpeningResult } = require('../运行/opening.ts');
const { pendingPlayerMapLocations, playerMapLocationPrompt } = require('../运行/player-map-location.ts');
const geography = require('../运行/world-geography.json');
const seed = () => Schema.parse(YAML.parse(fs.readFileSync(path.join(root, '世界书/变量/initvar.yaml'), 'utf8')));
const added = ['cutie_cafe', 'lotus_hot_spring', 'true_ice_seal', 'ocean_song_island', 'celestial_realm', 'black_mist_boundary', 'bandle_passage'];

test('地点显示只随玩家知情增减，公开条件与收藏不绕过知情', () => {
  const state = seed();
  state.玩家.已知信息.已知地点 = {};
  state.手机._地图收藏 = ['riverside_riverwalk'];
  assert.deepEqual(visibleLocations(state), {});
  state.玩家.已知信息.已知地点.cutie_cafe = {};
  state.玩家.已知信息.已知地点.riverside_riverwalk = {};
  assert.deepEqual(Object.keys(visibleLocations(state)).sort(), ['cutie_cafe', 'riverside_riverwalk']);
  delete state.玩家.已知信息.已知地点.cutie_cafe;
  assert(!visibleLocations(state).cutie_cafe);
  state.玩家.已知信息.已知地点.missing = {};
  assert(!visibleLocations(state).missing);
});

test('七个补充地标都有合法世界坐标且仅在知情后出现', () => {
  const state = seed();
  state.玩家.已知信息.已知地点 = {};
  for (const id of added) {
    const place = state.地点[id];
    const bounds = geography.districts.find(row => row.id === place.片区id).map.bounds;
    const position = place.地图位置;
    assert.equal(position.精度, '地点', id);
    assert(Number.isFinite(position.x) && Number.isFinite(position.y), id);
    assert(position.x >= bounds.x && position.x <= bounds.x + bounds.w, id);
    assert(position.y >= bounds.y && position.y <= bounds.y + bounds.h, id);
    assert.deepEqual(geography.positions[id], [position.x, position.y]);
    assert(!visibleLocations(state)[id]);
    state.玩家.已知信息.已知地点[id] = {};
    assert(visibleLocations(state)[id]);
  }
});

test('旧七点补齐为空坐标的原预置记录，不移动已有坐标或改变知情', () => {
  const state = seed();
  for (const id of added) state.地点[id].地图位置 = { x: null, y: null, 精度: '未知' };
  state.地点.ocean_song_island.地图位置 = { x: 610, y: 535, 精度: '地点' };
  state.地点.bandle_passage.片区id = 'oldtown';
  state.地点.true_ice_seal.地图位置 = { x: 530, y: null, 精度: '片区' };
  state.地点.custom = { ...structuredClone(state.地点.cutie_cafe), 名称: '自设地点' };
  const before = structuredClone(state);
  const result = normalizeMapLandmarks(state);
  for (const id of ['cutie_cafe', 'lotus_hot_spring', 'celestial_realm', 'black_mist_boundary'])
    assert.deepEqual(result.地点[id].地图位置, seed().地点[id].地图位置);
  for (const id of ['ocean_song_island', 'bandle_passage', 'true_ice_seal', 'custom'])
    assert.deepEqual(result.地点[id], before.地点[id]);
  for (const [id, place] of Object.entries(before.地点))
    if (!added.includes(id)) assert.deepEqual(result.地点[id], place);
  assert.deepEqual(result.玩家.已知信息, before.玩家.已知信息);
  assert.deepEqual(state, before);
  assert.equal(normalizeMapLandmarks(result), result);
});

function opening() {
  const state = createProfile(seed(), {
    player: { 姓名: '地图测试', 片区id: 'coast', 住处描述: '靠海别墅，位于港湾住宅街区的东侧' },
    characters: [],
    details: { 玩家: {
      当前状态: { 当前地点id: 'coast_seawall' },
      生活: { 工作地点id: ['riverside_riverwalk'], 常去地点id: ['oldtown_vegetable_market'] },
    } },
  });
  const planned = planOpeningCharacters(state, [], true);
  const taskId = Object.keys(planned._系统.任务).find(id => planned._系统.任务[id].类别 === '建档');
  return { state: planned, taskId, homeId: state.玩家.生活.住处id };
}

test('建档只将玩家填写的起点和日常地址登记已知，自设坐标交给开局AI', () => {
  const { state, homeId } = opening();
  const expected = [homeId, 'coast_seawall', 'riverside_riverwalk', 'oldtown_vegetable_market'].sort();
  assert.deepEqual(Object.keys(state.玩家.已知信息.已知地点).sort(), expected);
  for (const id of expected) assert.equal(state.玩家.已知信息.已知地点[id].方式, '玩家填写');
  assert.equal(state.地点[homeId].地图位置.精度, '未知');
  assert(!visibleLocations(state).true_ice_seal);
});

test('开局定位资料只带待定位地点所属地区及可用参照，不发送其他地区整表', () => {
  const { state, taskId, homeId } = opening();
  const prompt = openingCharacterPrompt(state, taskId);
  assert(prompt.includes('【开局自设地点定位】'));
  assert(prompt.includes(homeId));
  assert(prompt.includes('x=世界范围.x+u/1000*世界范围.w'));
  const locationPart = prompt.split('【开局自设地点定位】')[1].split('按现有世界书规定')[0];
  assert(locationPart.includes('港湾住宅街区'));
  assert(!locationPart.includes('臻冰封印'));
  assert(!locationPart.includes('生态穹顶接驳区'));
  assert(!locationPart.includes('夏日海岸带'));
});

test('旧已建档自设住处可在普通结算补定位，完成后不再注入；不遍历补全角色私宅', () => {
  const { state, homeId } = opening();
  state._系统.任务 = {};
  state._系统.资料加载.地点覆盖[homeId] = '仅名称';
  state.地点.npc_home = { ...structuredClone(state.地点[homeId]), 名称: 'NPC_PRIVATE_TEST_ADDRESS' };
  state.地点.unknown_home = { ...structuredClone(state.地点[homeId]), 名称: '陌生地址' };
  state.玩家.生活.常去地点id.push('unknown_home');
  const before = structuredClone(state);
  assert.deepEqual(pendingPlayerMapLocations(state).map(row => row.id), [homeId]);
  const prompt = playerMapLocationPrompt(state);
  assert(prompt.includes('旧存档尚未定位的开局地址'));
  assert(prompt.includes(homeId));
  assert(!prompt.includes('NPC_PRIVATE_TEST_ADDRESS'));
  assert(!prompt.includes('陌生地址'));
  assert.deepEqual(state, before);
  const bounds = geography.districts.find(row => row.id === 'coast').map.bounds;
  state.地点[homeId].地图位置 = { x: bounds.x + 25, y: bounds.y + 35, 精度: '地点' };
  assert.equal(playerMapLocationPrompt(state), '');
  assert.equal(state._系统.资料加载.地点覆盖[homeId], '仅名称');
});

test('开局AI可填自设地址坐标，缺失、越界、改旧地点和未知情结果均被拒绝', () => {
  const { state, taskId, homeId } = opening();
  const after = structuredClone(state);
  const bounds = geography.districts.find(row => row.id === 'coast').map.bounds;
  after.地点[homeId].地图位置 = { x: bounds.x + bounds.w * 0.3, y: bounds.y + bounds.h * 0.3, 精度: '地点' };
  assert.equal(validateOpeningResult(state, after, taskId), after);
  assert.equal(after.玩家.当前状态.当前地点id, state.玩家.当前状态.当前地点id);
  const missing = structuredClone(state);
  missing.玩家.外貌.整体外貌描述 = '衣着整洁';
  assert.throws(() => validateOpeningResult(state, missing, taskId), /地图坐标/);
  const outside = structuredClone(after);
  outside.地点[homeId].地图位置.x = bounds.x + bounds.w + 1;
  assert.throws(() => validateOpeningResult(state, outside, taskId, true), /地图坐标/);
  const moved = structuredClone(after);
  moved.地点.riverside_riverwalk.地图位置.x += 1;
  assert.throws(() => validateOpeningResult(state, moved, taskId), /不能改写已有地点/);
  const renamed = structuredClone(after);
  renamed.地点[homeId].名称 = '模型擅自替换的住处';
  assert.throws(() => validateOpeningResult(state, renamed, taskId), /不能改写已有地点/);
  const unknown = structuredClone(after);
  delete unknown.玩家.已知信息.已知地点[homeId];
  assert.throws(() => validateOpeningResult(state, unknown, taskId), /知情记录/);
});
