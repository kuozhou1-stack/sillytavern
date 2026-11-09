import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import { Schema, root, read, readYaml } from '../工具/生成派生产物.mjs';
import { collectWorldInformation } from '../工具/生成世界资料.mjs';

const data = collectWorldInformation();
const migrationFixture = '测试/夹具/资料迁移前.yaml';
const source = path.join(root, '运行/世界资料.ts');
const module = { exports: {} };
new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(source, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText)(createRequire(source), module, module.exports);
const { normalizeWorldInformation } = module.exports;

test('47个既有点位与原快照一致；新增七点有坐标且不授予知情', () => {
  const old = readYaml(migrationFixture);
  const seed = readYaml('世界书/变量/initvar.yaml');
  let precise = 0, added = 0;
  for (const [id, place] of Object.entries(old.地点)) {
    assert.equal(seed.地点[id].片区id, place.片区id);
    assert.equal(seed.地点[id].上级地点id, place.上级地点id);
    if (place.地图位置.精度 === '地点') {
      precise++;
      assert.deepEqual(seed.地点[id].地图位置, place.地图位置, id);
    } else {
      added++;
      assert.equal(seed.地点[id].地图位置.精度, '地点', id);
    }
  }
  assert.equal(precise, 47); assert.equal(added, 7);
  assert.deepEqual(seed.玩家.已知信息, old.玩家.已知信息);
});

test('组织和场所服务全文无损迁入变量；触发世界书不再加载详情或整份地点表', () => {
  const sources = readYaml('世界资料来源.yaml');
  const body = file => read('世界书/' + file).trim().replace(/^<[^>]+>\s*\n/, '').replace(/\n\s*<\/[^>]+>$/, '').trim();
  const entries = readYaml('世界书/index.yaml').条目.flatMap(group => group.条目);
  for (const [id, row] of Object.entries(sources.组织)) {
    assert.equal(data.组织[id].规则, body(row.文件));
    assert(!entries.some(entry => entry.文件 === row.文件));
    assert.deepEqual(data.组织[id].已知成员, {});
  }
  for (const [id, file] of Object.entries(sources.场所细则)) {
    assert(data.地点[id].简介.endsWith(body(file)));
    assert(!entries.some(entry => entry.文件 === file));
  }
  for (const file of sources.地区) assert(!entries.some(entry => entry.文件 === file));
  assert(!entries.some(entry => entry.文件.includes('地区概况/')));
});

test('旧存档一次性补资料，保留自定义状态、角色和知情；反复读取不重写剧情修改', () => {
  const state = Schema.parse(readYaml(migrationFixture));
  state.地点.cutie_cafe.动态状态.closed = { 说明: '今天停业', 生效时间: null, 结束时间: null };
  state.组织.star_guardians = Schema.parse({组织:{star_guardians:{名称:'星之守护者',已知成员:{friend:{职务:'队员'}},规则:'已有故事记录'}}}).组织.star_guardians;
  const before = structuredClone(state);
  const migrated = normalizeWorldInformation(state);
  assert.deepEqual(state, before);
  assert.deepEqual(migrated.地点.cutie_cafe.动态状态, before.地点.cutie_cafe.动态状态);
  assert.deepEqual(migrated.组织.star_guardians.已知成员, before.组织.star_guardians.已知成员);
  assert(migrated.组织.star_guardians.规则.startsWith('已有故事记录'));
  assert.deepEqual(migrated.玩家, before.玩家);
  assert.deepEqual(migrated.角色, before.角色);
  assert.deepEqual(Schema.parse(migrated), migrated);
  assert.equal(normalizeWorldInformation(migrated), migrated);
  migrated.地点.cutie_cafe.简介 = '后续故事调整';
  delete migrated.组织.kda;
  assert.equal(normalizeWorldInformation(migrated), migrated);
});

test('已迁移存档仅替换六处旧作者文案，自定文案、地图位置与剧情不变', () => {
  const old = Schema.parse(readYaml('测试/夹具/世界书清理前.yaml'));
  old._系统.资料加载.资料版本 = data.版本;
  old.地点.cutie_cafe.地图位置 = { x: 111, y: 222, 精度: '地点' };
  old.地点.cutie_cafe.动态状态.closed = { 说明: '今天停业', 生效时间: null, 结束时间: null };
  old.玩家.已知信息.已知地点.cutie_cafe = { 名称: '咖啡甜心' };
  const before = structuredClone(old);
  const updated = normalizeWorldInformation(old);
  assert.deepEqual(old, before);
  const replacements = readYaml('运行/world-description-upgrades.json');
  assert.equal(replacements.length, 6);
  const expected = structuredClone(before);
  for (const row of replacements) {
    const rows = row.kind === '地点' ? expected.地点 : expected.世界.片区;
    rows[row.id][row.field] = row.after;
  }
  assert.deepEqual(updated, expected);
  assert.equal(normalizeWorldInformation(updated), updated);
  const custom = structuredClone(before);
  for (const row of replacements) {
    const rows = row.kind === '地点' ? custom.地点 : custom.世界.片区;
    rows[row.id][row.field] = row.before + '\n玩家确认的自定内容';
  }
  assert.equal(normalizeWorldInformation(custom), custom);
  const renamed = structuredClone(before);
  for (const row of replacements) {
    const rows = row.kind === '地点' ? renamed.地点 : renamed.世界.片区;
    rows[row.id].名称 = '自定名称';
  }
  assert.equal(normalizeWorldInformation(renamed), renamed);
  const unversionedCustom = structuredClone(custom);
  unversionedCustom._系统.资料加载.资料版本 = null;
  const kept = normalizeWorldInformation(unversionedCustom);
  for (const id of ['cutie_cafe', 'lotus_hot_spring'])
    assert.equal(kept.地点[id].简介, unversionedCustom.地点[id].简介, '未标记资料版本的自定细则不重复追加');
  assert.equal(normalizeWorldInformation(kept), kept);
});
