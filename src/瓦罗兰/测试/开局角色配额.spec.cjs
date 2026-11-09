const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const assert = require('node:assert/strict'), util = require('node:util');
const { test, after } = require('node:test');
// 复用既有隔离 IO，真实 Runtime 与维护函数正常加载；不注册另一套测试。
const spec = path.join(__dirname, '双API流程.spec.cjs'), fixture = new Module(spec, module);
fixture.filename = spec; fixture.paths = Module._nodeModulePaths(__dirname);
const normalRequire = fixture.require.bind(fixture);
fixture.require = name => name === 'node:test' ? { test() {} } : normalRequire(name);
fixture._compile(fs.readFileSync(spec, 'utf8') +
  '\nmodule.exports={Schema,copy,withEnv,environment,createRuntime,createProfile,block,patch,endpoint,sentPrompts};', spec);
const { Schema, copy, withEnv, createRuntime, createProfile, block, patch, endpoint, sentPrompts } = fixture.exports;
const { prepareOpeningCharacterRoster } = require('../运行/character-roster.ts');
const { LibrarySchema, libraryRevision, libraryView, prepareLibraryCommand } = require('../运行/character-library.ts');
const { initialConnectionIds } = require('../运行/creation.ts');
const { catalogCharacters } = require('../界面/桌面端/utils/character-catalog.ts');
const options = { majorLimit: 3, minorLimit: 0, majorRotation: 1, minorRotation: 0 };
const settings = { characterAuto: true, characterRoster: options, variable: endpoint('variable'), phone: endpoint('phone') };
const output = process.env.VALORAN_OPENING_AUDIT_DIR, traces = [];
let scenario = '', issue = '', lastReply;
function log(error, label) {
  if (!output) return;
  try {
    fs.appendFileSync(path.join(output, '日志', issue + '-错误.log'),
      `\n[${new Date().toISOString()}] ${scenario} / ${label}\n${util.inspect(error, { depth: null, colors: false })}\n` +
      (lastReply ? `相关固定回包：${lastReply}\n` : ''));
  } catch (saving) { throw new AggregateError([error, saving], '错误日志保存失败，保留原异常'); }
}
function check(group, title, fn) {
  test(title, async () => {
    issue = group; scenario = title; lastReply = undefined;
    try { await fn(); } catch (error) { log(error, '回归失败'); throw error; }
  });
}
async function expectedFailure(fn, pattern) {
  await assert.rejects(fn, error => {
    log(error, '预期故障；隔离 IO');
    console.error('[预期故障；隔离 IO]', error);
    assert.match(String(error), pattern); return true;
  });
}
function people(major = 6, minor = 0, nearby = 0) {
  return ['主要', '次要'].flatMap((层级, tier) => Array.from({ length: tier ? minor : major }, (_, i) => ({
    id: (tier ? 'minor_' : 'major_') + i, 姓名: (tier ? '次要样本' : '主要样本') + i, 层级,
    简介: `OPENING_PRIVATE_${tier}_${i}_END`, __imported: true,
    当前地点id: i < nearby ? 'intro' : 'remote',
  })));
}
function payload(characters = people(), known = 0, location = null, present = []) {
  const ids = characters.slice(0, known).map(p => p.id);
  return { submissionId: 'opening-quota-profile', player: { 姓名: '配额核查玩家' }, characters: copy(characters), details: {
    地点: {
      intro: { 名称: '合成起点', 片区id: 'residential', 地图位置: { x: 480, y: 380, 精度: '地点' } },
      remote: { 名称: '合成远处', 片区id: 'riverside', 地图位置: { x: 510, y: 235, 精度: '地点' } },
    }, 玩家: { 当前状态: { 当前地点id: location } }, 世界: { 当前场景: { 在场人物: present } },
    邻信账号名: 'offline-player', 初始关系: Object.fromEntries(ids.map(id => [id, {
      relation: '朋友', basis: '合成相识依据-' + id, relationEdited: true, basisEdited: true, contact: true,
    }])),
  } };
}
const revision = e => libraryRevision(e.state(), LibrarySchema.parse(e.vars.澄湾角色库));
function record(e, phase) {
  const state = e.state(), lib = LibrarySchema.parse(e.vars.澄湾角色库), rev = libraryRevision(state, lib);
  traces.push({ scenario, phase, options: copy(e.runtime.settings.characterRoster), active: Object.keys(state.角色),
    tiers: Object.fromEntries(['主要', '次要'].map(t => [t, Object.values(state.角色).filter(p => p.层级 === t).length])),
    present: copy(state.世界.当前场景.在场人物), pool: Object.keys(rev.meta).length,
    automatic: copy(rev.automatic), tasks: copy(state._系统.任务), libraryVersion: state._系统.角色库版本,
    snapshots: Object.keys(lib.snapshots).length, rounds: Object.keys(state._系统.已计轮事件),
    calls: e.calls.map(c => c.config.custom_api?.model ?? 'main'),
    players: e.messages.filter(m => m.role === 'user').length, journal: copy(e.vars.澄湾待确认提交),
    evidence: '当前真实 Runtime，内存 IO 和独立磁盘镜像；未调用真实模型' });
}
function allPeople(e) { return libraryView(e.state(), e.vars.澄湾角色库).characters; }
function assertRelations(e, p) {
  const all = allPeople(e), playerId = e.state().玩家.id;
  assert.equal(Object.keys(all).length, p.characters.length);
  for (const id of initialConnectionIds(p)) {
    assert.equal(all[id].关系网[playerId].关系, '朋友');
    assert.equal(all[id].关系网[playerId].关系备注, '合成相识依据-' + id);
    assert.equal(Object.values(e.state().手机.账号).filter(a => a.人物id === id).length, 1);
  }
}
function replies(e) {
  e.story = async config => {
    const text = JSON.stringify(sentPrompts(config)), all = allPeople(e);
    for (const id of Object.keys(revision(e).disabled))
      if (all[id].简介?.startsWith('OPENING_PRIVATE_')) assert(!text.includes(all[id].简介));
    assert(!text.includes('"queues"')); assert(!text.includes('"snapshots"'));
    record(e, '正文请求前'); return '玩家独自观察周围环境。';
  };
  e.update = async () => { lastReply = block([patch('/玩家/外貌/体型', '合成资料补全')]); return lastReply; };
}
async function reload(e) {
  await e.runtime.dispose();
  e.vars = copy(e.diskChat[0].chat_metadata.variables);
  e.messages = e.diskChat.slice(1).map(m => ({ role: m.is_user ? 'user' : 'assistant', message: m.mes,
    data: copy(m.variables?.[m.swipe_id ?? 0] ?? {}), extra: copy(m.extra ?? {}),
    swipe_id: m.swipe_id, swipes: m.swipes, swipe_info: m.swipe_info,
    swipes_data: m.swipes ? m.variables : undefined }));
  e.runtime = createRuntime(); await e.runtime.start();
}
async function runOpening(p, expected) {
  await withEnv(async e => {
    await e.runtime.createProfile(p); record(e, '保存建档后');
    assert.equal(Object.keys(e.state().角色).length, expected);
    assert.equal(e.calls.length, 0); assertRelations(e, p);
    const identities = Object.keys(allPeople(e)).sort();
    const library = copy(e.vars.澄湾角色库), selected = Object.keys(e.state().角色);
    const phoneIds = { accounts: Object.keys(e.state().手机.账号), contacts: Object.keys(e.state().手机.联系人), chats: Object.keys(e.state().手机.会话) };
    replies(e); await e.runtime.startOpening(); record(e, '开场成功后');
    assert.deepEqual(Object.keys(e.state().角色), selected); assert.deepEqual(e.vars.澄湾角色库, library);
    assert.deepEqual(e.state().世界.当前场景.在场人物, p.details.世界.当前场景.在场人物);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1); assertRelations(e, p);
    await reload(e); record(e, '磁盘镜像重载后'); assertRelations(e, p);
    e.update = async () => block([]); await e.runtime.send('继续观察环境'); record(e, '下一次普通发送成功后');
    assertRelations(e, p);
    assert.deepEqual(Object.keys(allPeople(e)).sort(), identities);
    assert.deepEqual({ accounts: Object.keys(e.state().手机.账号), contacts: Object.keys(e.state().手机.联系人), chats: Object.keys(e.state().手机.会话) }, phoneIds);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 2);
    assert.equal(e.messages.filter(m => m.role === 'user').length, 2);
    assert.equal(e.calls.length, 4);
  }, Schema.parse({}), settings);
}
for (const [title, known, location, nearby, count, expected] of [
  ['相识6人，起点未知', 6, null, 0, 6, 3],
  ['零相识，起点未知', 0, null, 0, 6, 3],
  ['零相识，有起点但无人地理匹配', 0, 'intro', 0, 6, 3],
  ['零相识，仅1人地理匹配', 0, 'intro', 1, 6, 3],
  ['零相识，6人地理匹配', 0, 'intro', 6, 6, 3],
  ['候选只有2人', 0, null, 0, 2, 2],
  ['空候选库', 0, null, 0, 0, 0],
]) check(known ? '01-相识超限' : '02-空位补选', title, () => runOpening(payload(people(count, 0, nearby), known, location), expected));

for (const known of [0, 6]) check(known ? '01-相识超限' : '02-空位补选', `实际171人名录，相识${known}人`, async () => {
  const folder = path.resolve(__dirname, '../../../dist/瓦罗兰/角色资源');
  const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'index.json')));
  const catalog = { ...manifest, url: 'https://catalog.invalid/index.json', dataUrl: 'https://catalog.invalid/' + manifest.data };
  const chars = await catalogCharacters(catalog, manifest.entries.map(p => p.id), [], async url => {
    assert.equal(String(url), catalog.dataUrl); return new Response(fs.readFileSync(path.join(folder, manifest.data)));
  });
  await runOpening(payload(chars, known), 3);
});

function prepare(p, config = options, library = {}) {
  const state = createProfile(Schema.parse({}), p);
  return prepareOpeningCharacterRoster(state, library, config, initialConnectionIds(p));
}
check('01-相识超限', '主要次要独立配额；零轮换仍准备初始资料', () => {
  const p = payload(people(6, 4), 10);
  const result = prepare(p, { majorLimit: 3, minorLimit: 1, majorRotation: 0, minorRotation: 0 });
  assert.deepEqual(Object.values(result.state.角色).map(p => p.层级), ['主要', '主要', '主要', '次要']);
  const all = libraryView(result.state, result.library).characters;
  assert.equal(Object.keys(all).length, 10);
  for (const person of Object.values(all)) assert.equal(person.关系网[result.state.玩家.id].关系, '朋友');
});
check('01-相识超限', '零配额不因相识开启人物；真实在场可以超额保留', () => {
  const zero = { majorLimit: 0, minorLimit: 0, majorRotation: 0, minorRotation: 0 };
  assert.deepEqual(Object.keys(prepare(payload(people(), 6), zero).state.角色), []);
  const present = ['major_0', 'major_1', 'major_2', 'major_3'];
  const result = prepare(payload(people(), 6, null, present));
  assert.deepEqual(Object.keys(result.state.角色), present);
  assert.deepEqual(result.state.世界.当前场景.在场人物, present);
  assert.deepEqual(Object.keys(prepare(payload(people(), 6, null, present), zero).state.角色), present);
});
check('02-空位补选', '相识优先后选地理匹配；同分沿现有队列补足', () => {
  const p = payload(people(6, 0, 1), 0, 'intro');
  p.details.初始关系.major_5 = { relation: '朋友', basis: '明确联系', relationEdited: true, basisEdited: true };
  const state = createProfile(Schema.parse({}), p), lib = LibrarySchema.parse({});
  const rev = libraryRevision(state, lib); rev.automatic = { queues: { 主要: ['major_4', 'major_3', 'major_2', 'major_1', 'major_0', 'major_5'], 次要: [] } };
  lib.revisions.ordered = rev; state._系统.角色库版本 = 'ordered';
  const result = prepareOpeningCharacterRoster(state, lib, options, initialConnectionIds(p));
  assert.deepEqual(new Set(Object.keys(result.state.角色)), new Set(['major_5', 'major_0', 'major_4']));
  assert.deepEqual(result.revision.automatic.queues.主要, ['major_3', 'major_2', 'major_1', 'major_4', 'major_0', 'major_5']);
});
check('01-相识超限', '手动关闭优先于相识和开局补选，不被自动唤醒', () => {
  const p = payload(people(), 6), state = createProfile(Schema.parse({}), p);
  const disabled = prepareLibraryCommand(state, {}, { kind: 'enabled', ids: ['major_0'], enabled: false });
  const result = prepareOpeningCharacterRoster(disabled.state, disabled.library, options, initialConnectionIds(p));
  assert.equal(Object.keys(result.state.角色).length, 3); assert(!result.state.角色.major_0);
  assert(result.revision.automatic.manualOff.includes('major_0'));
  assert.equal(libraryView(result.state, result.library).characters.major_0.关系网[state.玩家.id].关系, '朋友');
});
check('01-相识超限', '旧版尚无开局名单时按配额选择；已保存名单不在重试时重选', () => {
  const p = payload(people(), 6), state = createProfile(Schema.parse({}), p);
  const result = prepareOpeningCharacterRoster(state, {}, options);
  assert.equal(Object.keys(result.state.角色).length, 3);
  assert.equal(prepareOpeningCharacterRoster(result.state, result.library, { ...options, majorLimit: 1 }), null);
});

for (const stage of ['正文', '变量']) check('03-失败恢复', `${stage}失败后磁盘重载重试，名单快照和原提交不重建`, async () => {
  const p = payload(people(), 6);
  await withEnv(async e => {
    await e.runtime.createProfile(p); replies(e);
    const library = copy(e.vars.澄湾角色库), selected = Object.keys(e.state().角色);
    const task = Object.entries(e.state()._系统.任务).find(([,t]) => t.类别 === '建档' && t.状态 === '排队');
    const oldReply = stage === '正文' ? e.story : e.update;
    const fail = async () => { throw Error('预期' + stage + '请求失败'); };
    if (stage === '正文') e.story = fail; else e.update = fail;
    await expectedFailure(() => e.runtime.startOpening(), /预期.*请求失败/); record(e, stage + '失败后');
    const narrative = e.messages.findLast(m => m.extra?.cw_update_pending)?.message;
    if (stage === '正文') e.story = oldReply; else e.update = oldReply;
    await reload(e); record(e, '失败磁盘重载后'); await e.runtime.retry(); record(e, '重试成功后');
    assert.deepEqual(Object.keys(e.state().角色), selected); assert.deepEqual(e.vars.澄湾角色库, library);
    assert.equal(e.state()._系统.任务[task[0]].提交id, task[1].提交id);
    assert.equal(e.state()._系统.任务[task[0]].状态, '已提交');
    assert.equal(e.messages.filter(m => m.role === 'user').length, 1);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
    if (stage === '变量') assert(e.messages.some(m => m.message === narrative));
    assert.equal(e.calls.filter(c => c.kind === 'story').length, stage === '正文' ? 2 : 1);
    assertRelations(e, p);
  }, Schema.parse({}), settings);
});

for (const stage of ['快照', '候选']) check('03-失败恢复', `建档${stage}保存失败，恢复后沿原提交且保留全部关系`, async () => {
  const p = payload(people(), 6);
  await withEnv(async e => {
    const original = copy(e.state()); let fault = true, hit = false;
    SillyTavern.saveChat = async () => {
      const built = !!e.messages[0].data.stat_data._系统.建档完成;
      if (fault && e.vars.澄湾角色库 && (stage === '候选' ? built : !built)) {
        hit = true; throw Error('预期建档' + stage + '保存失败');
      }
      e.saveDisk();
    };
    await expectedFailure(() => e.runtime.createProfile(p), /预期建档.*保存失败/);
    assert(hit); assert.deepEqual(e.state(), original); assert.equal(e.calls.length, 0);
    const journal = structuredClone(e.vars.澄湾待确认提交), library = structuredClone(e.vars.澄湾角色库);
    fault = false; await reload(e);
    if (journal) await e.runtime.retry();
    await e.runtime.createProfile(p); record(e, '建档保存恢复后');
    assert(e.state()._系统.提交记录[p.submissionId]); assertRelations(e, p);
    assert.equal(Object.keys(e.state().角色).length, 3);
    if (stage === '候选') assert.deepEqual(e.vars.澄湾角色库, library);
    replies(e); await e.runtime.startOpening(); record(e, '恢复后开场完成');
    assert.equal(e.calls.length, 2); assert.equal(e.messages.filter(m => m.role === 'user').length, 1);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
  }, Schema.parse({}), settings);
});
after(() => {
  if (output) fs.writeFileSync(path.join(output, `修后轨迹-${process.env.VALORAN_OPENING_RUN}.json`), JSON.stringify(traces, null, 2));
});
