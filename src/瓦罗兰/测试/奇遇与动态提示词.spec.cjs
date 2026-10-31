const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const assert = require('node:assert/strict'), { test } = require('node:test');
const file = path.join(__dirname, '双API流程.spec.cjs'), h = new Module(file, module);
h.filename = file; h.paths = Module._nodeModulePaths(__dirname);
const originalRequire = h.require.bind(h);
h.require = name => name === 'node:test' ? { test() {} } : originalRequire(name);
h._compile(fs.readFileSync(file, 'utf8').split('const novelGoodReply =')[0] + '\nmodule.exports={withEnv,seed,Schema};', file);
const { withEnv, seed, Schema } = h.exports;
const { novelRefreshPrompt, applyNovelRefresh } = require('../运行/novel-refresh.ts');
const { novelPrompt, assertNovelModel, systemGoods } = require('../运行/novel-system.ts');
const { withUpdateTasks } = require('../运行/update-tasks.ts');
const { copy } = require('../运行/core.ts');
const tasks = () => [0, 1].map(i => ({ 名称: '隔离稀有委托' + i, 类型: '奇遇', 难度: '稀有', 目标: '完成对应的合成委托' }));
const goods = () => [
  { 名称: '隔离长期魔法工具', 价格: 25, 类别: '工具与设备', 描述: '持有并启用时持续辅助观察，关闭后停止，不因一次使用消失。', 稀有: true },
  { 名称: '隔离传送符', 价格: 30, 类别: '消耗品', 描述: '按本物品说明使用一次后消耗。', 稀有: true, 限购: 2 },
];
const enabled = () => { const state = seed(); state.奇遇系统._启用 = true; return state; };

for (const target of ['initial', 'tasks', 'shop']) test(`奇遇${target}：已删除的比例、能力禁词和固定商品枚举不再进入请求`, () => {
  const config = novelRefreshPrompt(enabled(), target), text = config.injects[0].content;
  assert.equal(config.injects[0].role, 'system');
  for (const old of ['稀有最多', '以生活小目标为主', '不强迫战斗', '不能仅凭危险', '不得读心', '基础供给不重复生成', '随身饮水、轻食补给包'])
    assert(!text.includes(old), old);
  if (target !== 'tasks') assert(text.includes('不等于一次性消耗品') && text.includes('长期生效方式'));
});
test('初始和刷新接受多个稀有任务/商品，稀有商品限购可选，旧定义与存档字段保持', () => {
  let state = enabled();
  state = applyNovelRefresh(state, 'initial', JSON.stringify({ 任务: tasks(), 商品: goods() }), 'first');
  assert.equal(Object.values(state.奇遇系统.任务).filter(x => x.难度 === '稀有').length, 2);
  assert.equal(Object.values(state.奇遇系统._商店商品).filter(x => x.稀有).length, 2);
  assert.doesNotThrow(() => assertNovelModel(state, copy(state)));
  const nextTasks = tasks().map(x => ({ ...x, 名称: '再次' + x.名称 }));
  state = applyNovelRefresh(state, 'tasks', JSON.stringify({ 任务: nextTasks }), 'second');
  const nextGoods = goods().map(x => ({ ...x, 名称: '再次' + x.名称 }));
  state = applyNovelRefresh(state, 'shop', JSON.stringify({ 商品: nextGoods }), 'third');
  assert.equal(Object.keys(state.奇遇系统.任务).length, 4);
  assert.equal(Object.keys(state.奇遇系统._商店商品).length, 4);
  assert.equal(systemGoods(state).find(x => x.name === '隔离长期魔法工具').limit, undefined);
  assert.equal(systemGoods(state).find(x => x.name === '隔离传送符').limit, 2);
  assert(Schema.safeParse(state).success);
  const worker = novelPrompt(state, true), story = novelPrompt(state, false);
  assert(!worker.includes('稀有最多'));
  assert(!story.includes('稀有券行动或练习结束即失效'));
});
test('普通变量结算可新增多个稀有任务，原有总任务量与购买身份保护仍生效', () => {
  const before = enabled(), after = copy(before);
  tasks().forEach((task, i) => { after.奇遇系统.任务['rare_' + i] = { ...task, 有效日: null, 进度: 0, 进展说明: null, 完成依据事件id: [] }; });
  assert.doesNotThrow(() => assertNovelModel(before, after));
  for (let i = 2; i < 9; i++) after.奇遇系统.任务['rare_' + i] = copy(after.奇遇系统.任务.rare_0);
  assert.throws(() => assertNovelModel(before, after), /最多 8 项/);
});
test('稀有初始内容保存失败后只确认原提交，不再请求、赠币或重复新增', async () => {
  await withEnv(async e => {
    await e.runtime.novelAction({ kind: 'enable', operationId: 'enable' });
    e.update = async () => JSON.stringify({ 任务: tasks(), 商品: goods() });
    let fail = true;
    global.SillyTavern.saveChat = async () => { if (fail) { fail = false; throw Error('隔离保存未确认'); } };
    await assert.rejects(e.runtime.novelRefresh('initial'), /保存未确认/);
    const id = e.vars.澄湾待确认提交.commitId;
    await e.runtime.resumeQueued(e.runtime.view.recoverable[0].id);
    assert.equal(e.calls.length, 1);
    assert.equal(e.state().奇遇系统._系统币, 30);
    assert.equal(Object.values(e.state().奇遇系统.任务).filter(x => x.难度 === '稀有').length, 2);
    assert.equal(Object.keys(e.state().奇遇系统._商店商品).length, 2);
    assert(e.state()._系统.提交记录[id]);
    assert.equal(e.vars.澄湾待确认提交, null);
    assert.equal(e.messages.length, 1);
  });
});
test('自动调度明确要求逐人具体变化，重试保留原事实；其他维护回执仍兼容', () => {
  const state = enabled();
  state._系统.任务.auto = Schema.parse({ _系统: { 任务: { auto: { 类别: '生活更新', 状态: '排队',
    触发来源: '自动角色调度：当前生活检查', 目标id: ['npc'], 目标版本: { npc: state.角色.npc._管理.版本 } } } } })._系统.任务.auto;
  let text = withUpdateTasks({}, state, ['auto']).injects[0].content;
  assert(text.includes('每位本次调度目标必须有具体动态变化'));
  assert(!text.includes('允许无变化') && !text.includes('无变化允许保留'));
  assert(text.includes('自动调度目标按专项要求逐人写入具体动态'));
  state._系统.任务.auto.状态 = '失败'; state._系统.任务.auto.错误 = '隔离回执遗漏';
  text = withUpdateTasks({}, state, ['auto']).injects[0].content;
  assert(text.includes('不为同次失败重试额外推进一轮生活'));
});
