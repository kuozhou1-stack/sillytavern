const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const util = require('node:util');
const { test, after } = require('node:test');
// Reuse the existing in-memory Runtime fixture without registering its test suite.
const spec = path.join(__dirname, '双API流程.spec.cjs');
const fixture = new Module(spec, module);
fixture.filename = spec;
fixture.paths = Module._nodeModulePaths(__dirname);
const normalRequire = fixture.require.bind(fixture);
fixture.require = name => name === 'node:test' ? { test() {} } : normalRequire(name);
fixture._compile(fs.readFileSync(spec, 'utf8') + '\nmodule.exports={Schema,copy,withEnv,automaticRosterSeed,automaticSettings,block,patch,createRuntime,sentPrompts};', spec);
const F = fixture.exports;
const { Schema, copy, automaticRosterSeed, automaticSettings, block, patch } = F;
const { prepareCharacterRoster } = require('../运行/character-roster.ts');
const { LibrarySchema, libraryRevision, prepareLibraryCommand } = require('../运行/character-library.ts');
const { planTasks, validateTaskResult } = require('../运行/tasks.ts');
const { countRound } = require('../运行/core.ts');
const { finalizeArchive } = require('../运行/archive.ts');
const { elapsedMinutes } = require('../运行/world.ts');
const { planOpeningCharacters } = require('../运行/opening.ts');
const { pendingUpdateTasks, finalizeUpdateTasks } = require('../运行/update-tasks.ts');
const options = { majorLimit: 6, minorLimit: 3, majorRotation: 2, minorRotation: 1 };
const names = ['01-摘要误占生活检查', '02-自动待机丢失升格', '03-回复评论漏锁对象', '04-主要角色长期占位'];
const output = process.env.VALORAN_AUDIT_DIR;
const trace = [], statistics = [];
let issue = 0, scenario = '', lastReply;
function log(error, label, raw) {
  if (!output) return;
  const file = path.join(output, '日志', names[issue] + '-错误.log');
  const text = `\n[${new Date().toISOString()}] ${scenario} / ${label}\n${util.inspect(error, { depth: null, colors: false })}\n${raw === undefined ? '' : '相关原始回复: ' + raw + '\n'}`;
  try { fs.appendFileSync(file, text); }
  catch (saving) { throw new AggregateError([error, saving], '错误文件保存失败，保留原异常'); }
}
const warn = console.warn;
console.warn = (...args) => { log(args, '运行时原始警告（测试故障）', block([])); warn(...args); };
function check(index, title, fn) {
  test(title, async () => {
    issue = index; scenario = title; lastReply = undefined;
    try { await fn(); }
    catch (error) { log(error, '回归断言失败', lastReply); throw error; }
  });
}
async function rejects(fn, pattern) {
  let caught;
  await assert.rejects(async () => { try { await fn(); } catch (error) { caught = error; throw error; } }, pattern);
  log(caught, '预期故障');
}
function task(s, kind, id, version = s.角色[id]._管理.版本, extra = {}) {
  return Schema.parse({ _系统: { 任务: { t: { 类别: kind, 目标id: [id], 目标版本: { [id]: version }, 状态: '排队', 提交id: 'original-' + kind, ...extra } } } })._系统.任务.t;
}
const auto = (s, l) => libraryRevision(s, LibrarySchema.parse(l)).automatic;
function reply(patches) { lastReply = block(patches); return lastReply; }
function fixturePins(s, l, input = '', action) {
  const lib = LibrarySchema.parse(l), revision = libraryRevision(s, lib), off = new Set(revision.automatic?.manualOff ?? Object.keys(revision.disabled));
  const people = { ...Object.fromEntries(Object.entries(revision.disabled).map(([id, key]) => [id, lib.snapshots[key].pack.角色])), ...s.角色 };
  const accounts = action?.kind === 'send' ? s.手机.会话[action.id]?.参与账号id ?? [] : action?.kind === 'invite' ? action.targets ?? [] : ['comment', 'like', 'repost'].includes(action?.kind) ? [s.手机.原文.帖子[action.id]?.发布账号id, ...(action.kind === 'comment' && action.replyTo ? [s.手机.原文.评论[action.replyTo]?.评论账号id] : [])] : [];
  const ids = new Set([...s.世界.当前场景.在场人物, ...accounts.map(id => s.手机.账号[id]?.人物id), ...Object.keys(people).filter(id => input.includes(id) || (people[id].姓名 && input.includes(people[id].姓名)))]);
  for (const a of Object.values(s.约定)) { const distance = elapsedMinutes(s.世界.当前时间, a.时间); if (a.状态 === '已确认' && a.参与者[s.玩家.id]?.响应 === '接受' && distance !== null && distance >= -60 && distance <= 90) for (const [id, p] of Object.entries(a.参与者)) if (p.响应 === '接受') ids.add(id); }
  return [...ids].filter(id => people[id] && !off.has(id));
}
function record(s, l, phase, more = {}) {
  const lib = LibrarySchema.parse(l), a = auto(s, lib);
  const previous = trace.findLast(row => row.scenario === scenario);
  trace.push({ scenario, phase, trigger: more.input ?? phase, anchor: a?.anchor, active: Object.keys(s.角色),
    present: s.世界.当前场景.在场人物, pinned: more.pinned ?? previous?.pinned ?? [], pinnedEvidence: 'from fixture input/scene/action/agreements, not production instrumentation', rotation: a?.rotation, checks: a?.checks,
    queueBefore: previous?.queues ?? {}, queues: a?.queues, manualOff: a?.manualOff,
    tasks: copy(s._系统.任务), rounds: Object.keys(s._系统.已计轮事件), libraryVersion: s._系统.角色库版本,
    snapshots: Object.keys(lib.snapshots).length, revisions: Object.keys(lib.revisions).length,
    saveResult: 'in-memory preparation', ...more });
}
function local(s = automaticRosterSeed()) { return { s: copy(s), l: LibrarySchema.parse({}) }; }
function select(x, input = '', config = options, action) {
  const pinned = fixturePins(x.s, x.l, input, action);
  const p = prepareCharacterRoster(x.s, x.l, input, action, config);
  if (p) { x.s = planTasks(p.state); x.l = p.library; }
  record(x.s, x.l, 'schedule', { input, config, action, pinned }); return p;
}
function finish(x) {
  x.s = finalizeUpdateTasks(x.s, copy(x.s), pendingUpdateTasks(x.s), block([]));
  countRound(x.s, 'regression-' + trace.length);
  x.s = planTasks(x.s); record(x.s, x.l, 'success');
}
function hostRecord(e, phase, more = {}) {
  const action = e.vars.澄湾待更新手机?.action, input = action ? '' : e.messages.findLast(m => m.role === 'user')?.message ?? '';
  record(e.state(), e.vars.澄湾角色库, phase, { saveResult: 'fixture memory persistence', pinned: fixturePins(e.state(), e.vars.澄湾角色库, input, action), input, action, players: e.messages.filter(m => m.role === 'user').length, assistants: e.messages.filter(m => m.role === 'assistant').length, ...more });
}
function prompts(e) {
  const capture = (config, phase) => {
    const content = JSON.stringify(F.sentPrompts(config));
    const a = auto(e.state(), e.vars.澄湾角色库);
    hostRecord(e, phase, { promptActive: Object.keys(e.state().角色).filter(id => content.includes('ROSTER_PRIVATE_' + id)), promptTasks: pendingUpdateTasks(e.state()).filter(id => content.includes(id)) });
    for (const id of a?.manualOff ?? []) assert(!content.includes('ROSTER_PRIVATE_' + id));
    for (const id of Object.keys(libraryRevision(e.state(), LibrarySchema.parse(e.vars.澄湾角色库)).disabled)) assert(!content.includes('ROSTER_PRIVATE_' + id));
    assert(!content.includes('"queues"')); assert(!content.includes('LifeCheck'));
  };
  e.story = async config => { capture(config, 'story-request'); return '玩家安静观察周围。'; };
  e.update = async config => { capture(config, 'variable-or-phone-request'); return reply([]); };
}

check(0, 'R1 摘要与生活任务并存，旧版本不阻挡；摘要身份保持', () => {
  for (const kind of ['摘要', '生活更新']) for (const status of ['排队', '失败', '已提交']) {
    const s = automaticRosterSeed();
    s._系统.任务.old = task(s, kind, 'm04', kind === '摘要' ? 0 : 999, { 状态: status });
    const x = local(s); select(x);
    const id = auto(x.s, x.l).checks.m04;
    assert.notEqual(id, 'old'); assert.equal(x.s._系统.任务[id].类别, '生活更新');
    assert(pendingUpdateTasks(x.s).includes(id));
    assert.equal(x.s._系统.任务.old.提交id, 'original-' + kind);
    x.s.角色.m04._更新循环.当前计数 = 5;
    const noRoster = planTasks(copy(x.s)); // use the same valid pending check, no duplicate
    assert.equal(Object.values(noRoster._系统.任务).filter(t => t.类别 === '生活更新' && t.目标版本.m04 === 0).length, 1);
  }
});

check(0, 'R1 Runtime：真实摘要失败不成为轮换完成凭据，生活空更新有效', async () => {
  const s = automaticRosterSeed();
  for (let i = 0; i < 10; i++) s.角色.m00.经历.最近经历['record' + i] = { 日期说明: '2026年09月22日', 日期精度: '日', 经历: '完成独立工作' + i, 来源事件id: [], 来源存档id: null };
  const initial = planTasks(Schema.parse(s));
  const summary = Object.keys(initial._系统.任务).find(id => initial._系统.任务[id].类别 === '摘要');
  await F.withEnv(async e => {
    prompts(e); await e.runtime.send('观察环境');
    const a = auto(e.state(), e.vars.澄湾角色库), id = a.checks.m00;
    assert.notEqual(id, summary); assert.equal(e.state()._系统.任务[id].状态, '已提交');
    assert.equal(e.state()._系统.任务[summary].状态, '失败');
    assert.equal(e.state()._系统.任务[summary].提交id, initial._系统.任务[summary].提交id);
    await rejects(() => finalizeArchive(initial, copy(e.state()), summary, true), /摘要/);
    for (let i = 0; i < 3; i++) await e.runtime.send('观察环境');
    assert(!auto(e.state(), e.vars.澄湾角色库).rotation.m00);
    hostRecord(e, 'four-successes');
  }, initial, automaticSettings());
});

check(0, 'R1 planTasks：失败摘要和旧版本生活任务不遮挡升格或到期生活', () => {
  for (const kind of ['摘要', '生活更新']) for (const intent of ['升格', '生活更新']) {
    const s = automaticRosterSeed();
    s._系统.任务.old = task(s, kind, 'm00', kind === '生活更新' ? 999 : 0, { 状态: '失败' });
    if (intent === '升格') s.角色.m00._管理.升格 = true; else s.角色.m00._更新循环.当前计数 = 5;
    const result = planTasks(s);
    assert(Object.entries(result._系统.任务).some(([id, t]) => id !== 'old' && t.类别 === intent && t.目标版本.m00 === 0));
    assert.equal(Object.keys(planTasks(result)._系统.任务).length, Object.keys(result._系统.任务).length);
  }
});

check(0, 'R1 历史checks/rotation里的摘要或旧版本已提交任务不能继续复用', () => {
  for (const kind of ['摘要', '生活更新']) {
    const x = local(); select(x);
    const a = auto(x.s, x.l), queue = copy(a.queues.主要);
    x.s._系统.任务.wrong = task(x.s, kind, 'm00', 999, { 状态: '已提交' });
    const saved = x.l.revisions[x.s._系统.角色库版本].automatic;
    saved.checks.m00 = 'wrong'; saved.rotation.m00 = 'wrong';
    select(x); assert.notEqual(auto(x.s, x.l).checks.m00, 'wrong');
    assert.deepEqual(auto(x.s, x.l).queues.主要, queue);
    assert.equal(x.s._系统.任务.wrong.提交id, 'original-' + kind);
  }
});

check(0, 'R1 有效建档已经承担首次融入，不重复排自然融入；旧版本建档不阻挡', () => {
  const s = automaticRosterSeed(); s.角色.m00._管理.来源档案id = 'source';
  s._系统.来源档案 = Schema.parse({ _系统: { 来源档案: { source: { 人物id: 'm00', 原始快照JSON: '{}' } } } })._系统.来源档案;
  const opening = planOpeningCharacters(s, ['m00']);
  assert.equal(Object.values(opening._系统.任务).filter(t => t.类别 === '建档').length, 1);
  const result = planTasks(opening);
  assert.equal(Object.values(result._系统.任务).filter(t => t.类别 === '自然融入').length, 0);
  Object.values(opening._系统.任务)[0].目标版本.m00 = 999;
  assert.equal(Object.values(planTasks(opening)._系统.任务).filter(t => t.类别 === '自然融入').length, 1);
});

check(1, 'R2 生活成功不能清除升格意图；有效升格完成后清除且不重复', () => {
  const s = automaticRosterSeed(); s.角色.n02._管理.升格 = true;
  s._系统.任务.life = task(s, '生活更新', 'n02');
  let result = validateTaskResult(s, copy(s), 'life');
  assert.equal(result.角色.n02._管理.升格, true);
  result = planTasks(result);
  const id = Object.keys(result._系统.任务).find(id => result._系统.任务[id].类别 === '升格');
  assert(id);
  const after = copy(result); after.角色.n02 = Schema.parse({ 角色: { n02: { ...after.角色.n02, 层级: '主要', 性格: {} } } }).角色.n02;
  result = validateTaskResult(result, after, id);
  assert.equal(result.角色.n02._管理.升格, false);
  assert.equal(Object.values(planTasks(result)._系统.任务).filter(t => t.类别 === '升格').length, 1);
  const x = local(result), zero = { majorLimit: 0, minorLimit: 0, majorRotation: 0, minorRotation: 0 };
  select(x, '', zero); assert(!x.s.角色.n02);
  x.s = Schema.parse(JSON.parse(JSON.stringify(x.s))); x.l = LibrarySchema.parse(JSON.parse(JSON.stringify(x.l)));
  select(x, 'n02', zero); assert.equal(x.s.角色.n02._管理.升格, false);
  assert(!pendingUpdateTasks(x.s).some(id => x.s._系统.任务[id].类别 === '升格'));
});

for (const failure of ['none', 'library', 'journal']) check(1, 'R2 Runtime 升格跨待机、恢复、重载与保存阶段 ' + failure, async () => {
  await F.withEnv(async e => {
    prompts(e); await e.runtime.send('观察环境');
    await e.runtime.commit(s => { s.角色.n02._管理.升格 = true; });
    const oldId = Object.keys(e.state()._系统.任务).find(id => e.state()._系统.任务[id].类别 === '升格');
    const oldVersion = e.state().角色.n02._管理.版本;
    await e.runtime.send('继续观察'); assert(!e.state().角色.n02);
    assert.equal(e.state()._系统.任务[oldId].状态, '失效');
    const lib = LibrarySchema.parse(e.vars.澄湾角色库), rev = libraryRevision(e.state(), lib);
    assert.equal(lib.snapshots[rev.disabled.n02].pack.角色._管理.升格, true);
    hostRecord(e, 'dormant-promotion');
    const save = SillyTavern.saveChat;
    if (failure !== 'none') {
      let fired = false;
      SillyTavern.saveChat = async () => {
        const libraryWritten = Object.keys(e.vars.澄湾角色库?.revisions ?? {}).length > Object.keys(lib.revisions).length;
        const referenceWritten = e.messages.some(m => m.data?.stat_data?.角色?.n02?._管理.版本 > oldVersion);
        if (!fired && (failure === 'library' ? libraryWritten && !e.vars.澄湾待确认提交 : referenceWritten && e.vars.澄湾待确认提交?.rollbackOnFailure)) {
          fired = true; throw Error('promotion ' + failure + ' persistence rejected');
        }
        e.saveDisk();
      };
      await rejects(() => e.runtime.send('联系n02'), /promotion/);
      hostRecord(e, 'save-failed', { journal: copy(e.vars.澄湾待确认提交) });
      SillyTavern.saveChat = save;
    }
    await e.runtime.dispose(); e.runtime = F.createRuntime(); await e.runtime.start();
    let newId;
    e.update = async () => {
      const s = e.state(); newId = pendingUpdateTasks(s).find(id => s._系统.任务[id].类别 === '升格' && s._系统.任务[id].目标id.includes('n02'));
      assert(newId); assert.notEqual(newId, oldId); assert(s.角色.n02._管理.版本 > oldVersion);
      assert.equal(s._系统.任务[oldId].候选结果JSON, null);
      return reply([patch('/角色/n02/层级', '主要'), patch('/角色/n02/性格', {})]);
    };
    if (failure === 'none') await e.runtime.send('联系n02'); else await e.runtime.retry();
    assert.equal(e.state().角色.n02.层级, '主要'); assert.equal(e.state().角色.n02._管理.升格, false);
    assert.equal(e.state()._系统.任务[newId].状态, '已提交');
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 3);
    assert.equal(e.messages.filter(m => m.role === 'user').length, 3);
    hostRecord(e, 'promotion-completed');
    e.update = async () => block([]); await e.runtime.send('联系n02');
    assert.equal(Object.values(e.state()._系统.任务).filter(t => t.类别 === '升格').length, 2);
  }, automaticRosterSeed(), automaticSettings());
});

check(1, 'R2 手动关闭不自动唤醒，手动恢复沿原语义取消旧升格', () => {
  const x = local(); select(x); x.s.角色.n02._管理.升格 = true; x.s = planTasks(x.s);
  let p = prepareLibraryCommand(x.s, x.l, { kind: 'enabled', ids: ['n02'], enabled: false }); x.s = p.state; x.l = p.library;
  select(x, 'n02'); assert(!x.s.角色.n02); assert(auto(x.s, x.l).manualOff.includes('n02'));
  p = prepareLibraryCommand(x.s, x.l, { kind: 'enabled', ids: ['n02'], enabled: true });
  assert.equal(p.state.角色.n02._管理.升格, false);
});

check(1, 'R2 Runtime：待机提交失败同ID恢复，旧候选失效，升格空结果失败后按新版本接续', async () => {
  await F.withEnv(async e => {
    prompts(e); await e.runtime.send('观察环境');
    await e.runtime.commit(s => { s.角色.n02._管理.升格 = true; });
    const oldId = Object.keys(e.state()._系统.任务).find(id => e.state()._系统.任务[id].类别 === '升格');
    const save = SillyTavern.saveChat;
    SillyTavern.saveChat = async () => {
      if (e.vars.澄湾待确认提交?.rollbackOnFailure && !e.messages.at(-1)?.data?.stat_data?.角色?.n02)
        throw Error('expected dormant promotion journal failure');
      e.saveDisk();
    };
    await rejects(() => e.runtime.send('继续观察'), /dormant promotion/);
    const journal = copy(e.vars.澄湾待确认提交), snapshots = Object.keys(e.vars.澄湾角色库.snapshots).length;
    assert.equal(e.state().角色.n02._管理.升格, true);
    SillyTavern.saveChat = save; await e.runtime.dispose(); e.runtime = F.createRuntime(); await e.runtime.start(); await e.runtime.retry();
    assert(!e.state().角色.n02); assert(e.state()._系统.提交记录[journal.commitId]);
    assert.equal(Object.keys(e.vars.澄湾角色库.snapshots).length, snapshots);
    await rejects(() => validateTaskResult(e.state(), copy(e.state()), oldId), /失效/);
    await e.runtime.send('联系n02');
    const newId = pendingUpdateTasks(e.state()).find(id => e.state()._系统.任务[id].类别 === '升格');
    assert(newId); assert.notEqual(newId, oldId); assert.equal(e.state()._系统.任务[newId].状态, '失败');
    assert.equal(e.state().角色.n02._管理.升格, true);
    await rejects(() => validateTaskResult(e.state(), copy(e.state()), newId, true, true), /升格候选/);
    hostRecord(e, 'promotion-result-failed');
    e.update = async () => { assert.equal(pendingUpdateTasks(e.state()).find(id => e.state()._系统.任务[id].类别 === '升格'), newId); return reply([patch('/角色/n02/层级', '主要'), patch('/角色/n02/性格', {})]); };
    await e.runtime.send('联系n02');
    assert.equal(e.state()._系统.任务[newId].状态, '已提交'); assert.equal(e.state().角色.n02._管理.升格, false);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 4);
    assert.equal(e.messages.filter(m => m.role === 'user').length, 4);
    hostRecord(e, 'promotion-recovered');
  }, automaticRosterSeed(), automaticSettings());
});

function phoneSeed() {
  const s = automaticRosterSeed(); s.手机.账号.author = { 人物id: 'n18', 平台: '邻信' };
  s.手机.原文.帖子.post = { 平台: '朋友圈', 发布账号id: 'author' };
  s.手机.原文.评论.comment = { 帖子id: 'post', 评论账号id: 'npc' };
  return Schema.parse(s);
}
for (const off of [false, true]) check(2, 'R3 Runtime 回复评论两位作者，manualOff=' + off, async () => {
  await F.withEnv(async e => {
    prompts(e); await e.runtime.send('观察环境');
    if (off) await e.runtime.manageCharacters({ kind: 'enabled', ids: ['n19'], enabled: false });
    await e.runtime.phoneAction({ kind: 'comment', id: 'post', replyTo: 'comment', text: '回复这条评论', platform: '邻信' });
    assert(e.state().角色.n18); assert.equal(!!e.state().角色.n19, !off);
    assert(!e.state().世界.当前场景.在场人物.includes('n18')); assert(!e.state().世界.当前场景.在场人物.includes('n19'));
    const last = trace.findLast(row => row.scenario === scenario && row.phase === 'variable-or-phone-request');
    assert(last.promptActive.includes('n18')); assert.equal(last.promptActive.includes('n19'), !off);
    hostRecord(e, 'phone-reply', { pinned: off ? ['n18'] : ['n18', 'n19'] });
  }, phoneSeed(), automaticSettings());
});
check(2, 'R3 普通评论、点赞、转发不新增评论对象，同作者去重', () => {
  for (const kind of ['comment', 'like', 'repost']) {
    const x = local(phoneSeed()); select(x); finish(x);
    select(x, '', options, { kind, id: 'post', text: '互动', platform: '邻信' });
    assert(x.s.角色.n18); assert(!x.s.角色.n19);
  }
  const s = phoneSeed(); s.手机.原文.评论.comment.评论账号id = 'author';
  const x = local(s); select(x, '', options, { kind: 'comment', id: 'post', replyTo: 'comment', text: '互动' });
  assert.equal(Object.keys(x.s.角色).filter(id => id === 'n18').length, 1);
});

function metrics(rows, ids) {
  return Object.fromEntries(ids.map(id => {
    let selected = 0, exits = 0, run = 0, wait = 0, longestRun = 0, longestWait = 0, previous = false;
    for (const row of rows) { const active = row.includes(id); if (active) { selected++; run++; wait = 0; } else { if (previous) exits++; wait++; run = 0; } longestRun = Math.max(longestRun, run); longestWait = Math.max(longestWait, wait); previous = active; }
    return [id, { selected, exits, longestRun, longestWait }];
  }));
}
check(3, '策略：高分主要人物连续45轮会离席并再次入选；每轮更换2人', () => {
  const x = local(); for (let i = 0; i < 4; i++) { x.s.角色['m0' + i].关系网.player = { 好感度: 100 }; x.s.角色['m0' + i].当前地点id = 'place'; }
  x.s.玩家.当前状态.当前地点id = 'place'; x.s = Schema.parse(x.s);
  const rows = [];
  for (let i = 0; i < 45; i++) { select(x); rows.push(Object.keys(x.s.角色)); finish(x); }
  const stats = metrics(rows, Object.keys(automaticRosterSeed().角色)); statistics.push({ scenario, stats });
  for (const id of Object.keys(stats).filter(id => id.startsWith('m'))) { assert(stats[id].exits > 0, id + ' never exits'); assert(stats[id].selected > 1); assert(stats[id].longestRun <= 3, id + ' priority seat monopolized'); }
  for (let i = 1; i < rows.length; i++) assert.equal(rows[i].filter(id => id.startsWith('m') && !rows[i - 1].includes(id)).length, 2);
  assert.equal(stats.n00.selected, 45); assert.equal(stats.n01.selected, 45); // minor priority semantics unchanged
});
check(3, '策略 Runtime：30轮高分样本的原优先人物实际离席并重返，无额外选人请求', async () => {
  const s = automaticRosterSeed(); for (let i = 0; i < 4; i++) s.角色['m0' + i].关系网.player = { 好感度: 100 };
  await F.withEnv(async e => {
    prompts(e); const rows = [];
    for (let i = 0; i < 30; i++) { await e.runtime.send('观察环境'); rows.push(Object.keys(e.state().角色)); hostRecord(e, 'round-' + (i + 1)); }
    const stats = metrics(rows, Object.keys(s.角色)); statistics.push({ scenario, stats });
    for (let i = 0; i < 4; i++) { const item = stats['m0' + i]; assert(item.exits >= 2); assert(item.longestRun <= 3); assert(item.selected >= 3); }
    assert.equal(e.calls.length, 60); assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 30);
  }, Schema.parse(s), automaticSettings());
});
for (const config of [options, { ...options, majorLimit: 2, majorRotation: 1, minorLimit: 5, minorRotation: 3 }, { ...options, majorLimit: 40 }, { ...options, majorRotation: 0 }, { ...options, majorLimit: 0, majorRotation: 0 }]) check(3, '策略边界 ' + JSON.stringify(config), () => {
  const x = local(), rows = [];
  for (let i = 0; i < 18; i++) { select(x, i >= 3 && i < 7 ? 'm00 m29' : '', config); rows.push(Object.keys(x.s.角色)); if (i >= 3 && i < 7) { assert(x.s.角色.m00); assert(x.s.角色.m29); } finish(x); }
  statistics.push({ scenario, stats: metrics(rows, Object.keys(automaticRosterSeed().角色)) });
  if (!config.majorRotation) assert.equal(Object.keys(auto(x.s, x.l).rotation).filter(id => id.startsWith('m')).length, 0);
  const all = local(); all.s.世界.当前场景.在场人物 = Object.keys(all.s.角色); select(all, '', config);
  assert.equal(Object.keys(all.s.角色).length, 50); assert.equal(Object.keys(auto(all.s, all.l).rotation).length, 0);
});
check(3, '策略：失败生活检查保留原任务，恢复成功才推进；同anchor不再次推进', () => {
  const x = local(); select(x); const a = auto(x.s, x.l), id = Object.keys(a.rotation).find(id => id.startsWith('m')), tid = a.rotation[id];
  for (let i = 0; i < 3; i++) {
    x.s._系统.任务[tid].状态 = '失败'; x.s._系统.任务[tid].错误 = '预期故障：生活检查未完成';
    log(x.s._系统.任务[tid].错误, '预期故障：直接注入任务错误文本，无异常堆栈或模型回包');
    countRound(x.s, 'other-' + i); select(x); assert.equal(auto(x.s, x.l).rotation[id], tid); assert(x.s.角色[id]);
  }
  x.s = finalizeUpdateTasks(x.s, copy(x.s), pendingUpdateTasks(x.s), block([]));
  const before = Object.keys(x.s.角色); select(x); assert.deepEqual(Object.keys(x.s.角色), before);
  countRound(x.s, 'completed'); select(x); assert(!x.s.角色[id]);
});

for (const phase of ['story', 'update', 'library', 'journal']) check(3, 'Runtime 失败重载同ID恢复：' + phase, async () => {
  await F.withEnv(async e => {
    prompts(e); const success = e[phase], save = SillyTavern.saveChat;
    if (phase === 'story' || phase === 'update') e[phase] = async () => { throw new Error('expected ' + phase + ' failure', { cause: new Error('fixture transport rejected') }); };
    else SillyTavern.saveChat = async () => { if (phase === 'library' ? e.vars.澄湾角色库 && !e.vars.澄湾待确认提交 : !e.messages[0].data.stat_data.角色.m29) throw Error('expected ' + phase + ' failure'); e.saveDisk(); };
    await rejects(() => e.runtime.send('观察环境'), /expected/);
    const snapshots = Object.keys(e.vars.澄湾角色库?.snapshots ?? {}).length;
    const id = e.vars.澄湾待更新正文?.id ?? e.vars.澄湾失败正文?.id;
    const journal = e.vars.澄湾待确认提交?.commitId;
    hostRecord(e, 'failed', { originalId: id, journalId: journal });
    if (phase === 'story' || phase === 'update') e[phase] = success; SillyTavern.saveChat = save;
    await e.runtime.dispose(); e.runtime = F.createRuntime(); await e.runtime.start(); await e.runtime.retry();
    assert.equal(e.messages.filter(m => m.role === 'user').length, 1);
    assert.equal(e.messages.filter(m => m.role === 'assistant').length, 2);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
    if (journal) assert(e.state()._系统.提交记录[journal]);
    if (phase !== 'library') assert.equal(Object.keys(e.vars.澄湾角色库.snapshots).length, snapshots);
    else assert.equal(Object.keys(e.vars.澄湾角色库.snapshots).length, snapshots * 2); // R7 remains separately documented
    hostRecord(e, 'recovered', { originalId: id, journalId: journal });
  }, automaticRosterSeed(), automaticSettings());
});
after(() => {
  console.warn = warn;
  if (output) fs.writeFileSync(path.join(output, '回归轨迹-' + process.env.VALORAN_RUN + '.json'), JSON.stringify({ evidence: 'actual functions and Runtime; offline mock persistence and model responses', trace, statistics }, null, 2));
});
