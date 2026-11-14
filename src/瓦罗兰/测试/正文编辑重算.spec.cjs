const { test } = require('node:test');
const assert = require('node:assert/strict');
const { withEnv, copy, block, patch, createRuntime, deferred, until } = require('./修复宿主.cjs');

test('候选正文原样保存或只改自身楼号时保留结算，编辑正文仍触发重算', async () => {
  await withEnv(async e => {
    await e.runtime.send('开始');
    const row = e.messages[2], story = row.message, original = copy(row.data);
    row.swipe_id = 0;
    row.swipes = [story, '另一份候选正文'];
    row.swipe_info = [copy(row.extra), { plugin: '另一候选元数据' }];
    row.swipes_data = [row.data, { plugin: '另一候选变量' }];
    const other = [row.swipes[1], copy(row.swipe_info[1]), copy(row.swipes_data[1])];
    await e.runtime.messageAction('edit', 2, story);
    await e.listeners.get('edited')(2);
    row.message += '\n<StatusPlaceHolderImpl/>';
    await e.runtime.messageAction('edit', 2);
    assert.equal(e.diskChat.at(-1).mes, row.message);
    row.message = '（第2楼）\n' + story;
    await e.listeners.get('edited')(2);
    assert.equal(row.message, '（第2楼）\n' + story);
    await e.runtime.messageAction('edit', 2, story);
    assert.equal(row.message, story);
    assert.deepEqual([row.swipes[1], row.swipe_info[1], row.swipes_data[1]], other);
    assert.deepEqual(row.data, original);
    assert.equal(e.vars.澄湾待更新正文, null);
    assert.equal(e.runtime.view.error, '');
    await e.runtime.messageAction('edit', 2, '（第3楼）\n' + story);
    assert.equal(e.vars.澄湾待更新正文?.text, '（第3楼）\n' + story);
  });
});

test('桌面明确恢复到已结算或待结算原文时，写回当前候选并保留原提交', async () => {
  for (const waiting of [false, true]) await withEnv(async e => {
    if (waiting) {
      e.update = async () => { throw Error('断开变量连接'); };
      await assert.rejects(e.runtime.send('等待'), /断开变量连接/);
    } else await e.runtime.send('开始');
    const row = e.messages[2], original = row.message;
    const prior = structuredClone(e.vars.澄湾待更新正文);
    const settlement = structuredClone(row.extra.cw_story_settlements);
    const calls = e.calls.length;
    row.message = '第三方直接写入的其他内容';
    e.runtime.refreshMessages();
    await e.runtime.messageAction('edit', 2, original);
    assert.equal(row.message, original);
    assert.equal(e.diskChat.at(-1).mes, original);
    assert.equal(e.calls.length, calls);
    assert.deepEqual(row.extra.cw_story_settlements, settlement);
    assert.deepEqual(e.vars.澄湾待更新正文, prior);
  });
});

test('原生重复编辑回调或仅加本楼编号不会中断正在执行的变量结算', async () => {
  await withEnv(async e => {
    const waiting = deferred();
    e.update = () => waiting.promise;
    const ongoing = e.runtime.send('开始');
    await until(() => e.calls.some(call => call.kind === 'update'));
    const original = e.vars.澄湾待更新正文.id;
    await e.listeners.get('edited')(2);
    e.messages[2].message = '（第2楼）\n' + e.messages[2].message;
    await e.listeners.get('edited')(2);
    waiting.resolve(block([]));
    await ongoing;
    assert.deepEqual(e.stops, []);
    assert.equal(e.messages[2].extra.cw_story_settlements['0'].commitId, original);
  });
});

test('失败发送后原样保存玩家输入，原来的重试仍能使用', async () => {
  await withEnv(async e => {
    e.story = async () => { throw Error('模拟正文连接失败'); };
    await assert.rejects(e.runtime.send('玩家行动'), /模拟正文连接失败/);
    const id = e.vars.澄湾失败请求.id;
    await e.runtime.messageAction('edit', 1, '玩家行动');
    assert.equal(e.vars.澄湾失败请求.id, id);
    e.story = async () => '恢复成功';
    await e.runtime.retry();
    assert.equal(e.messages[2].extra.cw_story_settlements['0'].commitId, id);
    assert.equal(e.messages.length, 3);
  });
});

test('改写失败请求的玩家楼后同时退掉旧排队项，从该楼续接只使用新输入', async () => {
  await withEnv(async e => {
    e.story = async () => { throw Error('模拟断线'); };
    await assert.rejects(e.runtime.send('旧行动'), /模拟断线/);
    const id = e.vars.澄湾失败请求.id;
    await e.runtime.messageAction('edit', 1, '新行动');
    assert.equal(e.vars.澄湾失败请求, null);
    assert.equal(e.runtime.view.canResend, true);
    assert.deepEqual(e.diskChat[0].chat_metadata.variables.澄湾排队操作, []);
    assert.equal(e.diskChat[2].mes, '新行动');
    await assert.rejects(async () => e.runtime.resumeQueued(id), /操作不存在/);
    e.story = async () => '新回复';
    await e.runtime.messageAction('player_send', 1);
    assert.deepEqual(e.messages.map(m => m.message), ['初始楼层', '新行动', '新回复']);
  });
});

for (const entry of ['桌面', '酒馆原生']) {
  test(entry + '编辑后只重算当前候选，重载仍从上一楼结算', async () => {
    await withEnv(async e => {
      e.update = async () => block([patch('/玩家/当前状态/体力值', 62)]);
      await e.runtime.send('走到门口');
      const reply = e.messages[2];
      const other = copy(reply.data);
      const selectedInfo = { ...reply.extra, plugin: '保留的标记' };
      reply.swipes = [reply.message, '玩家选中的文本'];
      reply.swipe_info = [{ extra: { ...reply.extra, plugin: '其他候选的标记' } }, selectedInfo];
      reply.swipes_data = [other, copy(reply.data)];
      reply.swipes_data[1].stat_data._系统.候选回复id = '1';
      reply.swipes_data[1].stat_data._系统.分支id = e.chat + ':2:1';
      reply.swipe_id = 1;
      reply.message = reply.swipes[1];
      reply.data = reply.swipes_data[1];
      reply.extra = selectedInfo;
      const preserved = copy({ text: reply.swipes[0], info: reply.swipe_info[0], data: reply.swipes_data[0] });
      const edited = '改为等待开门';
      if (entry === '桌面') await e.runtime.messageAction('edit', 2, edited);
      else {
        reply.message = edited;
        reply.swipes[1] = edited;
        await e.listeners.get('edited')(2);
      }
      const request = e.vars.澄湾待更新正文;
      assert.equal(request?.context.floor, 0);
      assert.equal(request.replySwipe, 1);
      assert.equal(request.envelope.stat_data.玩家.当前状态.体力值, 80);
      assert.equal(e.diskChat[0].chat_metadata.variables.澄湾待更新正文.id, request.id);
      const saved = copy(e.diskChat);
      await e.runtime.dispose();
      e.vars = saved[0].chat_metadata.variables;
      // 原生楼层可能先于聊天恢复记录写盘。靠候选上的请求身份也能恢复这次编辑。
      if (entry === '酒馆原生') delete e.vars.澄湾待更新正文;
      e.runtime = createRuntime();
      await e.runtime.start();
      assert.equal(e.vars.澄湾待更新正文.id, request.id);
      e.update = async () => block([]);
      await e.runtime.retry();
      const result = e.diskChat.at(-1);
      assert.equal(result.mes, edited);
      assert.equal(result.swipe_id, 1);
      assert.deepEqual({ text: result.swipes[0], info: result.swipe_info[0], data: result.variables[0] }, preserved);
      assert.equal(result.swipe_info[1].plugin, '保留的标记');
      assert.equal(result.variables[1].stat_data.玩家.当前状态.体力值, 80);
      assert.deepEqual(Object.keys(result.variables[1].stat_data._系统.已计轮事件), [request.id]);
      assert.equal(e.diskChat[0].chat_metadata.variables.澄湾待更新正文, null);
      assert.deepEqual(e.calls.map(call => call.kind), ['story', 'update', 'update']);
    });
  });
}

test('原生编辑正在结算的正文，迟到结果不会覆盖新编辑', async () => {
  await withEnv(async e => {
    const waiting = deferred();
    e.update = () => waiting.promise;
    const oldRequest = e.runtime.send('开始行动');
    await until(() => e.calls.some(call => call.kind === 'update'));
    e.messages[2].message = '此处改为休息';
    await e.listeners.get('edited')(2);
    const id = e.vars.澄湾待更新正文.id;
    waiting.resolve(block([patch('/玩家/当前状态/体力值', 5)]));
    await assert.rejects(oldRequest, /停止|取消/);
    assert.equal(e.vars.澄湾待更新正文.id, id);
    assert.equal(e.messages[2].message, '此处改为休息');
    e.update = async () => block([]);
    await e.runtime.retry();
    assert.equal(e.state().玩家.当前状态.体力值, 80);
    assert.deepEqual(Object.keys(e.state()._系统.已计轮事件), [id]);
    assert.deepEqual(e.runtime.view.recoverable, []);
  });
});
