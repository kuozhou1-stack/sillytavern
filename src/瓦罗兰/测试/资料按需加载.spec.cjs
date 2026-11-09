
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
harness._compile(harnessText + '\nmodule.exports = { environment, block, endpoint, structuredFixtureReply };', harnessFile);
const { environment, block, endpoint, structuredFixtureReply } = harness.exports;
const { Schema } = require(root + '/schema.ts');
const { SettingsSchema } = require(root + '/运行/settings.ts');
const { modelState } = require(root + '/运行/character-activity.ts');
const { validateModel } = require(root + '/运行/core.ts');
const {
  effectiveInformationIds, projectWorldInformation, prepareInformationCommand,
  informationSelectionPrompt, applyInformationSelection,
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
function selectorReply(places = ['cafe'], groups = []) {
  return '<InformationSelection>\n' + JSON.stringify({ 地点: places, 组织: groups }) + '\n</InformationSelection>';
}
async function withEnv(fn, initial = seed(), config = settings(), beforeStart) {
  const e = environment(initial, config);
  e.selected = [];
  e.payloads = [];
  e.select = async () => selectorReply();
  async function finalPayload(config) {
    const {promptContextText,variableRuleText}=require('../运行/prompt-context.ts');
    const state=config.overrides?.chat_history?.with_depth_entries===false?'':promptContextText(()=>e.state());
    const data={messages:[{role:'system',content:'模拟酒馆预设/世界书内容'},
      ...(state?[{role:'system',content:state}]:[]),
      ...e.rules.filter(r=>r.enabled).map(r=>({role:'system',content:variableRuleText(r.content)})).filter(r=>r.content),
      {role:'user',content:config.user_input||''},{role:'system',content:'原生预设尾部'}]};
    const nativeMessages=structuredClone(data.messages);
    await e.listeners.get('completion_settings')?.(data);
    assert.deepEqual(data.messages,nativeMessages,'所有通道保持原生装配结果');
    e.payloads.push({stage:e.runtime.view.phase,selection:e.runtime.view.phase==='information',messages:structuredClone(data.messages)});
    return data;
  }
  global.generate=async config=>{
    const data=await finalPayload(config);const final={...config,finalMessages:data.messages};
    if(e.runtime.view.phase==='information'){e.selected.push(structuredClone(final));return e.select(final);}
    e.calls.push({kind:e.runtime.view.phase==='story'?'story':'update',config:structuredClone(final)});
    return structuredFixtureReply(config,await (e.runtime.view.phase==='story'?e.story(final):e.update(final)));
  };
  global.generateRaw=async()=>{throw Error('必须携带预设');};
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

test("资料选择只看名称与本轮输入，最终hook移除酒馆宏和预设全量数据（原生输入）",()=>{
 const c=informationSelectionPrompt(seed(),'本轮输入');const before=structuredClone(c);
 const result=require('../运行/prompts.ts').nativePromptConfig(c);
 assert.deepEqual(c,before);assert.equal(result.injects,undefined);
 assert(result.user_input.includes('本轮输入'));assert(result.user_input.includes('InformationSelection'));
 assert.equal(result.overrides.chat_history.with_depth_entries,false);
});

test("正文最终状态与变量状态均裁剪，重复原始状态块不会残留全量资料（内容展开）",async()=>{
 const state=applyInformationSelection(seed(),selectorReply(['cafe'],['guild']),'turn');const before=structuredClone(state);
 const {withPromptContext,promptContextText}=require('../运行/prompt-context.ts');
 for(const purpose of ['story','variables'])await withPromptContext({purpose,state},async()=>{
  const body=promptContextText(()=>state);assert(body.includes('CAFÉ_DETAIL'));assert(body.includes('GUILD_DETAIL'));
  assert(!body.includes('HOME_DETAIL'));assert(!body.includes('LIBRARY_DETAIL'));
  assert.equal((body.match(/<status_current_variable>/g)||[]).length,1);
 });assert.deepEqual(state,before);
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

test('资料选择有独立任务和完整输出示例，玩家输入不进入格式说明', () => {
  const config = informationSelectionPrompt(seed(), '请继续讲述这段故事');
  const task = config.injects.map(item => item.content).join('\n');
  assert(task.includes('后台资料选择任务'));
  assert(task.includes('资料选择输出格式:'));
  assert(task.includes('format: |-'));
  assert(task.includes('<InformationSelection>'));
  assert(task.includes('"地点": ["目录中的地点ID"]'));
  assert(task.includes('"组织": ["目录中的组织ID"]'));
  assert(task.includes('{"地点": [], "组织": []}'));
  assert(task.includes('剧情续写、正文字数和思考区格式不改变本通道职责'));
  assert(task.includes('本次完整回复就是 format 所示的选择结果区块'));
  assert(!task.includes('携带酒馆预设时保留其补充指引'));
  assert(!task.includes('请继续讲述这段故事'));
  assert.equal(JSON.parse(config.user_input).本轮输入, '请继续讲述这段故事');
});

test('资料选择识别结果区块、代码围栏和预设外层，兼容旧纯JSON', () => {
  const json = JSON.stringify({ 地点: ['library'], 组织: ['guild'] });
  const tagged = '<InformationSelection>\n' + json + '\n</InformationSelection>';
  for (const reply of [
    json, '```json\n' + json + '\n```', tagged,
    '<InformationSelection>```json\n' + json + '\n```</InformationSelection>',
    '<response><answer>' + tagged + '</answer></response>',
    '<response>预设前言。<answer>' + tagged + '</answer></response>',
    '<response><answer>```json\n' + json + '\n```</answer></response>',
    '<thinking>预设将整个结果包在这里。' + tagged + '</thinking>',
  ]) {
    const selected = applyInformationSelection(seed(), reply, 'formatted-turn');
    assert.deepEqual(selected._系统.资料加载.地点, ['library'], reply);
    assert.deepEqual(selected._系统.资料加载.组织, ['guild'], reply);
    assert.equal(selected._系统.资料加载.选择依据, 'formatted-turn');
  }
});

test('资料选择读取思考区外的结果，不采用嵌套思考中的示例', () => {
  const actual = selectorReply(['library'], ['guild']);
  const example = selectorReply(['missing-example']);
  const reply = '<response><thinking><think>' + example + '</think></thinking>' +
    '<answer>' + actual + '</answer><reasoning>' + example + '</reasoning></response>';
  const selected = applyInformationSelection(seed(), reply, 'actual-turn');
  assert.deepEqual(selected._系统.资料加载.地点, ['library']);
  assert.deepEqual(selected._系统.资料加载.组织, ['guild']);
});

test('实际新回复中的思考区标签提及不吞掉正式结果，附带正文不进入选择状态', () => {
  const actual = selectorReply(['library'], ['guild']);
  const reply = '<thinking>\nThe requested format includes `<InformationSelection>`.\n' +
    '1. <thinking>\n2. <InformationSelection>\n3. Narrative text.\n</thinking>\n' +
    actual + '\n午后的阳光穿过图书馆。随后是错误附带的长篇正文。';
  const selected = applyInformationSelection(seed(), reply, 'actual-pasted-turn');
  assert.deepEqual(selected._系统.资料加载.地点, ['library']);
  assert.deepEqual(selected._系统.资料加载.组织, ['guild']);
  assert.equal(selected._系统.资料加载.选择依据, 'actual-pasted-turn');
  assert(!JSON.stringify(selected).includes('午后的阳光'));
});

test('资料选择空结果正常提交；正文、损坏JSON和无效ID仍报原错误且不改存档', () => {
  const before = applyInformationSelection(seed(), selectorReply(['cafe'], ['guild']), 'old-turn');
  const snapshot = structuredClone(before);
  const empty = applyInformationSelection(before, selectorReply([], []), 'empty-turn');
  assert.deepEqual(empty._系统.资料加载.地点, []);
  assert.deepEqual(empty._系统.资料加载.组织, []);
  assert.equal(empty._系统.资料加载.选择依据, 'empty-turn');
  for (const reply of ['你走进咖啡馆，故事继续。', '<InformationSelection>{bad}</InformationSelection>'])
    assert.throws(() => applyInformationSelection(before, reply, 'bad-turn'), /没有返回有效JSON/);
  assert.throws(() => applyInformationSelection(before, selectorReply(['missing']), 'bad-turn'), /不存在的地点ID/);
  assert.deepEqual(before, snapshot);
});

test('原始patch保留资料加载边界，已展开记录允许整项替换或删除', () => {
  const before = applyInformationSelection(seed(), selectorReply(['cafe'], ['guild']), 'turn');
  for (const command of [
    { op: 'replace', path: '/地点', value: {} },
    { op: 'remove', path: '/地点/home' },
    { op: 'replace', path: '/地点/home/简介', value: '猜测内容' },
    { op: 'move', from: '/地点/home', path: '/地点/renamed' },
  ]) assert.throws(() => assertInformationPatch(before, [command]));
  assert.doesNotThrow(() => assertInformationPatch(before, [{ op: 'replace', path: '/地点/cafe', value: { 名称: '替换后的咖啡馆' } }]));
  assert.doesNotThrow(() => assertInformationPatch(before, [{ op: 'remove', path: '/地点/cafe' }]));
  assert.doesNotThrow(() => assertInformationPatch(before, [{ op: 'replace', path: '/组织/guild', value: { 名称: '替换后的协会' } }]));
  assert.doesNotThrow(() => assertInformationPatch(before, [{ op: 'remove', path: '/组织/guild' }]));
  assert.doesNotThrow(() => assertInformationPatch(before, [{ op: 'replace', path: '/地点/cafe/简介', value: '可更新具体字段' }]));
  assert.doesNotThrow(() => assertInformationPatch(before, [{ op: 'add', path: '/地点/new', value: { 名称: '新店' } }]));
  const candidate = structuredClone(before);
  candidate.地点.cafe = Schema.parse({ 地点: { cafe: { 名称: '替换后的咖啡馆' } } }).地点.cafe;
  candidate.组织.guild = Schema.parse({ 组织: { guild: { 名称: '替换后的协会' } } }).组织.guild;
  assert.doesNotThrow(() => validateModel(before, candidate));
  delete candidate.地点.cafe;
  delete candidate.组织.guild;
  assert.doesNotThrow(() => validateModel(before, candidate));
  candidate.地点.cafe = structuredClone(before.地点.cafe);
  candidate.地点.home = { 名称: '测试居所' };
  assert.throws(() => validateModel(before, candidate), /未展开/);
  candidate.地点.home = structuredClone(before.地点.home);
  candidate.地点.cafe.简介 = '已完成正文中的明确变化';
  assert.doesNotThrow(() => assertInformationUnchanged(before, Schema.parse(candidate)));
});

test('正文变量结算可以整项替换地点和删除组织并保存', async () => {
  await withEnv(async e => {
    e.select = async () => selectorReply(['cafe'], ['guild']);
    e.story = async () => '咖啡馆已按新安排调整，原测试协会已注销。';
    e.update = async () => block([
      { op: 'replace', path: '/地点/cafe', value: { ...seed().地点.cafe, 简介: '整项替换后的资料' } },
      { op: 'remove', path: '/组织/guild' },
    ]);
    await e.runtime.send('按已发生的变动更新资料');
    assert.equal(e.state().地点.cafe.简介, '整项替换后的资料');
    assert.equal(Object.hasOwn(e.state().组织, 'guild'), false);
    assert.equal(e.runtime.view.error, '');
  });
});

test('实际host正文与后台均携带选择结果，原生位置保留且完整存档不裁剪', async () => {
  await withEnv(async e => {
    e.story = async () => '你在测试咖啡馆喝茶。';
    await e.runtime.send('去测试咖啡馆');
    assert.equal(e.selected.length, 1);
    assert.equal(e.calls.filter(call => call.kind === 'story').length, 1);
    const story = JSON.stringify(e.payloads.find(item => item.stage === 'story').messages);
    assert(story.includes('CAFÉ_DETAIL') && !story.includes('HOME_DETAIL') && !story.includes('GUILD_DETAIL'),'正文仅展开选中的资料');
    const payload = e.payloads.filter(item => item.stage === 'variables').map(item => JSON.stringify(item.messages)).join('\n');
    assert(payload.includes('CAFÉ_DETAIL'));
    assert(!payload.includes('HOME_DETAIL'));
    assert(!payload.includes('GUILD_DETAIL'));
    const selectorPayload = JSON.stringify(e.payloads.find(item => item.selection).messages);
    assert(selectorPayload.includes('模拟酒馆预设'));
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

test('正文明确提及新场所，结算前本地展开并保留此前选择，不重复调用选择API', async () => {
  await withEnv(async e => {
    e.select = async () => e.selected.length === 1 ? selectorReply() : selectorReply(['library']);
    e.story = async () => '随后到达测试图书馆，管理员确认今天延长开放。';
    e.update = async () => block([{ op: 'replace', path: '/地点/library/常规开放时间', value: '今日延长开放' }]);
    await e.runtime.send('先在测试咖啡馆休息');
    assert.equal(e.selected.length, 1);
    assert.deepEqual(e.state()._系统.资料加载.地点, ['cafe', 'library']);
    assert.equal(e.state().地点.library.常规开放时间, '今日延长开放');
    assert.equal(e.state().地点.home.简介, 'HOME_DETAIL');
  });
});

test('资料全部手动展开或仅名称时不调用选择API，自动项仍保留模型选择', async () => {
  await withEnv(async e => {
    for (const kind of ['地点', '组织'])
      for (const id of Object.keys(e.messages[0].data.stat_data[kind]))
        e.messages[0].data.stat_data._系统.资料加载[kind + '覆盖'][id] = id === 'home' ? '仅名称' : '展开';
    e.select = async () => { throw Error('手动覆盖不应请求模型'); };
    e.story = async () => '你在测试咖啡馆休息，随后提起测试居所。';
    await e.runtime.send('喝茶');
    await e.runtime.send('继续喝茶');
    assert.equal(e.selected.length, 0);
    assert(!effectiveInformationIds(e.state(), '地点').has('home'));
    assert.equal(e.state().地点.home.简介, 'HOME_DETAIL');
    delete e.messages.at(-1).data.stat_data._系统.资料加载.地点覆盖.library;
    e.select = async () => selectorReply(['library']);
    await e.runtime.send('接下来去哪里？');
    assert.equal(e.selected.length, 1);
  });
});

test('本地展开明确引用同时保留组织、手动仅名称和变量失败重试的原提交身份', async () => {
  const initial = prepareInformationCommand(seed(), '地点', 'home', '仅名称');
  await withEnv(async e => {
    e.story = async () => '随后前往测试图书馆，联系测试协会，并谈起测试居所。';
    const calls = [];
    e.update = async config => {
      calls.push(config);
      const sent = JSON.stringify(e.payloads.at(-1).messages);
      assert(sent.includes('LIBRARY_DETAIL'));
      assert(sent.includes('GUILD_DETAIL'));
      assert(!sent.includes('HOME_DETAIL'));
      if (calls.length === 1) throw Error('合成变量失败');
      return block([{ op: 'replace', path: '/地点/library/常规开放时间', value: '延长开放' }]);
    };
    await assert.rejects(e.runtime.send('先喝茶'), /合成变量失败/);
    const originalId = e.vars.澄湾待更新正文.id;
    assert.equal(e.messages[2].extra.cw_story_request.id, originalId);
    await e.runtime.retry();
    assert.equal(e.selected.length, 1);
    assert.equal(e.calls.filter(call => call.kind === 'story').length, 1);
    assert.equal(e.messages.length, 3);
    assert(e.state()._系统.提交记录[originalId]);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
    assert.equal(e.vars.澄湾待更新正文, null);
    assert.equal(e.state().地点.home.简介, 'HOME_DETAIL');
    assert(!effectiveInformationIds(e.state(), '地点').has('home'));
  }, initial);
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
    assert(!JSON.stringify(story.messages).includes('CAFÉ_DETAIL'),'正文内容展开遵循仅名称覆盖，消息位置不变');
    const worker = e.payloads.find(item => item.stage === 'variables');
    assert(!JSON.stringify(worker.messages).includes('CAFÉ_DETAIL'),'后台仍遵循仅名称覆盖');
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
      assert.equal(text.includes('CAFÉ_DETAIL'),false);
      assert.equal(text.includes('LIBRARY_DETAIL'),false);
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
      assert.equal(JSON.stringify(payload.messages).includes('HOME_DETAIL'),false,'正文保留原文；后台只接收授权资料');
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

