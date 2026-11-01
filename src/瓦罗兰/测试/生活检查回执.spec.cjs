const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, parent, ...args) {
  if (name.startsWith('.') && parent && fs.existsSync(path.resolve(path.dirname(parent.filename), name + '.ts'))) name += '.ts';
  return resolve.call(this, name, parent, ...args);
};
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);
global.z = require('zod').z;
global._ = require('lodash');
const { Schema } = require('../schema.ts');
const { copy } = require('../运行/core.ts');
const { withUpdateTasks, finalizeUpdateTasks, pendingUpdateTasks } = require('../运行/update-tasks.ts');
// LifeCheck 输出和验收已移除；本文件保留历史测试入口。
const { validateTaskResult, planTasks } = require('../运行/tasks.ts');

const time = minute => ({ 年: 2026, 月: 10, 日: 2, 时: 10, 分: minute });
const receipt = (结果 = '无变化', 依据 = '本区间仍在正常工作，没有新的可记录进展') => ({ 结果, 依据 });
const block = (receipts, patches = []) => `<UpdateVariable><Analysis>检查本轮实际变化。</Analysis><JSONPatch>${JSON.stringify(patches)}</JSONPatch>${receipts === undefined ? '' : '<LifeCheck>' + JSON.stringify(receipts) + '</LifeCheck>'}</UpdateVariable>`;
function seed(groups = [['a'], ['b']]) {
  let state = Schema.parse({
    世界: { 当前时间: time(15) },
    玩家: { id: 'player', 姓名: '测试玩家' },
    角色: {
      a: { 层级: '主要', 姓名: '甲', 当前状态: '在工作', _更新循环: { 当前计数: 5, 上次更新变量时间: time(0) } },
      b: { 层级: '主要', 姓名: '乙', 当前状态: '在散步', _更新循环: { 当前计数: 5, 上次更新变量时间: time(0) } },
      c: { 层级: '次要', 姓名: '丙', 当前状态: '在读书' },
    },
  });
  groups.forEach((targets, index) => {
    const id = 'task_' + index;
    state._系统.任务[id] = {
      类别: '生活更新', 目标id: targets, 状态: '排队', 起始时间: time(0), 截止时间: time(15),
      目标版本: Object.fromEntries(targets.map(target => [target, state.角色[target]._管理.版本])),
      计数截止点: Object.fromEntries(targets.map(target => [target, 5])),
    };
    for (const target of targets) if (state.角色[target].层级 === '主要') state.角色[target]._更新循环.待处理任务id = id;
  });
  return Schema.parse(state);
}


 test('生活任务只发送既有待办与动态要求，不发送LifeCheck协议', () => {
  const state=seed();state._系统.任务.task_0.触发来源='自动角色调度：当前生活检查';
  const prompt=JSON.stringify(withUpdateTasks({},state,['task_0','task_1']));
  assert(!prompt.includes('LifeCheck'));assert(!prompt.includes('回执'));assert(prompt.includes('每位本次调度目标必须有具体动态变化'));
  assert.deepEqual(withUpdateTasks({},state,[]),{});
 });
 test('实际生活变化不需要回执，保留玩家事实并清理原任务计数', () => {
  const before=seed([['a']]),candidate=copy(before);candidate.玩家.当前状态.身体状态='喝水后口渴缓解';candidate.角色.a.当前状态='整理完讲义';candidate.世界.当前时间=time(20);
  const result=finalizeUpdateTasks(before,candidate,['task_0'],block());
  assert.equal(result._系统.任务.task_0.状态,'已提交');assert.equal(result.角色.a._更新循环.当前计数,0);assert.equal(result.角色.a._更新循环.待处理任务id,null);assert.deepEqual(result.角色.a._更新循环.上次更新变量时间,time(20));assert.equal(result.玩家.当前状态.身体状态,'喝水后口渴缓解');
  assert.deepEqual(finalizeUpdateTasks(result,copy(result),['task_0']),result);
 });
 test('旧回复附带缺失、损坏或矛盾的生活回执不再改变任务完成判定', () => {
  for(const raw of [block(),block({a:receipt('无变化')}),'<UpdateVariable><JSONPatch>[]</JSONPatch><LifeCheck>{broken}</LifeCheck></UpdateVariable>']){
   const before=seed([['a']]),candidate=copy(before);candidate.角色.a.当前状态='已完成备课';
   const result=finalizeUpdateTasks(before,candidate,['task_0'],raw);assert.equal(result._系统.任务.task_0.状态,'已提交');assert.equal(result.角色.a.当前状态,'已完成备课');
  }
 });
 test('无变化的普通生活维护不因缺回执失败，旧失败任务仍可沿用原身份完成', () => {
  const before=seed([['a']]);before._系统.任务.task_0.状态='失败';before._系统.任务.task_0.错误='缺少生活检查回执';const id=before._系统.任务.task_0.提交id;
  const result=finalizeUpdateTasks(before,copy(before),['task_0'],block());assert.equal(result._系统.任务.task_0.状态,'已提交');assert.equal(result._系统.任务.task_0.提交id,id);assert.equal(result._系统.任务.task_0.错误,null);assert.deepEqual(pendingUpdateTasks(result),[]);
 });
 test('任务版本、停用和升格结构校验仍保留，不以删除回执放行失效任务', () => {
  const before=seed([['c']]);before._系统.任务.task_0.类别='升格';const result=finalizeUpdateTasks(before,copy(before),['task_0'],block());assert.equal(result._系统.任务.task_0.状态,'失败');assert.match(result._系统.任务.task_0.错误,/主要角色/);
  const stale=seed([['a']]);stale._系统.任务.task_0.目标版本.a++;assert.deepEqual(pendingUpdateTasks(stale),[]);assert.deepEqual(finalizeUpdateTasks(stale,copy(stale),['task_0']),stale);
  const disabled=seed([['a']]);disabled._系统.角色停用标识.a={姓名:'甲'};assert.deepEqual(finalizeUpdateTasks(disabled,copy(disabled),['task_0']),disabled);
 });
test('只将当前有效的失败生活任务带入下次交互，摘要/建档和旧版本不自动重试', () => {
  for (const 类别 of ['生活更新', '自然融入', '升格', '摘要', '建档']) {
    const state = seed([['a']]);
    state._系统.任务.task_0.类别 = 类别;
    state._系统.任务.task_0.状态 = '失败';
    assert.deepEqual(pendingUpdateTasks(state), ['摘要', '建档'].includes(类别) ? [] : ['task_0']);
  }
  for (const 状态 of ['排队', '失败']) {
    const state = seed([['a']]);
    state._系统.任务.task_0.状态 = 状态;
    state._系统.任务.task_0.目标版本.a++;
    assert.deepEqual(pendingUpdateTasks(state), []);
    assert.deepEqual(withUpdateTasks({}, state, ['task_0']), {});
  }
  for (const 状态 of ['已提交', '取消', '失效']) {
    const state = seed([['a']]);
    state._系统.任务.task_0.状态 = 状态;
    assert.deepEqual(pendingUpdateTasks(state), []);
  }
  const disabled = seed([['a']]);
  disabled._系统.任务.task_0.状态 = '失败';
  disabled._系统.角色停用标识.a = { 姓名: '甲' };
  assert.deepEqual(pendingUpdateTasks(disabled), []);
  const retry = seed([['a']]);
  retry._系统.任务.task_0.状态 = '失败';
  retry._系统.任务.task_0.错误 = '缺少回执';
  const prompt = JSON.stringify(withUpdateTasks({}, retry, pendingUpdateTasks(retry)));
  assert(!prompt.includes('缺少回执'), '过期诊断留在存档，不重新变成模型输出要求');
  assert.match(prompt, /已写入的事实不要重复演绎/);
});

test('次要角色按自己的当前近况字段完成，不要求主要经历结构', () => {
  const before = seed([['c']]), candidate = copy(before);
  candidate.角色.c.重要记录.npc_current_state = { 内容: '近日在研究新配方，今天完成了初步笔记', 事件id: null, 约定id: null };
  const result = finalizeUpdateTasks(before, candidate, ['task_0'], block({ c: receipt('已更新', '记录独自研究的初步进展') }));
  assert.equal(result._系统.任务.task_0.状态, '已提交');
  assert.equal(result.角色.c.经历, undefined);
});

test('已提交、取消和停用目标不会因缺回执重开任务或补造生活', () => {
  for (const status of ['已提交', '取消', '失效']) {
    const before = seed([['a']]);
    before._系统.任务.task_0.状态 = status;
    assert.deepEqual(finalizeUpdateTasks(before, copy(before), ['task_0'], block()), before);
  }
  const disabled = seed([['a']]);
  disabled._系统.角色停用标识.a = { 姓名: '甲' };
  assert.deepEqual(finalizeUpdateTasks(disabled, copy(disabled), ['task_0'], block()), disabled);
});

test('建档仍按原实际更新校验完成，不需要生活回执', () => {
  const before = seed([['a']]);
  before._系统.任务.task_0.类别 = '建档';
  const candidate = copy(before);
  candidate.玩家.背景.当前生活背景 = '初来瓦洛兰，在新居安顿';
  const result = finalizeUpdateTasks(before, candidate, ['task_0'], block());
  assert.equal(result._系统.任务.task_0.状态, '已提交');
});

test('摘要仍按原覆盖记录校验归档，不需要生活回执', () => {
  const before = seed([['a']]);
  before._系统.任务.task_0.类别 = '摘要';
  before._系统.任务.task_0.触发来源 = '人物:a';
  before._系统.任务.task_0.覆盖记录id = ['work'];
  before.角色.a.经历.最近经历.work = { 日期说明: '2026年10月02日', 日期精度: '日', 经历: '完成一阶段研究', 来源事件id: [], 来源存档id: null };
  const candidate = copy(before);
  candidate.角色.a.经历.生活摘要.period = { 起始日期说明: '2026年10月02日', 结束日期说明: '2026年10月02日', 经历: '完成一阶段研究', 覆盖记录id: ['work'], 重要事项id: [], 来源存档id: null };
  const result = finalizeUpdateTasks(before, candidate, ['task_0'], block());
  assert.equal(result._系统.任务.task_0.状态, '已提交');
  assert.equal(result.角色.a.经历.最近经历.work, undefined);
  assert.equal(result.角色.a.经历._待归档经历.work.经历, '完成一阶段研究');
});
