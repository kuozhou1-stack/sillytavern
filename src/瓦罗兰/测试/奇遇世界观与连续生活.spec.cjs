const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const assert = require('node:assert/strict'), { test } = require('node:test');
const file = path.join(__dirname, '双API流程.spec.cjs'), h = new Module(file, module);
h.filename = file; h.paths = Module._nodeModulePaths(__dirname);
const originalRequire = h.require.bind(h);
h.require = name => name === 'node:test' ? { test() {} } : originalRequire(name);
h._compile(fs.readFileSync(file, 'utf8').split('const novelGoodReply =')[0] + '\nmodule.exports={withEnv,seed,Schema};', file);
const { withEnv, seed, Schema } = h.exports;
const { novelCreationContext, novelPublicSetting } = require('../运行/novel-context.ts');
const { novelRefreshPrompt, finalizeNovelRefreshPrompt } = require('../运行/novel-refresh.ts');
const { withUpdateTasks } = require('../运行/update-tasks.ts');
const { copy } = require('../运行/core.ts');
const geography = require('../运行/world-geography.json');

function contextState(district = 'piltover_zaun', invasion = 40) {
  const state = seed(); state.奇遇系统._启用 = true; state.世界.异常入侵度 = invasion;
  state.地点.isolated_current = Schema.parse({ 地点: { p: { 名称: 'PRIVATE_ADDRESS_NAME', 简介: 'PRIVATE_LOCATION_DETAILS', 片区id: district } } }).地点.p;
  state.玩家.当前状态.当前地点id = 'isolated_current'; state.玩家.姓名 = 'PRIVATE_PLAYER_NAME';
  return state;
}
test('奇遇创作只取当前地区ID和局势标量，地区目录取维护地理数据', () => {
  const state = contextState(), context = novelCreationContext(state), before = copy(state);
  assert.deepEqual(Object.keys(context).sort(), ['当前地区id','异常入侵度','地区目录'].sort());
  assert.equal(context.当前地区id, 'piltover_zaun'); assert.equal(context.异常入侵度, 40);
  assert.equal(context.地区目录.length, geography.districts.length);
  assert(context.地区目录.some(x => x.id === 'bandle_city' && x.地理层级 === '口袋维度'));
  assert(context.地区目录.every(x => Object.keys(x).join(',') === 'id,名称,地理层级,功能'));
  for (const marker of ['PRIVATE_ADDRESS_NAME','PRIVATE_LOCATION_DETAILS','PRIVATE_PLAYER_NAME']) assert(!JSON.stringify(context).includes(marker));
  assert.deepEqual(state, before);
});
test('未知地区或局势保持未知，跨区域切换只改变当前地区参考', () => {
  const state = contextState('not_in_public_directory', null);
  assert.equal(novelCreationContext(state).当前地区id, null); assert.equal(novelCreationContext(state).异常入侵度, null);
  state.地点.isolated_current.片区id = 'university'; assert.equal(novelCreationContext(state).当前地区id, 'university');
  state.地点.isolated_current.片区id = 'bandle_city'; state.世界.异常入侵度 = 95;
  const result = novelCreationContext(state); assert.equal(result.当前地区id, 'bandle_city'); assert.equal(result.异常入侵度, 95);
});
test('增加171份角色资料、手机历史、私人地点不会增加奇遇请求资料', () => {
  const small = contextState(), large = copy(small);
  for (let i = 0; i < 171; i++) {
    large.角色['secret_person_' + i] = { ...copy(small.角色.npc), 姓名: 'PRIVATE_NPC_' + i, 简介: 'PRIVATE_NPC_PROFILE'.repeat(500) };
    large.手机.摘要['secret_summary_' + i] = { 内容: 'PRIVATE_PHONE_ARCHIVE'.repeat(500) };
    large.地点['secret_home_' + i] = { ...copy(small.地点.isolated_current), 名称: 'PRIVATE_HOME_' + i, 简介: 'PRIVATE_HOME_DETAILS'.repeat(500) };
  }
  assert.deepEqual(novelCreationContext(large), novelCreationContext(small));
  const a = novelRefreshPrompt(small,'initial'), b = novelRefreshPrompt(large,'initial');
  const userA=JSON.parse(a.user_input),userB=JSON.parse(b.user_input);delete userA.创作种子;delete userB.创作种子;
  assert.deepEqual(userA,userB); assert.deepEqual(a.injects,b.injects);
  for(const marker of ['PRIVATE_NPC_','PRIVATE_PHONE_ARCHIVE','PRIVATE_HOME_'])assert(!JSON.stringify(b).includes(marker));
});
for (const target of ['initial','tasks','shop']) test(`奇遇${target}：世界观与区域/局势提示进入末尾system，输出字段及格式保持`, () => {
  const config = novelRefreshPrompt(contextState(), target), text = config.injects[0].content;
  assert.equal(config.injects.length,1);assert.equal(config.injects[0].role,'system');
  assert(text.includes(novelPublicSetting)); assert(text.includes('先按当前地区的功能与文明特征选择主题'));
  assert(text.includes('异常入侵度0–9为潜伏')); assert(text.includes('未知不默认平静或灾变'));
  assert(text.includes('任务可提供待发现的线索')); assert(!text.includes('没有提供玩家存档'));
  assert(text.endsWith('}。')); assert(!text.includes('稀有最多'));
  const marker='[isolated-novel-source]';
  const messages=[{role:'system',content:'PRIVATE_FULL_STATE'},{role:'user',content:marker}];
  assert(finalizeNovelRefreshPrompt(messages,marker,config)); assert.equal(messages.length,2); assert.equal(messages.at(-1).role,'system');
  assert.deepEqual(JSON.parse(messages[0].content).创作参考,novelCreationContext(contextState()));
  assert(!JSON.stringify(messages).includes('PRIVATE_FULL_STATE'));
});
test('实际Runtime刷新仍只发一次手机通道请求，保存重试复用原提交和内容', async () => {
  await withEnv(async e => {
    e.update = async config => {
      const messages=config.finalMessages,data=JSON.parse(messages.find(m=>m.role==='user').content);
      assert.equal(data.创作参考.当前地区id,'piltover_zaun');assert.equal(data.创作参考.异常入侵度,40);
      assert(!JSON.stringify(messages).includes('PRIVATE_PLAYER_NAME'));
      return JSON.stringify({任务:[{名称:'双城工艺委托',类型:'探索',难度:'稀有',目标:'选择一次公开工艺交流并记录发现'}]});
    };
    let failed=false;global.SillyTavern.saveChat=async()=>{if(!failed){failed=true;throw Error('保存未确认');}};
    await assert.rejects(e.runtime.novelRefresh('tasks'),/保存未确认/);
    const id=e.vars.澄湾待确认提交.commitId;
    await e.runtime.resumeQueued(e.runtime.view.recoverable[0].id);
    assert.equal(e.calls.length,1);assert.equal(e.parses,0);assert.equal(e.messages.length,1);
    assert(e.state()._系统.提交记录[id]);assert.equal(e.vars.澄湾待确认提交,null);
    assert.equal(Object.keys(e.state().奇遇系统.任务).length,1);
  },contextState());
});
test('生活待办引用连续事件规则，字段与原记录身份沿现有结构更新', () => {
  const state=contextState();state._系统.任务.auto=Schema.parse({_系统:{任务:{auto:{类别:'生活更新',状态:'排队',触发来源:'自动角色调度：当前生活检查',目标id:['npc'],目标版本:{npc:state.角色.npc._管理.版本}}}}})._系统.任务.auto;
  const before=copy(state),text=withUpdateTasks({},state,['auto']).injects[0].content;
  assert(text.includes('沿现有个人目标和正在发展的事件链连续接续'));assert(text.includes('复用记录与事件身份'));
  const worldbook=fs.readFileSync(path.join(__dirname,'../世界书/常驻/自主生活与记忆.md'),'utf8');
  assert(worldbook.includes('不每次重开一件无关小事'));assert(worldbook.includes('沿用原经历或重要记录id'));
  assert(worldbook.includes('不另建平行事件链变量'));assert.deepEqual(state,before);
});
