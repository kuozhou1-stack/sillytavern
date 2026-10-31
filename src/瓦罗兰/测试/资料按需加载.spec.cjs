
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
// Reuse the isolated Tavern/MVU harness, without registering its unrelated test suite.
const harnessFile = path.join(__dirname, '双API流程.spec.cjs');
const harnessText = fs.readFileSync(harnessFile, 'utf8').split('const novelGoodReply =')[0];
const harness = new Module(harnessFile, module);
harness.filename = harnessFile;
harness.paths = Module._nodeModulePaths(__dirname);
harness._compile(harnessText + '\nmodule.exports = { environment, block, endpoint };', harnessFile);
const { environment, block, endpoint } = harness.exports;
const { Schema } = require(root + '/schema.ts');
const { SettingsSchema } = require(root + '/运行/settings.ts');
const { modelState, finalizeCharacterContext } = require(root + '/运行/character-activity.ts');
const { validateModel } = require(root + '/运行/core.ts');
const {
  effectiveInformationIds, projectWorldInformation, prepareInformationCommand,
  informationSelectionPrompt, finalizeInformationPrompt, applyInformationSelection,
  assertInformationPatch, assertInformationUnchanged, needsInformationSelection,
} = require(root + '/运行/knowledge-context.ts');
const version = require(root + '/运行/world-information.json').版本;
function seed() {
  return Schema.parse({
    _系统: { 建档完成: true, 资料加载: { 资料版本: version } },
    玩家: { id: 'player', 姓名: '测试玩家', 当前状态: { 当前地点id: 'cafe' }, 生活: { 住处id: 'home' } },
    地点: {
      cafe: { 名称: '测试咖啡馆', 类型: '咖啡馆', 简介: 'CAFÉ_DETAIL', 进入条件: '允许访客', 地图位置: { x: 200, y: 300, 精度: '地点' } },
      home: { 名称: '测试居所', 简介: 'HOME_DETAIL', 进入条件: 'PRIVATE_ACCESS', 地图位置: { x: 100, y: 200, 精度: '地点' } },
      library: { 名称: '测试图书馆', 简介: 'LIBRARY_DETAIL' },
    },
    组织: { guild: { 名称: '测试协会', 类型: '文化组织', 简介: 'GUILD_DETAIL', 规则: 'GUILD_RULE' } },
  });
}
const settings = () => ({ informationAuto: true, characterAuto: false, variable: endpoint('variable'), phone: endpoint('phone') });
function selectorReply(places = ['cafe'], groups = []) { return JSON.stringify({ 地点: places, 组织: groups }); }
async function withEnv(fn, initial = seed(), config = settings(), beforeStart) {
  const e = environment(initial, config);
  e.selected = [];
  e.payloads = [];
  e.select = async () => selectorReply();
  function finalPayload(config) {
    const data = { messages: [
      { role: 'system', content: '<status_current_variable>' + JSON.stringify(e.state()) + '</status_current_variable>' },
      { role: 'system', content: '模拟酒馆预设/世界书内容' },
      ...[...(config.injects || []), ...(config.ordered_prompts || []), ...(config.overrides?.chat_history?.prompts || [])]
        .filter(value => typeof value === 'object').map(value => ({ role: value.role, content: value.content })),
      { role: 'user', content: config.user_input || '' },
    ] };
    e.listeners.get('completion_settings')?.(data);
    e.payloads.push({ selection: config.user_input?.includes('[chengwan-knowledge:'), messages: structuredClone(data.messages) });
    return data;
  }
  global.generate = async config => {
    finalPayload(config);
    e.calls.push({ kind: config.custom_api ? 'preset-update' : 'story', config: structuredClone(config) });
    return config.custom_api ? e.update(config) : e.story(config);
  };
  global.generateRaw = async config => {
    finalPayload(config);
    if (config.user_input?.includes('[chengwan-knowledge:')) {
      e.selected.push(structuredClone(config));
      return e.select(config);
    }
    e.calls.push({ kind: 'update', config: structuredClone(config) });
    return e.update(config);
  };
  beforeStart?.(e);
  await e.runtime.start();
  try { await fn(e); } finally { await e.runtime.dispose(); }
}

test('旧存档默认名称目录，手动覆盖与每个候选选择独立，投影不改完整资料或知情', () => {
  const original = seed(), snapshot = structuredClone(original);
  assert.equal(SettingsSchema.parse({}).informationAuto, true);
  assert.deepEqual(Schema.parse(original), original);
  assert.deepEqual(projectWorldInformation(original).地点.home, { 名称: '测试居所' });
  let selected = applyInformationSelection(original, selectorReply(['cafe'], ['guild']), 'turn-a');
  selected = prepareInformationCommand(selected, '地点', 'cafe', '仅名称');
  selected = prepareInformationCommand(selected, '地点', 'home', '展开');
  assert.deepEqual([...effectiveInformationIds(selected, '地点')], ['home']);
  assert.equal(projectWorldInformation(selected).地点.home.简介, 'HOME_DETAIL');
  assert.deepEqual(projectWorldInformation(selected).地点.cafe, { 名称: '测试咖啡馆' });
  assert.equal(projectWorldInformation(selected).组织.guild.规则, 'GUILD_RULE');
  assert.deepEqual(original, snapshot);
  assert.deepEqual(selected.玩家.已知信息, original.玩家.已知信息);
  const restored = Schema.parse(snapshot);
  assert.equal(effectiveInformationIds(restored, '地点').size, 0);
  assert.equal(prepareInformationCommand(selected, '地点', 'cafe', '自动')._系统.资料加载.地点覆盖.cafe, undefined);
  assert.throws(() => prepareInformationCommand(selected, '地点', 'missing', '展开'), /不存在/);
});

test('资料选择只看名称与本轮输入，最终hook移除酒馆宏和预设全量数据', () => {
  const state = seed();
  const config = informationSelectionPrompt(state, '去测试咖啡馆', [
    { role: 'assistant', text: '<status_current_variable>HIDDEN_RAW</status_current_variable>刚才在街口。<thinking>HIDDEN_THINK</thinking>' },
  ]);
  const text = JSON.stringify(config);
  for (const secret of ['CAFÉ_DETAIL', 'HOME_DETAIL', 'PRIVATE_ACCESS', 'GUILD_DETAIL', 'GUILD_RULE', 'HIDDEN_RAW', 'HIDDEN_THINK'])
    assert(!text.includes(secret), secret);
  const marker = '[information-test]';
  config.user_input += marker;
  const messages = [{ role: 'system', content: JSON.stringify(state) }, { role: 'user', content: marker }];
  assert.equal(finalizeInformationPrompt(messages, marker, config), true);
  assert.equal(messages.length, 2);
  assert(!JSON.stringify(messages).includes('HOME_DETAIL'));
  assert(!JSON.stringify(messages).includes(marker));
  assert(messages[0].content.includes('测试居所'));
  assert.equal(messages.at(-1).role, 'system');
});

test('正文最终状态与变量状态均裁剪，重复原始状态块不会残留全量资料', () => {
  const state = applyInformationSelection(seed(), selectorReply(['cafe'], ['guild']), 'turn');
  const worker = modelState(state);
  assert.deepEqual(worker.地点.home, { 名称: '测试居所' });
  assert.equal(worker.地点.cafe.简介, 'CAFÉ_DETAIL');
  const messages = [
    { role: 'system', content: '<status_current_variable>' + JSON.stringify(state) + '</status_current_variable>' },
    { role: 'system', content: '<status_current_variable>' + JSON.stringify(state) + '</status_current_variable>' },
  ];
  finalizeCharacterContext(messages, state, false);
  const final = JSON.stringify(messages);
  assert(final.includes('CAFÉ_DETAIL'));
  assert(!final.includes('HOME_DETAIL'));
  assert.equal(final.match(/<status_current_variable>/g).length, 1);
  finalizeCharacterContext(messages, state, true);
  assert(!JSON.stringify(messages).includes('<status_current_variable>'));
});

test('选择输出严格校验，错误结果不能改原选择；后续展开保留本轮内容', () => {
  const before = applyInformationSelection(seed(), selectorReply(['cafe']), 'one');
  const unchanged = structuredClone(before);
  for (const reply of ['bad', '{"地点":["missing"],"组织":[]}', '{"地点":[],"组织":[],"世界":{}}', '{"地点":[]}'])
    assert.throws(() => applyInformationSelection(before, reply, 'two'));
  assert.deepEqual(before, unchanged);
  const added = applyInformationSelection(before, selectorReply(['library'], ['guild']), 'two', true);
  assert.deepEqual(added._系统.资料加载.地点, ['cafe', 'library']);
  assert.equal(needsInformationSelection(before, '进入测试图书馆'), true);
  assert.equal(needsInformationSelection(prepareInformationCommand(before, '地点', 'library', '仅名称'), '进入测试图书馆'), false);
});

test('原始patch禁止整表与已有记录覆盖，隐藏资料不能经Schema默认值被洗掉', () => {
  const before = applyInformationSelection(seed(), selectorReply(['cafe']), 'turn');
  for (const command of [
    { op: 'replace', path: '/地点', value: {} },
    { op: 'replace', path: '/地点/cafe', value: { 名称: '只有名称' } },
    { op: 'remove', path: '/地点/home' },
    { op: 'replace', path: '/地点/home/简介', value: '猜测内容' },
    { op: 'move', from: '/地点/home', path: '/地点/renamed' },
  ]) assert.throws(() => assertInformationPatch(before, [command]));
  assert.doesNotThrow(() => assertInformationPatch(before, [{ op: 'replace', path: '/地点/cafe/简介', value: '可更新具体字段' }]));
  assert.doesNotThrow(() => assertInformationPatch(before, [{ op: 'add', path: '/地点/new', value: { 名称: '新店' } }]));
  const candidate = structuredClone(before);
  delete candidate.地点.home;
  assert.throws(() => validateModel(before, candidate), /不能删除已有资料/);
  candidate.地点.home = { 名称: '测试居所' };
  assert.throws(() => validateModel(before, candidate), /未展开/);
  candidate.地点.home = structuredClone(before.地点.home);
  candidate.地点.cafe.简介 = '已完成正文中的明确变化';
  assert.doesNotThrow(() => assertInformationUnchanged(before, Schema.parse(candidate)));
});

test('实际host正文前完成选择，正文和结算仅拿选中细节，保存仍保留全部资料', async () => {
  await withEnv(async e => {
    e.story = async () => '你在测试咖啡馆喝茶。';
    await e.runtime.send('去测试咖啡馆');
    assert.equal(e.selected.length, 1);
    assert.equal(e.calls.filter(call => call.kind === 'story').length, 1);
    const payload = e.payloads.filter(item => !item.selection).map(item => JSON.stringify(item.messages)).join('\n');
    assert(payload.includes('CAFÉ_DETAIL'));
    assert(!payload.includes('HOME_DETAIL'));
    assert(!payload.includes('GUILD_DETAIL'));
    const selectorPayload = JSON.stringify(e.payloads.find(item => item.selection).messages);
    assert(!selectorPayload.includes('模拟酒馆预设'));
    assert(!selectorPayload.includes('CAFÉ_DETAIL'));
    assert.equal(e.state().地点.home.简介, 'HOME_DETAIL');
    assert.deepEqual(e.state().玩家.已知信息.已知地点, {});
  });
});

test('选择失败保留玩家输入并阻止正文，重试成功后正文失败再试不重复选择', async () => {
  await withEnv(async e => {
    e.select = async () => 'NOT_JSON';
    await assert.rejects(e.runtime.send('喝茶'));
    assert.equal(e.calls.length, 0);
    assert.equal(e.messages.filter(m => m.role === 'user').length, 1);
    e.select = async () => selectorReply();
    e.story = async () => { throw Error('模拟正文失败'); };
    await assert.rejects(e.runtime.retry(), /模拟正文失败/);
    assert.equal(e.selected.length, 2);
    e.story = async () => '测试咖啡馆的茶已经端上。';
    await e.runtime.retry();
    assert.equal(e.selected.length, 2);
    assert.equal(e.messages.filter(m => m.role === 'user').length, 1);
  });
});

test('正文新增涉及未展开场所，结算前补选并保留此前选择', async () => {
  await withEnv(async e => {
    e.select = async () => e.selected.length === 1 ? selectorReply() : selectorReply(['library']);
    e.story = async () => '随后到达测试图书馆，管理员确认今天延长开放。';
    e.update = async () => block([{ op: 'replace', path: '/地点/library/常规开放时间', value: '今日延长开放' }]);
    await e.runtime.send('先在测试咖啡馆休息');
    assert.equal(e.selected.length, 2);
    assert.deepEqual(e.state()._系统.资料加载.地点, ['cafe', 'library']);
    assert.equal(e.state().地点.library.常规开放时间, '今日延长开放');
    assert.equal(e.state().地点.home.简介, 'HOME_DETAIL');
  });
});

test('手机与正文共用资料选择，手动模式没有选择API且保留资料覆盖', async () => {
  const initial = seed();
  initial.手机 = Schema.parse({ 手机: {
    账号: { me: { 人物id: 'player' }, other: { 人物id: 'npc' } },
    联系人: { a: { 本人账号id: 'me', 对方账号id: 'other' }, b: { 本人账号id: 'other', 对方账号id: 'me' } },
    会话: { chat: { 类型: '私聊', 参与账号id: ['me', 'other'] } },
  } }).手机;
  await withEnv(async e => {
    await e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '去测试咖啡馆吗？' });
    assert.equal(e.selected.length, 1);
    assert.equal(e.state().地点.home.简介, 'HOME_DETAIL');
  }, initial);
  await withEnv(async e => {
    await e.runtime.manageInformation('地点', 'home', '展开');
    await e.runtime.manageInformation('地点', 'cafe', '仅名称');
    e.story = async () => '你在家中休息。';
    await e.runtime.send('休息');
    assert.equal(e.selected.length, 0);
    const story = e.payloads.find(item => !item.selection);
    assert(JSON.stringify(story.messages).includes('HOME_DETAIL'));
    assert(!JSON.stringify(story.messages).includes('CAFÉ_DETAIL'));
    assert.equal(e.state()._系统.资料加载.地点覆盖.home, '展开');
  }, seed(), { ...settings(), informationAuto: false });
});


test('玩家自设地址允许仅补地图位置；隐藏非地图字段、未知地址和越界结果仍受保护', () => {
  const state = seed();
  const district = require(root + '/运行/world-geography.json').districts.find(row => row.id === 'riverside');
  state.地点.home.片区id = district.id;
  state.地点.home.地图位置 = { x: null, y: null, 精度: '未知' };
  state.玩家.已知信息.已知地点.home = {};
  state._系统.资料加载.地点覆盖.home = '仅名称';
  const point = { x: district.map.bounds.x + district.map.bounds.w * 0.4, y: district.map.bounds.y + district.map.bounds.h * 0.4, 精度: '地点' };
  assert.doesNotThrow(() => assertInformationPatch(state, [{ op: 'replace', path: '/地点/home/地图位置', value: point }]));
  const after = structuredClone(state);
  after.地点.home.地图位置 = point;
  assert.doesNotThrow(() => validateModel(state, after));
  const outside = structuredClone(after);
  outside.地点.home.地图位置.x = -100;
  assert.throws(() => validateModel(state, outside), /完整有效坐标/);
  const opened = prepareInformationCommand(state, '地点', 'home', '展开');
  const openedOutside = structuredClone(opened);
  openedOutside.地点.home.地图位置 = { ...point, y: -100 };
  assert.throws(() => validateModel(opened, openedOutside), /完整有效坐标/);
  const partial = structuredClone(opened);
  partial.地点.home.地图位置.x = point.x;
  assert.throws(() => validateModel(opened, partial), /完整有效坐标/);
  after.地点.home.简介 = '偷偷改其他细节';
  assert.throws(() => validateModel(state, after), /未展开/);
  assert.throws(() => assertInformationPatch(state, [{ op: 'replace', path: '/地点/home/简介', value: '额外更新' }]), /先展开/);
  const unknown = structuredClone(state);
  delete unknown.玩家.已知信息.已知地点.home;
  assert.throws(() => assertInformationPatch(unknown, [{ op: 'replace', path: '/地点/home/地图位置', value: point }]), /先展开/);
  assert.deepEqual(projectWorldInformation(state).地点.home, { 名称: '测试居所' });
});

test('普通worker在关自动且仅名称模式仍能完成已授权的自设地址补点', async () => {
  const state = seed();
  const district = require(root + '/运行/world-geography.json').districts.find(row => row.id === 'riverside');
  state.地点.home.片区id = district.id;
  state.地点.home.地图位置 = { x: null, y: null, 精度: '未知' };
  state.玩家.已知信息.已知地点.home = {};
  state._系统.资料加载.地点覆盖.home = '仅名称';
  const point = { x: district.map.bounds.x + district.map.bounds.w * 0.3, y: district.map.bounds.y + district.map.bounds.h * 0.3, 精度: '地点' };
  await withEnv(async e => {
    e.story = async () => '你在自己的住处休息。';
    e.update = async () => block([{ op: 'replace', path: '/地点/home/地图位置', value: point }]);
    await e.runtime.send('在家休息');
    assert.equal(e.selected.length, 0);
    assert.deepEqual(e.state().地点.home.地图位置, point);
    assert.equal(e.state().地点.home.简介, 'HOME_DETAIL');
    assert.equal(e.state()._系统.资料加载.地点覆盖.home, '仅名称');
  }, state, { ...settings(), informationAuto: false });
});

test('选择时源消息被编辑后不发送正文，不将旧输入保留成可重试请求', async () => {
  await withEnv(async e => {
    e.select = async () => {
      e.messages.find(message => message.role === 'user').message = '已编辑的新输入';
      return selectorReply();
    };
    await assert.rejects(e.runtime.send('旧输入'), /源消息已变化/);
    assert.equal(e.calls.length, 0);
    assert.equal(e.vars.澄湾失败请求, null);
    assert.equal(e.state()._系统.资料加载.选择依据, null);
  });
});

test('结算暴露关联资料时自动补齐原记录，只重新结算并丢弃首次猜测的整份补丁', async () => {
  await withEnv(async e => {
    e.story = async () => '你回到自己的住处，重新整理了客厅。';
    const updates = [];
    e.update = async () => {
      updates.push(JSON.stringify(e.payloads.at(-1).messages));
      return block(updates.length === 1 ? [
        { op: 'replace', path: '/地点/home/简介', value: '尚未读取原资料的猜测' },
        { op: 'replace', path: '/地点/cafe/简介', value: '不应保存的首轮附带修改' },
      ] : [{ op: 'replace', path: '/地点/home/简介', value: '整理过客厅的住处' }]);
    };
    await e.runtime.send('先喝茶，随后回家整理');
    assert.equal(e.selected.length, 1);
    assert.equal(updates.length, 2);
    assert(!updates[0].includes('HOME_DETAIL'));
    assert(updates[1].includes('HOME_DETAIL'));
    assert(updates[1].includes('PRIVATE_ACCESS'));
    assert(!updates[1].includes('LIBRARY_DETAIL'));
    assert.equal(e.calls.filter(call => call.kind === 'story').length, 1);
    assert.equal(e.messages.filter(message => message.role === 'user').length, 1);
    assert.equal(e.messages.filter(message => message.role === 'assistant').length, 2);
    assert.equal(e.state().地点.home.简介, '整理过客厅的住处');
    assert.equal(e.state().地点.home.进入条件, 'PRIVATE_ACCESS');
    assert.equal(e.state().地点.cafe.简介, 'CAFÉ_DETAIL');
    assert.deepEqual(e.state()._系统.资料加载.地点, ['cafe', 'home']);
  });
});

test('选择器漏选当前自建住处时，正文和首次结算均获得完整资料', async () => {
  const state = seed();
  const id = 'residence_d424dbd1-f9a1-4382-90ee-75f4d0273d4e';
  state.地点[id] = state.地点.home;
  delete state.地点.home;
  state.玩家.当前状态.当前地点id = id;
  state.玩家.生活.住处id = id;
  await withEnv(async e => {
    e.select = async () => selectorReply([], []);
    e.story = async () => '你重新整理了客厅。';
    e.update = async () => block([{ op: 'replace', path: '/地点/' + id + '/简介', value: '整理过客厅的住处' }]);
    await e.runtime.send('继续整理');
    assert.equal(e.selected.length, 1);
    assert.equal(e.calls.filter(call => call.kind === 'update').length, 1);
    for (const payload of e.payloads.filter(item => !item.selection)) {
      const text = JSON.stringify(payload.messages);
      assert(text.includes('HOME_DETAIL'), text);
      assert(!text.includes('CAFÉ_DETAIL'));
      assert(!text.includes('LIBRARY_DETAIL'));
    }
    assert.equal(e.state().地点[id].简介, '整理过客厅的住处');
    assert.equal(e.state().地点[id].进入条件, 'PRIVATE_ACCESS');
    assert.deepEqual(e.state()._系统.资料加载.地点, [id]);
  }, state);
});

test('补齐后仍修改其他隐藏资料时停止自动重试，失败的两份补丁均不部分保存', async () => {
  await withEnv(async e => {
    e.story = async () => '你先整理住处，随后出门办事。';
    let updates = 0;
    e.update = async () => block(++updates === 1 ? [
      { op: 'replace', path: '/地点/home/简介', value: '未读资料的首轮猜测' },
    ] : [
      { op: 'replace', path: '/地点/home/简介', value: '二次请求的局部修改' },
      { op: 'replace', path: '/地点/library/简介', value: '未读另一份资料的猜测' },
    ]);
    await assert.rejects(e.runtime.send('喝完茶去办事'), /先展开资料.*地点\/library/);
    assert.equal(updates, 2);
    assert.equal(e.state().地点.home.简介, 'HOME_DETAIL');
    assert.equal(e.state().地点.library.简介, 'LIBRARY_DETAIL');
    assert.equal(e.calls.filter(call => call.kind === 'story').length, 1);
    assert.equal(e.messages.at(-1).message, '你先整理住处，随后出门办事。');
    assert.equal(e.runtime.view.messages.at(-1).variableUpdate.state, 'failed');
  });
});

test('手动仅名称覆盖仍禁止当前住处和精确提及资料自动展开或自动重试', async () => {
  const state = seed();
  state.玩家.当前状态.当前地点id = 'home';
  state._系统.资料加载.地点覆盖.home = '仅名称';
  await withEnv(async e => {
    e.select = async () => selectorReply(['home']);
    e.story = async () => '你在测试居所重新整理了客厅。';
    e.update = async () => block([{ op: 'replace', path: '/地点/home/简介', value: '不应保存的猜测' }]);
    await assert.rejects(e.runtime.send('整理测试居所'), /先展开资料.*地点\/home/);
    assert.equal(e.calls.filter(call => call.kind === 'update').length, 1);
    assert.equal(e.state().地点.home.简介, 'HOME_DETAIL');
    for (const payload of e.payloads.filter(item => !item.selection))
      assert(!JSON.stringify(payload.messages).includes('HOME_DETAIL'));
    assert.equal(e.state()._系统.资料加载.地点覆盖.home, '仅名称');
  }, state);
});

test('手机自动补齐资料后重新结算，只发送一次玩家消息并保留原记录', async () => {
  const state = seed();
  state.手机 = Schema.parse({ 手机: {
    账号: { me: { 人物id: 'player' }, other: { 人物id: 'npc' } },
    联系人: { a: { 本人账号id: 'me', 对方账号id: 'other' }, b: { 本人账号id: 'other', 对方账号id: 'me' } },
    会话: { chat: { 类型: '私聊', 参与账号id: ['me', 'other'] } },
  } }).手机;
  await withEnv(async e => {
    const updates = [];
    e.update = async () => {
      updates.push(JSON.stringify(e.payloads.at(-1).messages));
      return block([{ op: 'replace', path: '/地点/home/简介', value: updates.length === 1 ? '未读资料的猜测' : '朋友送来了新家具' }]);
    };
    await e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '家具已经收到，谢谢' });
    assert.equal(e.selected.length, 1);
    assert.equal(updates.length, 2);
    assert(!updates[0].includes('HOME_DETAIL'));
    assert(updates[1].includes('HOME_DETAIL'));
    const sent = Object.values(e.state().手机.原文.消息).filter(message => message.发送账号id === 'me');
    assert.equal(sent.length, 1);
    assert(JSON.stringify(sent[0]).includes('家具已经收到，谢谢'));
    assert.equal(e.state().地点.home.简介, '朋友送来了新家具');
    assert.equal(e.state().地点.home.进入条件, 'PRIVATE_ACCESS');
    assert.equal(e.state().地点.library.简介, 'LIBRARY_DETAIL');
    assert.equal(e.vars.澄湾待更新手机, null);
  }, state);
});


test('旧存档先只呈现补齐资料，首个正式请求前持久合并一次且保持自定义字段', async () => {
  const old = seed();
  delete old._系统.资料加载;
  old.组织.guild.规则 = '用户自己的组织规则';
  const before = structuredClone(old);
  await withEnv(async e => {
    assert.equal(e.messages[0].data.stat_data._系统.资料加载, undefined);
    assert.equal(e.state()._系统.资料加载.资料版本, version);
    assert.equal(e.state().组织.guild.规则, '用户自己的组织规则');
    e.story = async () => '你在测试咖啡馆休息。';
    await e.runtime.send('喝茶');
    assert.equal(e.messages[0].data.stat_data._系统.资料加载.资料版本, version);
    assert.equal(e.state().组织.guild.规则, '用户自己的组织规则');
    assert.equal(Object.keys(e.state().组织).length, 13);
    assert.deepEqual(e.state().玩家.已知信息, before.玩家.已知信息);
    assert.equal(e.state().地点.home.简介, 'HOME_DETAIL');
    assert.equal(e.selected.length, 1);
  }, seed(), settings(), e => { e.messages[0].data = { stat_data: structuredClone(old) }; });
});

