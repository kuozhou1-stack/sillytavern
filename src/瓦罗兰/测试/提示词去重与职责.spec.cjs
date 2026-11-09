const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fixture = path.join(__dirname, '双API流程.spec.cjs');
const harness = new Module(fixture, module);
harness.filename = fixture;
harness.paths = Module._nodeModulePaths(__dirname);
const nativeRequire = harness.require.bind(harness);
harness.require = name => name === 'node:test' ? { test() {} } : nativeRequire(name);
harness._compile(fs.readFileSync(fixture, 'utf8').split('const novelGoodReply =')[0] +
  '\nmodule.exports={environment,Schema,copy,block,endpoint};', fixture);
const { environment, Schema, copy } = harness.exports;
const { livePromptConfig } = require('../运行/prompts.ts');
const { withUpdateTasks, finalizeUpdateTasks } = require('../运行/update-tasks.ts');
const { withPromptContext,promptContextText } = require('../运行/prompt-context.ts');
const { promptProjections } = require('../运行/model-history.ts');
const { archiveSourceRecords } = require('../运行/archive.ts');
const { nativePromptConfig } = require('../运行/prompts.ts');
const text = config => [(config.injects ?? []).map(x => x.content).join('\n'),JSON.stringify(promptProjections.get(config)??{})].join('\n');
const count = (body, value) => body.split(value).length - 1;
const marker = 'ARCHIVE_FULL_TEXT_SENTINEL';
function seed() {
  return Schema.parse({
    _系统: { 建档完成: true, 角色停用标识: { kassadin: { 姓名: '卡萨丁' } } },
    世界: { 当前时间: { 年: 2026, 月: 10, 日: 31, 时: 12, 分: 0 } },
    玩家: { id: 'player', 姓名: '隔离玩家' },
    角色: { npc: { 层级: '主要', 姓名: '隔离人物' } },
  });
}
function archiveSeed(kind, key = 'old') {
  const data = seed();
  const task = { 类别: '摘要', 状态: '排队', 覆盖记录id: [key] };
  if (kind === '消息') {
    data.手机.原文.消息[key] = { 会话id: 'chat', 内容块: [{ 类型: '文字', id: 'body', 正文: marker }] };
    task.触发来源 = '会话:chat';
  } else if (kind === '帖子评论') {
    data.手机.原文.帖子.post = { 内容块: [{ 类型: '文字', id: 'post_body', 正文: '已覆盖旧帖背景' }] };
    data.手机.原文.评论[key] = { 帖子id: 'post', 内容块: [{ 类型: '文字', id: 'comment_body', 正文: marker }] };
    task.触发来源 = '动态:微澜';
  } else if (kind === '手机摘要') {
    data.手机.摘要[key] = { 内容: marker, 层级: '细摘要' };
    task.触发来源 = '细摘要:会话:chat';
  } else {
    const root = kind;
    data.角色.npc.经历[root][key] = root === '最近经历'
      ? { 日期说明: '2026年10月31日', 经历: marker }
      : { 起始日期说明: '2026年10月30日', 结束日期说明: '2026年10月31日', 经历: marker, 覆盖记录id: ['older'] };
    task.目标id = ['npc']; task.目标版本 = { npc: data.角色.npc._管理.版本 };
    task.触发来源 = root === '最近经历' ? '人物:npc' : root === '生活摘要' ? '人物细摘要:npc' : '人物阶段:npc';
  }
  data._系统.任务.archive = task;
  return Schema.parse(data);
}

test('停用名单在原生任务输入中保留一份，不再通过发送后钩子追加',async()=>{const state=seed();environment(state);
 const story=await livePromptConfig(state,'输入','story');assert.deepEqual(story,{user_input:'输入'});
 const worker=await livePromptConfig(state,'输入','worker');assert.equal(count(text(worker),'玩家暂时关闭的人物'),1);
 const native=nativePromptConfig(worker);assert.equal(native.injects,undefined);assert.equal(count(native.user_input,'玩家暂时关闭的人物'),1);
});

test('九个生活任务共同说明一份，逐项身份保留且不要求LifeCheck', () => {
  const data = seed();
  for (let i = 0; i < 9; i++) {
    data.角色['npc' + i] = copy(data.角色.npc);
    data._系统.任务['life' + i] = { 类别: '生活更新', 状态: '排队', 目标id: ['npc' + i],
      目标版本: { ['npc' + i]: 0 }, 触发来源: '自动角色调度：当前生活检查' };
  }
  const state = Schema.parse(data), ids = Array.from({ length: 9 }, (_, i) => 'life' + i);
  const original = copy(state), body = text(withUpdateTasks({}, state, ids));
  assert.equal(count(body, '包括未在玩家身边的开启人物'), 1);
  assert.equal(count(body, '<LifeCheck>'), 0);
  for (const id of ids) assert.equal(count(body, '待办 ' + id + '：'), 1);
  assert.deepEqual(state, original);
});

for (const kind of ['消息', '帖子评论', '手机摘要', '最近经历', '生活摘要', '阶段概述']) {
  test(`归档${kind}：已在实际投影内的全文只发送一次，原记录不变`, async () => {
    const state = archiveSeed(kind); environment(state);
    const original = copy(state), cfg = await livePromptConfig(state, '', 'worker');
    assert(promptProjections.has(cfg));
    const result = withUpdateTasks(cfg, state, ['archive']);
    assert.equal(count(text(result), marker), 1);
    assert(text(result).includes('源记录路径'));
    assert(!text(result).includes('归档源记录共享补充'));
    assert.deepEqual(state, original);
  });
}

test('没有状态投影时补充完整归档资料，相同路径在多个任务间只补一次', () => {
  const state = archiveSeed('消息');
  state._系统.任务.second = copy(state._系统.任务.archive);
  const result = withUpdateTasks({}, state, ['archive', 'second']);
  assert.equal(count(text(result), marker), 1);
  assert.equal(count(text(result), '归档源记录共享补充'), 1);
  assert.equal(count(text(result), '源记录路径'), 2);
});

test('投影缺少或只含部分字段时补完整源记录，完整存档不被请求投影覆盖', () => {
  for (const missing of [true, false]) {
    const state = archiveSeed('消息');
    const cfg = { injects: [{ role: 'system', content: '{}' }] };
    const projection = missing ? {} : { 手机: { 原文: { 消息: { old: { 会话id: 'chat' } } } } };
    promptProjections.set(cfg, projection);
    const original = copy(state), result = withUpdateTasks(cfg, state, ['archive']);
    assert.equal(count(text(result), marker), 1);
    assert(text(result).includes('归档源记录共享补充'));
    assert.deepEqual(state, original);
  }
});

test('JSON Pointer路径正确转义，不改写真实记录ID', async () => {
  const id = 'part/~old', state = archiveSeed('消息', id); environment(state);
  const source = archiveSourceRecords(state, 'archive');
  assert.equal(source[0].path.at(-1), id);
  const cfg = withUpdateTasks(await livePromptConfig(state, '', 'worker'), state, ['archive']);
  assert(text(cfg).includes('/手机/原文/消息/part~1~0old'));
  assert.equal(count(text(cfg), marker), 1);
  assert(state.手机.原文.消息[id]);
});

test('归档保存仍校验覆盖、迁移原文并提交原任务，不需要生活回执', () => {
  const before = archiveSeed('最近经历'), after = copy(before);
  after.角色.npc.经历.生活摘要.completed = { 起始日期说明: '2026年10月31日', 结束日期说明: '2026年10月31日',
    经历: '完整归档事实', 覆盖记录id: ['old'], 重要事项id: [], 来源存档id: null };
  const result = finalizeUpdateTasks(before, after, ['archive'], '<UpdateVariable><JSONPatch>[]</JSONPatch></UpdateVariable>');
  assert.equal(result._系统.任务.archive.状态, '已提交');
  assert.equal(result.角色.npc.经历.最近经历.old, undefined);
  assert.equal(result.角色.npc.经历._待归档经历.old.经历, marker);
  assert.equal(before.角色.npc.经历.最近经历.old.经历, marker);
});

test('任务准备不操作已经组装的消息或预设元数据',()=>{const messages=[{role:'assistant',name:'preset',content:'原生尾部'}],before=copy(messages);
 const c=nativePromptConfig({user_input:'原始事实',injects:[{role:'system',content:'任务说明'}]});
 assert.deepEqual(messages,before);assert.equal(c.user_input,'任务说明\n\n原始事实');assert.equal(c.injects,undefined);});

test('原生输入保留业务标签，不做状态区块或归属标记清洗',()=>{const fact='<status_current_variable>事实中的字面标签</status_current_variable>';
 assert.equal(nativePromptConfig({user_input:fact}).user_input,fact);});

test('正文资料由原生世界书内容宏返回，完整状态不被写回投影',async()=>{const state=seed(),before=copy(state);
 await withPromptContext({purpose:'story',state},async()=>{const result=promptContextText(()=>state);assert(result.startsWith('<status_current_variable>'));
 assert.equal(Object.hasOwn(JSON.parse(result.match(/<status_current_variable>\s*([\s\S]*?)\s*<\/status_current_variable>/)[1]),'_系统'),false);});assert.deepEqual(state,before);});
