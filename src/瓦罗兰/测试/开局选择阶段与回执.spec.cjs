const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { Schema, copy, withEnv, block, createRuntime } = require('./修复宿主.cjs');
const { AutomaticRosterSchema, LibrarySchema, libraryRevision, prepareAutomaticLibrary, prepareLibraryCommand } = require('../运行/character-library.ts');
const { prepareOpeningCharacterRoster, restoreOpeningCharacterSources } = require('../运行/character-roster.ts');
const { createProfile } = require('../运行/creation.ts');
const { lifeUpdates } = require('./生活更新夹具.cjs');

const people = ['a', 'b', 'c'].map(id => ({ id, 姓名: '阶段样本' + id, 层级: '主要', __imported: true }));
const options = { majorLimit: 1, minorLimit: 0, majorRotation: 0, minorRotation: 0 };
const settings = {
  characterAuto: true,
  informationAuto: true,
  characterRoster: options,
  variable: { mode: 'main' },
  phone: { mode: 'main' },
};
const opening = e => libraryRevision(e.state(), LibrarySchema.parse(e.vars.澄湾角色库)).automatic.opening;
const openingTasks = e => Object.values(e.state()._系统.任务).filter(task =>
  task.类别 === '建档' && ['排队', '失败'].includes(task.状态));

function replies(e, selected = ['b']) {
  e.update = async () => e.runtime.view.phase === 'information'
    ? JSON.stringify({ 人物: selected, 地点: [], 组织: [] })
    : block(lifeUpdates(e.state()));
}

function assertSelectedSources(e, ids) {
  const state = e.state();
  for (const id of ids) {
    const sourceId = state.角色[id]._管理.来源档案id;
    assert(sourceId, '开局选中人物应保留导入来源');
    assert.equal(state._系统.来源档案[sourceId].人物id, id);
    assert.equal(state.角色[id]._管理.恢复说明, null);
  }
  const receipt = e.runtime.view.updates.at(-1);
  if (receipt) assert.deepEqual([...receipt.targets].sort(), [...ids].sort());
}

async function run(fn, config = {}, characters = people) {
  await withEnv(async e => {
    const created = await e.runtime.createProfile({
      player: { 姓名: '开局阶段玩家' },
      characters,
      details: { 地点: { review_place: { 名称: '阶段测试地点' } } },
    });
    replies(e);
    await fn(e, created);
  }, Schema.parse({}), { ...settings, ...config });
}

async function reopenFile(e) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'valoran-opening-'));
  const file = path.join(folder, 'chat.json');
  fs.writeFileSync(file, JSON.stringify(e.diskChat));
  const disk = JSON.parse(fs.readFileSync(file, 'utf8'));
  await e.runtime.dispose();
  e.vars = copy(disk[0].chat_metadata.variables);
  e.messages = disk.slice(1).map(message => ({
    role: message.is_user ? 'user' : 'assistant',
    message: message.mes,
    data: copy(message.variables?.[message.swipe_id ?? 0] ?? {}),
    extra: copy(message.extra ?? {}),
    swipe_id: message.swipe_id,
    swipes: message.swipes,
    swipe_info: message.swipe_info,
    swipes_data: message.swipes ? message.variables : undefined,
  }));
  e.runtime = createRuntime();
  await e.runtime.start();
  fs.unlinkSync(file);
  fs.rmdirSync(folder);
}

test('建档暂存带待选择标记，资料失败冷开切本地后补选一次', async () => {
  await run(async (e, created) => {
    assert.equal(created.selectionPending, true);
    assert.equal(opening(e).selectionPending, true);
    e.update = async () => { throw Error('阶段测试资料失败'); };
    await assert.rejects(e.runtime.startOpening(), /阶段测试资料失败/);
    const originalId = e.vars.澄湾失败请求.id;
    await reopenFile(e);
    assert.equal(opening(e).selectionPending, true);
    await e.runtime.saveSettings({ informationAuto: false }, 'general');
    replies(e);
    await e.runtime.retry();
    assert.equal(opening(e).selectionPending, false);
    assert.equal(Object.keys(e.state().角色).length, 1);
    assert(e.state()._系统.提交记录[originalId]);
    assert.equal(e.messages.filter(message => message.role === 'user').length, 1);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
    assert.equal(e.runtime.view.updates.length, 1);
    assertSelectedSources(e, Object.keys(e.state().角色));
    await reopenFile(e);
    assert.equal(opening(e).selectionPending, false);
    assert.equal(Object.keys(e.state().角色).length, 1);
    assertSelectedSources(e, Object.keys(e.state().角色));
  });
});

test('模型合法选空后清除资料选择依据，关闭自动选择仍保留空名单', async () => {
  await run(async e => {
    replies(e, []);
    e.story = async () => { throw Error('阶段测试正文失败'); };
    await assert.rejects(e.runtime.startOpening(), /阶段测试正文失败/);
    assert.equal(opening(e).selectionPending, false);
    assert.notEqual(e.state()._系统.资料加载.选择依据, null);
    await e.runtime.discardPending();
    await e.runtime.manageInformation('地点', 'review_place', '仅名称');
    assert.equal(e.state()._系统.资料加载.选择依据, null);
    await e.runtime.saveSettings({ informationAuto: false }, 'general');
    await reopenFile(e);
    e.story = async () => '空名单开场正文';
    replies(e);
    await e.runtime.startOpening();
    assert.equal(opening(e).selectionPending, false);
    assert.deepEqual(Object.keys(e.state().角色), []);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
  });
});

test('本地建档已经选择，正文重试复用名单与角色库', async () => {
  await run(async (e, created) => {
    assert.equal(created.selectionPending, false);
    assert.equal(opening(e).selectionPending, false);
    const library = copy(e.vars.澄湾角色库);
    e.story = async () => { throw Error('本地正文失败'); };
    await assert.rejects(e.runtime.startOpening(), /本地正文失败/);
    e.story = async () => '本地重试正文';
    await e.runtime.retry();
    assert.deepEqual(e.vars.澄湾角色库, library);
  }, { informationAuto: false });
});

test('零配额完成本地选择后重复失败恢复不新增准备快照', async () => {
  await run(async e => {
    e.update = async () => { throw Error('零配额资料失败'); };
    await assert.rejects(e.runtime.startOpening(), /零配额资料失败/);
    await e.runtime.saveSettings({ informationAuto: false }, 'general');
    e.story = async () => { throw Error('零配额正文失败'); };
    await assert.rejects(e.runtime.retry(), /零配额正文失败/);
    assert.equal(opening(e).selectionPending, false);
    const library = copy(e.vars.澄湾角色库);
    await assert.rejects(e.runtime.retry(), /零配额正文失败/);
    assert.deepEqual(e.vars.澄湾角色库, library);
    assert.equal(openingTasks(e).length, 1);
  }, { characterRoster: { ...options, majorLimit: 0 } });
});

test('旧档缺少选择阶段时保留既有名单，显式模型推荐仍可选择', async () => {
  await run(async e => {
    const library = copy(e.vars.澄湾角色库);
    const version = e.state()._系统.角色库版本;
    delete library.revisions[version].automatic.opening.selectionPending;
    const legacy = LibrarySchema.parse(library);
    assert.equal(legacy.revisions[version].automatic.opening.selectionPending, undefined);
    assert.equal(prepareOpeningCharacterRoster(e.state(), legacy, options), null);
    const selected = prepareOpeningCharacterRoster(e.state(), legacy, options, undefined, ['b']);
    assert.deepEqual(Object.keys(selected.state.角色), ['b']);
    assert.equal(selected.revision.automatic.opening.selectionPending, false);
    const sourceId = selected.state.角色.b._管理.来源档案id;
    assert.equal(selected.state._系统.来源档案[sourceId].人物id, 'b');
  });
});

test('实际171人库资料失败后关闭选择，默认配额开场准备6主3次', async () => {
  const { parseCharacterBatch, selectedCharacters } = require('../界面/桌面端/utils/character-batch.ts');
  const folder = path.resolve(__dirname, '../角色');
  const characters = selectedCharacters(parseCharacterBatch(fs.readdirSync(folder)
    .filter(file => file.endsWith('.json'))
    .map(file => ({ name: file, text: fs.readFileSync(path.join(folder, file), 'utf8') }))), []);
  assert.equal(characters.length, 171);
  await run(async e => {
    e.update = async () => { throw Error('实际库资料选择失败'); };
    await assert.rejects(e.runtime.startOpening(), /实际库资料选择失败/);
    await e.runtime.saveSettings({ informationAuto: false }, 'general');
    replies(e);
    await e.runtime.retry();
    assert.equal(Object.values(e.state().角色).filter(person => person.层级 === '主要').length, 6);
    assert.equal(Object.values(e.state().角色).filter(person => person.层级 === '次要').length, 3);
    await reopenFile(e);
    assert.equal(Object.keys(e.state().角色).length, 9);
    assert.equal(e.runtime.view.updates.length, 1);
    assertSelectedSources(e, Object.keys(e.state().角色));
  }, { characterRoster: { majorLimit: 6, minorLimit: 3, majorRotation: 2, minorRotation: 1 } }, characters);
});

for (const action of ['ai_reroll', 'player_send']) {
  test(`开场成功后${action}沿新提交生成建档回执`, async () => {
    await run(async e => {
      await e.runtime.startOpening();
      assert.equal(e.runtime.view.updates.length, 1);
      const firstRound = Object.keys(e.state()._系统.已计轮事件)[0];
      e.update = async () => block([...lifeUpdates(e.state()),
        { op: 'replace', path: '/玩家/外貌/体型', value: '重生成后的体型说明' }]);
      await e.runtime.messageAction(action, action === 'ai_reroll' ? 2 : 1);
      assert.equal(e.runtime.view.updates.length, 1);
      const receipt = e.runtime.view.updates[0];
      const newRound = Object.keys(e.state()._系统.已计轮事件)[0];
      assert.notEqual(newRound, firstRound);
      assert(receipt.changed.includes('/玩家/外貌/体型'));
      assert.deepEqual(e.state()._系统.提交记录[receipt.commitId], e.state()._系统.提交记录[newRound]);
      assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
      await reopenFile(e);
      assert.deepEqual(e.runtime.view.updates, [receipt]);
    }, { informationAuto: false });
  });
}

test('开场变量失败后重生成生成新回执，后续普通回合使用普通结算', async () => {
  await run(async e => {
    e.update = async () => { throw Error('开局结算失败'); };
    await assert.rejects(e.runtime.startOpening(), /开局结算失败/);
    replies(e);
    await e.runtime.messageAction('ai_reroll', 2);
    assert.equal(e.runtime.view.updates.length, 1);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
    const receipts = copy(e.vars.澄湾更新回执);
    await e.runtime.send('继续观察');
    await e.runtime.messageAction('ai_reroll', 4);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 2);
    assert.deepEqual(e.vars.澄湾更新回执, receipts);
  }, { informationAuto: false });
});

test('默认双自动从暂存档案恢复来源，真实变量请求保留目标名单并冷开读回', async () => {
  await run(async e => {
    const snapshot = Object.values(e.vars.澄湾角色库.snapshots).find(item => item.id === 'b');
    const sourceId = snapshot.pack.角色._管理.来源档案id;
    const originalSource = copy(snapshot.pack.来源档案[sourceId]);
    const [taskId, task] = Object.entries(e.state()._系统.任务).find(([, task]) => task.类别 === '建档');
    await reopenFile(e);
    await e.runtime.startOpening();
    assertSelectedSources(e, ['b']);
    assert.equal(e.state().角色.b._管理.来源档案id, sourceId);
    assert.equal(e.state()._系统.来源档案[sourceId].原始快照JSON, originalSource.原始快照JSON);
    assert.equal(e.state()._系统.来源档案[sourceId].当前融入状态, '已融入');
    assert.equal(e.runtime.view.updates[0].taskId, taskId);
    assert.equal(e.runtime.view.updates[0].commitId, task.提交id);
    const request = e.calls.find(call => call.stage === 'variables');
    const prompt = request.config.finalMessages.map(message => message.content).join('\n');
    assert.match(prompt, /本次全部目标人物：b/);
    assert.doesNotMatch(prompt, /本次无额外导入角色/);
    await reopenFile(e);
    assertSelectedSources(e, ['b']);
    assert.equal(e.state()._系统.来源档案[sourceId].原始快照JSON, originalSource.原始快照JSON);
    assert.equal(e.vars.澄湾更新回执.length, 1);
  });
});

test('默认双自动两次重roll只保留当前开局任务和回执，冷开后仍一致', async () => {
  await run(async e => {
    await e.runtime.startOpening();
    const firstTask = e.runtime.view.updates[0].taskId;
    for (const selected of [['c'], ['a']]) {
      replies(e, selected);
      await e.runtime.messageAction('ai_reroll', 2);
      assert.equal(Object.values(e.state()._系统.任务).filter(task => task.类别 === '建档').length, 1);
      assert.equal(e.runtime.view.updates[0].taskId, firstTask);
      assert.equal(e.vars.澄湾更新回执.length, 1);
      assert.equal(e.runtime.view.updates.length, 1);
      assertSelectedSources(e, selected);
      const request = e.calls.findLast(call => call.stage === 'variables');
      assert.match(request.config.finalMessages.map(message => message.content).join('\n'),
        new RegExp('本次全部目标人物：' + selected[0]));
    }
    await reopenFile(e);
    assertSelectedSources(e, ['a']);
    assert.equal(e.vars.澄湾更新回执.length, 1);
  });
});

test('旧档同楼重复开局回执清理时保留独立任务回执', async () => {
  await run(async e => {
    await e.runtime.startOpening();
    const base = e.messages[0].data.stat_data;
    const original = copy(e.vars.澄湾更新回执[0]);
    base._系统.任务.legacy_opening = { ...copy(base._系统.任务[original.taskId]), 状态: '失效', 提交id: 'legacy_opening_commit' };
    base._系统.任务.independent = Schema.parse({ _系统: { 任务: { independent: {
      类别: '摘要', 状态: '已提交', 提交id: 'independent_commit',
    } } } })._系统.任务.independent;
    const independent = { ...original, taskId: 'independent', commitId: 'independent_commit', targets: [], changed: ['/手机/摘要'] };
    e.vars.澄湾更新回执.push({ ...original, taskId: 'legacy_opening', commitId: 'legacy_opening_commit' }, independent);
    // 模拟旧版已保存的同楼回执。独立提交在开场前已存在，重生成必须保留。
    base._系统.提交记录.independent_commit = Schema.parse({ _系统: { 提交记录: { independent_commit: {
      任务id: 'independent', 数据版本: base._系统.数据版本, 状态: '已写入',
    } } } })._系统.提交记录.independent_commit;
    e.saveDisk();
    await e.runtime.messageAction('ai_reroll', 2);
    assert.equal(e.vars.澄湾更新回执.length, 2);
    assert.deepEqual(e.vars.澄湾更新回执.find(receipt => receipt.taskId === 'independent'), independent);
    assert(!e.vars.澄湾更新回执.some(receipt => receipt.taskId === 'legacy_opening'));
    await reopenFile(e);
    assert.equal(e.runtime.view.updates.length, 2);
    assert.deepEqual(e.vars.澄湾更新回执.find(receipt => receipt.taskId === 'independent'), independent);
  });
});

test('开局恢复的目标拒绝新悬空地点，原导入悬空引用可保留并在冷开重试后提交', async () => {
  const characters = people.map(person => ({ ...person, 生活: { 住处id: 'imported_home_' + person.id } }));
  await run(async e => {
    e.update = async () => e.runtime.view.phase === 'information'
      ? JSON.stringify({ 人物: ['b'], 地点: [], 组织: [] })
      : block([{ op: 'replace', path: '/角色/b/当前地点id', value: 'new_missing_location' }]);
    await assert.rejects(e.runtime.startOpening(), /开局角色引用了不存在的地点/);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 0);
    assert.equal(e.state().角色.b.生活.住处id, 'imported_home_b');
    await reopenFile(e);
    replies(e);
    await e.runtime.retry();
    assertSelectedSources(e, ['b']);
    assert.equal(e.state().角色.b.生活.住处id, 'imported_home_b');
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
  }, {}, characters);
});

test('没有已计轮事件的普通手动及轮换恢复仍沿同存档恢复合同', () => {
  const created = createProfile(Schema.parse({}), { player: { 姓名: '恢复合同玩家' }, characters: people });
  const library = LibrarySchema.parse({});
  const staged = prepareAutomaticLibrary(created, library, libraryRevision(created, library), new Set(), AutomaticRosterSchema.parse({}));
  assert.equal(Object.keys(staged.state._系统.已计轮事件).length, 0);
  const manual = prepareLibraryCommand(staged.state, staged.library, { kind: 'enabled', ids: ['b'], enabled: true });
  const automatic = prepareAutomaticLibrary(staged.state, LibrarySchema.parse(staged.library),
    libraryRevision(staged.state, LibrarySchema.parse(staged.library)), new Set(['b']), AutomaticRosterSchema.parse({}));
  for (const restored of [manual, automatic]) {
    assert.equal(restored.state.角色.b._管理.来源档案id, null);
    assert.equal(Object.keys(restored.state._系统.来源档案).length, 0);
    assert.match(restored.state.角色.b._管理.恢复说明, /重新开启/);
    assert(!restored.state.世界.当前场景.在场人物.includes('b'));
  }
  assert.match(manual.state.角色.b._管理.恢复说明, /不补造关闭期间经历/);
  assert.match(automatic.state.角色.b._管理.恢复说明, /本次轮换须在同次变量结算中接续/);
});

test('完整建档回执组件忽略旧档失效任务，显示当前有效保存进度', async () => {
  const Module = require('node:module');
  const ts = require('typescript');
  const { parse, compileScript } = require('vue/compiler-sfc');
  const { createSSRApp, computed } = require('vue');
  const { renderToString } = require('vue/server-renderer');
  const { RuntimeKey } = require('../运行/host.ts');
  const state = Schema.parse({ _系统: { 建档完成: true, 任务: {
    obsolete: { 类别: '建档', 状态: '失效' }, current: { 类别: '建档', 状态: '已提交' },
  } } });
  const file = path.resolve(__dirname, '../界面/桌面端/components/chat/CreationReceipt.vue');
  const { descriptor } = parse(fs.readFileSync(file, 'utf8'), { filename: file });
  const script = compileScript(descriptor, { id: 'creation-receipt-review', inlineTemplate: true });
  const compiled = new Module(file, module);
  compiled.filename = file;
  compiled.paths = Module._nodeModulePaths(path.dirname(file));
  const normalRequire = compiled.require.bind(compiled);
  compiled.require = name => name.endsWith('/运行/host') ? { RuntimeKey }
    : name.endsWith('/utils/context') ? { useWorldState: () => computed(() => state), show: value => value ?? '', locationName: () => '' }
    : normalRequire(name);
  compiled._compile(ts.transpileModule(script.content, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, file);
  const app = createSSRApp(compiled.exports.default);
  app.provide(RuntimeKey, { view: { data: state, busy: false, updating: false } });
  const html = await renderToString(app);
  assert.match(html, /1 \/ 1 项更新已保存/);
});

test('旧开局来源恢复要求任务归属和精确快照版本，冲突来源明确拒绝', async () => {
  await run(async e => {
    e.story = async () => { throw Error('保存选择后停在正文失败'); };
    await assert.rejects(e.runtime.startOpening(), /保存选择后停在正文失败/);
    const legacy = copy(e.state());
    const taskId = libraryRevision(legacy, LibrarySchema.parse(e.vars.澄湾角色库)).automatic.checks.b;
    const sourceId = legacy.角色.b._管理.来源档案id;
    delete legacy._系统.来源档案[sourceId];
    legacy.角色.b._管理.来源档案id = null;
    legacy._系统.任务[taskId].目标id = [];
    legacy._系统.任务[taskId].目标版本 = {};
    const repaired = restoreOpeningCharacterSources(legacy, e.vars.澄湾角色库, taskId);
    assert.equal(repaired.角色.b._管理.来源档案id, sourceId);
    assert.deepEqual(repaired._系统.任务[taskId].目标id, ['b']);
    assert.equal(legacy.角色.b._管理.来源档案id, null);

    const changedVersion = copy(legacy);
    changedVersion.角色.b._管理.版本++;
    assert.equal(restoreOpeningCharacterSources(changedVersion, e.vars.澄湾角色库, taskId), changedVersion);
    const changedOwner = copy(e.vars.澄湾角色库);
    changedOwner.revisions[legacy._系统.角色库版本].automatic.checks.b = 'other_task';
    assert.equal(restoreOpeningCharacterSources(legacy, changedOwner, taskId), legacy);
    const otherSave = copy(e.vars.澄湾角色库);
    for (const snapshot of Object.values(otherSave.snapshots)) if (snapshot.id === 'b') snapshot.saveId = 'another-save';
    assert.equal(restoreOpeningCharacterSources(legacy, otherSave, taskId), legacy);

    const repeated = copy(e.vars.澄湾角色库);
    const snapshot = Object.values(repeated.snapshots).find(item => item.id === 'b');
    repeated.snapshots.same_source = copy(snapshot);
    assert.equal(restoreOpeningCharacterSources(legacy, repeated, taskId).角色.b._管理.来源档案id, sourceId);
    repeated.snapshots.same_source.pack.来源档案[sourceId].原始快照JSON = '{"different":true}';
    assert.throws(() => restoreOpeningCharacterSources(legacy, repeated, taskId), /多份不同的对应来源快照/);
  });
});
