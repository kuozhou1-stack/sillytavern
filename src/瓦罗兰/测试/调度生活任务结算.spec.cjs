const assert = require('node:assert/strict');
const { test } = require('node:test');
const { withEnv, createRuntime, Schema, copy, block, patch } = require('./修复宿主.cjs');
const { finalizeUpdateTasks, pendingUpdateTasks } = require('../运行/update-tasks.ts');

function seed(targets, source = '自动角色调度：当前生活检查') {
  return Schema.parse({
    玩家: { id: 'player', 姓名: '测试玩家', 当前状态: { 体力值: 80 } },
    世界: { 当前时间: { 年: 2026, 月: 11, 日: 15, 时: 9, 分: 0 } },
    角色: {
      a: { 姓名: '甲', 层级: '主要', 当前状态: '备课', _更新循环: { 当前计数: 4 } },
      b: { 姓名: '乙', 层级: '次要', 当前状态: '读书' },
    },
    _系统: { 建档完成: true, 任务: Object.fromEntries(targets.map(id => ['check_' + id, {
      类别: '生活更新', 触发来源: source, 目标id: [id], 状态: '排队',
      目标版本: { [id]: 0 }, 计数截止点: { [id]: id === 'a' ? 4 : 0 }, 提交id: 'original_' + id,
    }])) },
  });
}

test('调度回包空数组或同值写回后重开重试，沿用原楼和任务，只计一轮', async () => {
  await withEnv(async e => {
    await assert.rejects(e.runtime.send('准备今天的课'), /自动生活检查.*没有产生业务变化/);
    assert.equal(e.calls.at(-1).config.json_schema.value.properties.JSONPatch.type, 'string');
    assert.doesNotMatch(JSON.stringify(e.calls.at(-1).config.finalMessages), /实际覆盖 0 位/);
    const operation = e.vars.澄湾待更新正文.id;
    assert.equal(e.messages.length, 3);
    assert.equal(e.state()._系统.任务.check_a.状态, '排队');
    assert.equal(e.state().角色.a._更新循环.当前计数, 4);
    assert.deepEqual(Object.keys(e.state()._系统.已计轮事件), []);
    await e.runtime.dispose();
    e.runtime = createRuntime();
    await e.runtime.start();
    e.update = async () => block([patch('/角色/a/当前状态', '备课')]);
    await assert.rejects(e.runtime.retry(), /自动生活检查.*没有产生业务变化/);
    assert.match(JSON.stringify(e.calls.at(-1).config.finalMessages), /要求更新的 1 位人物实际覆盖 0 位/);
    assert.equal(e.vars.澄湾待更新正文.id, operation);
    e.update = async () => block([patch('/角色/a/当前状态', '已写好第一节课的板书提纲')]);
    await e.runtime.retry();
    assert.equal(e.state()._系统.任务.check_a.状态, '已提交');
    assert.equal(e.state()._系统.任务.check_a.提交id, 'original_a');
    assert.equal(e.messages.length, 3);
    assert.deepEqual(Object.keys(e.state()._系统.已计轮事件), [operation]);
    assert.equal(e.vars.澄湾待更新正文, null);
  }, seed(['a']));
});

test('共同事件只完成有对应动态的目标，保留其他合法写入；下轮仅结算遗漏者', async () => {
  await withEnv(async e => {
    e.update = async () => block([
      { op: 'insert', path: '/事件/lesson', value: { 事实: '完成教具交接', 参与者: { a: '接收本次教具' } } },
      patch('/玩家/当前状态/体力值', 78),
    ]);
    await e.runtime.send('记录教具交接');
    assert.equal(e.state().玩家.当前状态.体力值, 78);
    assert.equal(e.state().角色.a.当前状态, '备课');
    assert.equal(e.state()._系统.任务.check_a.状态, '已提交');
    assert.equal(e.state()._系统.任务.check_b.状态, '失败');
    assert.deepEqual(pendingUpdateTasks(e.state()), ['check_b']);
    const savedEvent = copy(e.state().事件.lesson);
    e.update = async () => block([patch('/角色/b/当前状态', '写完读书笔记')]);
    await e.runtime.send('查看读书进度');
    assert.equal(e.state()._系统.任务.check_b.状态, '已提交');
    assert.deepEqual(e.state().事件.lesson, savedEvent);
    assert.equal(e.state()._系统.任务.check_a.提交id, 'original_a');
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 2);
  }, seed(['a', 'b']));
});

test('普通生活任务的空数组仍允许结算，调度有其他业务写入时保留其他写入与遗漏任务', async () => {
  await withEnv(async e => {
    await e.runtime.send('坐一会儿');
    assert.equal(e.calls.at(-1).config.json_schema.value.properties.JSONPatch.type, 'string');
    assert.equal(e.state()._系统.任务.check_a.状态, '已提交');
  }, seed(['a'], '更新循环'));
  await withEnv(async e => {
    e.update = async () => block([patch('/玩家/当前状态/体力值', 77)]);
    await e.runtime.send('整理书桌');
    assert.equal(e.state().玩家.当前状态.体力值, 77);
    assert.equal(e.state()._系统.任务.check_a.状态, '失败');
  }, seed(['a']));
});

test('手机调度的空回包被移出缓存，重开后重新请求，同一条玩家原文只投递一次', async () => {
  const initial = seed(['a']);
  initial.手机 = Schema.parse({ 手机: {
    账号: { self: { 人物id: 'player' }, teacher: { 人物id: 'a' } },
    会话: { lesson: { 类型: '私聊', 参与账号id: ['self', 'teacher'] } },
  } }).手机;
  await withEnv(async e => {
    await assert.rejects(e.runtime.phoneAction({ kind: 'send', id: 'lesson', text: '需要复印教案吗？' }), /没有产生业务变化/);
    assert.equal(e.calls.at(-1).config.json_schema.value.properties.JSONPatch.type, 'string');
    const pending = e.vars.澄湾待更新手机;
    assert(pending.id);
    assert.equal(pending.reply, undefined);
    assert.equal(pending.replyFormat, undefined);
    const sent = Object.keys(pending.draft.手机.原文.消息);
    assert.equal(sent.length, 1);
    assert.deepEqual(e.state().手机.原文.消息, {});
    await e.runtime.dispose();
    e.runtime = createRuntime();
    await e.runtime.start();
    e.update = async () => block([patch('/角色/a/当前状态', '已将教案交给打印室')]);
    await e.runtime.retry();
    assert.match(JSON.stringify(e.calls.at(-1).config.finalMessages), /要求更新的 1 位人物实际覆盖 0 位/);
    assert.equal(e.calls.length, 2);
    assert.deepEqual(Object.keys(e.state().手机.原文.消息), sent);
    assert.equal(e.state()._系统.任务.check_a.状态, '已提交');
    assert.deepEqual(Object.keys(e.state()._系统.已计轮事件), [pending.id]);
    assert.equal(e.vars.澄湾待更新手机, null);
  }, initial);
});

test('脚本计数不构成完成凭据，既有共同记录上另一人的独立变化不冒领', () => {
  const before = seed(['a', 'b']);
  before.事件 = Schema.parse({ 事件: { lesson: { 事实: '备课', 参与者: { a: '教师', b: '学生' } } } }).事件;
  const counterOnly = copy(before);
  counterOnly.角色.a._更新循环.当前计数++;
  assert.throws(() => finalizeUpdateTasks(before, counterOnly, ['check_b', 'check_a']), /没有产生业务变化/);
  const candidate = copy(before);
  candidate.事件.lesson.参与者.b = '提交了课堂反馈';
  const saved = finalizeUpdateTasks(before, candidate, ['check_b', 'check_a']);
  assert.equal(saved._系统.任务.check_b.状态, '已提交');
  assert.equal(saved._系统.任务.check_a.状态, '失败');
});

test('位置、约定、知情来源与账号行为可以单独记录目标进展', () => {
  const before = seed(['a', 'b']);
  before.手机 = Schema.parse({ 手机: {
    账号: { teacher: { 人物id: 'a' } }, 原文: { 点赞: { old: { 账号id: 'teacher', 内容id: 'oldPost' } } },
  } }).手机;
  for (const update of [
    s => { s.世界.当前场景.在场人物 = ['a']; },
    s => { s.地点 = Schema.parse({ 地点: { school: { 关联人物: { a: '接任教务值班' } } } }).地点; },
    s => { s.组织 = Schema.parse({ 组织: { college: { 已知成员: { a: { 职务: '新任教研组长' } } } } }).组织; },
    s => { s.约定 = Schema.parse({ 约定: { lesson: { 内容: '安排下次试讲', 参与者: { a: { 响应: '接受' } } } } }).约定; },
    s => { s.事件 = Schema.parse({ 事件: { class: { 各人可知来源: { a: { 方式: '阅读', 说明: '已读试讲安排' } } } } }).事件; },
    s => { delete s.手机.原文.点赞.old; },
  ]) {
    const candidate = copy(before);
    update(candidate);
    const result = finalizeUpdateTasks(before, candidate, pendingUpdateTasks(before));
    assert.equal(result._系统.任务.check_a.状态, '已提交');
    assert.equal(result._系统.任务.check_b.状态, '失败');
  }
});
