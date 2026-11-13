const { test } = require('node:test');
const assert = require('node:assert/strict');
const { withEnv, copy, block, patch, createRuntime, deferred, until } = require('./修复宿主.cjs');

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
