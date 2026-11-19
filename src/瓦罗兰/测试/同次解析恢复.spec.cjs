const { test } = require('node:test');
const assert = require('node:assert/strict');
const { environment } = require('./修复宿主.cjs');
const { createRuntime } = require('../运行/host.ts');
const { taskPresentation } = require('../界面/桌面端/utils/task-presentation.ts');

test('同次变量语法失败显示实际阶段，保留原始诊断并经编辑后重试恢复', async () => {
  const env = environment(undefined, {
    characterAuto: false,
    informationAuto: false,
    variable: { independent: false },
  });
  const commands = [{ op: 'replace', path: '/世界/当前时间/分', value: 5 }];
  const correctedReply = '正文已完成。\n<UpdateVariable><JSONPatch>' +
    JSON.stringify(commands) + '</JSONPatch></UpdateVariable>';
  const malformedReply = correctedReply.replace('</JSONPatch>', '额外说明</JSONPatch>');
  env.story = async () => malformedReply;
  try {
    await env.runtime.start();
    await assert.rejects(env.runtime.send('继续'), error => {
      assert(error instanceof SyntaxError);
      assert(error.cause instanceof SyntaxError);
      assert.match(error.message, /正文已保存.*尚未完成结算.*编辑本楼.*立即重试/);
      return true;
    });
    assert.equal(env.runtime.view.phase, 'validating');
    assert.equal(taskPresentation(env.runtime.view).hint, '校验生成结果未完成');
    assert.equal(env.diskChat[3].mes, '正文已完成。');
    assert.equal(env.diskChat[0].chat_metadata.variables.澄湾待更新正文.reply, malformedReply);
    assert.equal(env.vars.澄湾最近解析失败.response, malformedReply);
    assert.match(env.vars.澄湾最近解析失败.error, /SyntaxError/);
    assert.doesNotMatch(env.vars.澄湾最近解析失败.error, /正文已保存/);
    const id = env.vars.澄湾待更新正文.id;
    await env.runtime.dispose();
    env.runtime = createRuntime();
    await env.runtime.start();
    await assert.rejects(env.runtime.retry(), /正文已保存.*编辑本楼.*立即重试/);
    assert.equal(env.runtime.view.phase, 'validating');
    assert.equal(env.calls.length, 1);
    assert.equal(env.parses, 0);
    await env.runtime.messageAction('edit', 2, correctedReply);
    assert.equal(env.vars.澄湾待更新正文.reply, correctedReply);
    assert.equal(env.vars.澄湾待更新正文.id, id);
    await env.runtime.retry();
    assert.equal(env.vars.澄湾待更新正文, null);
    assert.equal(env.calls.length, 1);
    assert.equal(env.parses, 1);
    assert.equal(env.messages[2].data.stat_data.世界.当前时间.分, 5);
    assert(env.messages[2].data.stat_data._系统.提交记录[id]);
    assert.equal(env.vars.澄湾最近解析失败.response, malformedReply);
  } finally {
    await env.runtime.dispose();
  }
});

test('同次正文尾部多余闭括号自动恢复，正文与变量只提交一次', async () => {
  const env = environment(undefined, {
    characterAuto: false,
    informationAuto: false,
    variable: { independent: false },
  });
  const reply = '正常生成的正文。\n<UpdateVariable><JSONPatch>' +
    JSON.stringify([{ op: 'replace', path: '/世界/当前时间/分', value: 5 }]) +
    '}</JSONPatch></UpdateVariable>';
  env.story = async () => reply;
  try {
    await env.runtime.start();
    await env.runtime.send('继续');
    assert.equal(env.messages.length, 3);
    assert.equal(env.messages[2].message, '正常生成的正文。');
    assert.equal(env.diskChat[3].mes, '正常生成的正文。');
    assert.equal(env.messages[2].data.stat_data.世界.当前时间.分, 5);
    assert.equal(env.vars.澄湾待更新正文, null);
    assert.equal(env.runtime.view.error, '');
    assert.equal(env.calls.length, 1);
    assert.equal(env.parses, 1);
    const committed = structuredClone(env.messages[2].data.stat_data);
    assert.equal(Object.keys(committed._系统.已计轮事件).length, 1);
    await assert.rejects(env.runtime.retry(), /没有待恢复提交/);
    assert.equal(env.calls.length, 1);
    assert.equal(env.parses, 1);
    assert.deepEqual(env.messages[2].data.stat_data, committed);
  } finally {
    await env.runtime.dispose();
  }
});

test('旧存档同次尾部坏回包冷开重试恢复，沿用原提交且无需重新生成', async () => {
  const env = environment(undefined, {
    characterAuto: false,
    informationAuto: false,
    variable: { independent: false },
  });
  const reply = '旧存档保留的正文。\n<UpdateVariable><JSONPatch>' +
    JSON.stringify([{ op: 'replace', path: '/世界/当前时间/分', value: 5 }]) +
    '</JSONPatch></UpdateVariable>';
  env.story = async () => reply.replace('</JSONPatch>', '额外说明</JSONPatch>');
  try {
    await env.runtime.start();
    await assert.rejects(env.runtime.send('继续'), /正文已保存.*编辑本楼.*立即重试/);
    assert.equal(env.runtime.view.phase, 'validating');
    const id = env.vars.澄湾待更新正文.id;
    const oldReply = reply.replace('</JSONPatch>', '}</JSONPatch>');
    // 模拟修复前已落盘的完整待办和楼层来源，重开只从已保存的数据读取。
    env.vars.澄湾待更新正文.reply = oldReply;
    env.messages[2].extra.cw_story_request.reply = oldReply;
    env.vars.澄湾最近解析失败.response = oldReply;
    env.saveDisk();
    await env.runtime.dispose();
    env.vars = structuredClone(env.diskChat[0].chat_metadata.variables);
    env.messages[2].extra = structuredClone(env.diskChat[3].extra);
    env.runtime = createRuntime();
    await env.runtime.start();
    const requestCount = env.calls.length;
    assert.equal(env.vars.澄湾待更新正文.id, id);
    assert.equal(env.vars.澄湾待更新正文.reply, oldReply);
    await env.runtime.retry();
    assert.equal(env.calls.length, requestCount);
    assert.equal(env.parses, 1);
    assert.equal(env.messages.length, 3);
    assert.equal(env.messages[2].message, '旧存档保留的正文。');
    assert.equal(env.messages[2].data.stat_data.世界.当前时间.分, 5);
    assert(env.messages[2].data.stat_data._系统.提交记录[id]);
    assert.equal(Object.keys(env.messages[2].data.stat_data._系统.已计轮事件).length, 1);
    assert.equal(env.vars.澄湾待更新正文, null);
    assert.equal(env.runtime.view.error, '');
    const committed = structuredClone(env.messages[2].data.stat_data);
    await assert.rejects(env.runtime.retry(), /没有待恢复提交/);
    assert.equal(env.calls.length, requestCount);
    assert.equal(env.parses, 1);
    assert.deepEqual(env.messages[2].data.stat_data, committed);
    assert.equal(env.diskChat[0].chat_metadata.variables.澄湾待更新正文, null);
  } finally {
    await env.runtime.dispose();
  }
});

test('正文建楼失败后的同次语法错误说明未建楼，并可取消待办重新生成', async () => {
  const env = environment(undefined, {
    characterAuto: false,
    informationAuto: false,
    variable: { independent: false },
  });
  const reply = '尚未建楼的正文。\n<UpdateVariable><JSONPatch>' +
    JSON.stringify([{ op: 'replace', path: '/世界/当前时间/分', value: 5 }]) +
    '</JSONPatch></UpdateVariable>';
  env.story = async () => reply.replace('</JSONPatch>', '额外说明</JSONPatch>');
  const create = global.createChatMessages;
  global.createChatMessages = async (rows, options) => {
    if (rows.some(row => row.role === 'assistant')) throw Error('模拟正文建楼失败');
    return create(rows, options);
  };
  try {
    await env.runtime.start();
    await assert.rejects(env.runtime.send('继续'), /模拟正文建楼失败/);
    assert.equal(env.messages.length, 2);
    assert.equal(env.vars.澄湾待更新正文.replyFloor, undefined);
    await assert.rejects(env.runtime.retry(), error => {
      assert(error instanceof SyntaxError);
      assert.match(error.message, /本次回复已保留.*正文楼层尚未建立.*取消本次待办后重新生成/);
      assert.doesNotMatch(error.message, /正文已保存|编辑本楼/);
      return true;
    });
    assert.equal(env.runtime.view.phase, 'validating');
    assert.equal(env.messages.length, 2);
    assert.equal(env.parses, 0);
    assert.equal(env.calls.length, 1);
    assert.equal(env.diskChat[0].chat_metadata.variables.澄湾待更新正文.replyFloor, undefined);
    await env.runtime.discardPending();
    assert.equal(env.vars.澄湾待更新正文, null);
    global.createChatMessages = create;
    env.story = async () => reply;
    await env.runtime.send('继续', false);
    assert.equal(env.messages.length, 3);
    assert.equal(env.messages[2].message, '尚未建楼的正文。');
    assert.equal(env.messages[2].data.stat_data.世界.当前时间.分, 5);
    assert.equal(env.calls.length, 2);
    assert.equal(env.parses, 1);
  } finally {
    global.createChatMessages = create;
    await env.runtime.dispose();
  }
});
