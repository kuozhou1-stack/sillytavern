const { test } = require('node:test');
const assert = require('node:assert/strict');
const { block, createRuntime, deferred, endpoint, until, withEnv } = require('./修复宿主.cjs');

test('继续剧情期间可改更早的助手楼，同一候选的续写起点改写则拒绝旧正文', async () => {
  for (const editedFloor of [0, 2]) await withEnv(async e => {
    await e.runtime.send('走到路口');
    e.story = async () => {
      e.messages[editedFloor].message = '改写了这段剧情的结尾';
      return '生成的续篇';
    };
    const continuing = e.runtime.messageAction('continue', 2);
    if (editedFloor === 2) {
      await assert.rejects(continuing, /第\s*2\s*楼/);
      assert.equal(e.messages.length, 3);
      assert.deepEqual(e.calls.map(c => c.kind), ['story', 'update', 'story']);
    } else {
      await continuing;
      assert.equal(e.messages[3].message, '生成的续篇');
      assert.ok(e.state()._系统.提交记录[e.messages[3].extra.cw_story_settlements[0].commitId]);
    }
  });
});

for (const record of ['待结算记录', '旧失败请求', '旧楼层回执']) {
  test(`冷开${record}仍核对原续写起点，不为改过结尾的楼层重发或提交`, async () => withEnv(async e => {
    await e.runtime.send('走到路口');
    const fail = async () => { throw Error('模拟连接中断'); };
    if (record === '旧失败请求') e.story = fail;
    else e.update = fail;
    await assert.rejects(e.runtime.messageAction('continue', 2), /模拟连接中断/);
    const calls = e.calls.length;
    const failed = record === '旧失败请求';
    const saved = failed ? e.vars.澄湾失败请求 : e.vars.澄湾待更新正文;
    const id = saved.id;
    await e.runtime.dispose();
    if (record === '旧失败请求') {
      assert.equal(saved.continuation, true);
      delete saved.id;
      for (const m of saved.source) delete m.continuationStart;
    } else if (record === '旧楼层回执') {
      delete e.vars.澄湾待更新正文;
      const origin = e.messages[3].extra.cw_story_request;
      assert.equal(origin.id, id);
      for (const m of origin.source) delete m.continuationStart;
    }
    e.messages[2].message = '起点已经换了结尾';
    e.saveDisk();
    e.runtime = createRuntime();
    await e.runtime.start();
    assert.match(e.runtime.view.error, /第\s*2\s*楼/);
    await assert.rejects(e.runtime.retry(), failed ? /没有待恢复提交/ : /第\s*2\s*楼/);
    assert.equal(e.calls.length, calls);
    assert.equal(e.state()._系统.提交记录[id], undefined);
    assert.equal(e.messages.length, failed ? 3 : 4);
    assert.equal(e.messages[2].message, '起点已经换了结尾');
  }));
}

test('正文回包时玩家已编辑输入，指出楼层且旧队列不能再次追加原输入', async () => {
  await withEnv(async e => {
    const reply = deferred();
    e.story = () => reply.promise;
    const sending = e.runtime.send('原输入');
    const rejected = assert.rejects(sending, /第1楼的原文已变化.*没有新增正文/);
    await until(() => e.calls.length === 1);
    const first = e.vars.澄湾排队操作[0].id;
    const other = e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '另一个排队操作' });
    const waiting = assert.rejects(other, /前一操作未完成/);
    await until(() => e.vars.澄湾排队操作.length === 2);
    const second = e.vars.澄湾排队操作[1].id;
    e.messages[1].message = '修正后的输入';
    reply.resolve('旧正文');
    await Promise.all([rejected, waiting]);
    assert.deepEqual(e.messages.map(m => m.message), ['初始楼层', '修正后的输入']);
    assert.match(e.runtime.view.error, /第1楼的原文已变化/);
    assert.deepEqual(e.vars.澄湾排队操作.map(item => item.id), [second]);
    assert.deepEqual(e.diskChat[0].chat_metadata.variables.澄湾排队操作.map(item => item.id), [second]);
    await assert.rejects(async () => e.runtime.resumeQueued(first), /操作不存在/);
    assert.equal(e.runtime.view.canResend, false);
    await e.runtime.cancelQueued(second);
    assert.deepEqual(e.runtime.view.recoverable, []);
    assert.equal(e.runtime.view.canResend, true);
    assert.match(e.runtime.view.error, /第1楼的原文已变化/);
    e.story = async () => '使用了新输入';
    await e.runtime.send('新的输入');
    assert.equal(e.messages.at(-1).message, '使用了新输入');
  });
});

test('变量回包时来源已编辑，指出保留的助手楼并可从其菜单重新生成', async () => {
  await withEnv(async e => {
    e.update = async () => {
      e.messages[1].message = '修正后的输入';
      return block([]);
    };
    await assert.rejects(e.runtime.send('原输入'), /第1楼的原文已变化.*正文保留在第 2 楼/);
    assert.equal(e.messages[2].message, '已经完成的正文');
    assert.equal(e.messages[2].extra.cw_update_pending, true);
    assert.equal(e.vars.澄湾待更新正文, null);
    assert.deepEqual(e.vars.澄湾排队操作, []);
    await e.runtime.messageAction('ai_reroll', 2);
    assert.equal(e.messages.length, 3);
    assert.equal(e.messages[1].message, '修正后的输入');
    assert.equal(e.messages[2].extra.cw_update_pending, undefined);
  });
});

test('MESSAGE_UPDATED 中发现的首个变化在 stop 和后续恢复原文字后仍可见', async () => {
  await withEnv(async e => {
    e.story = async () => {
      e.messages[1].message = '新输入';
      await e.listeners.get('edit')(1);
      e.messages[1].message = '原输入';
      return '已停止请求的迟到正文';
    };
    await assert.rejects(e.runtime.send('原输入'), /第1楼的原文已变化.*没有新增正文/);
    assert.equal(e.messages.length, 2);
    assert.equal(e.stops.length, 1);
    assert.deepEqual(e.vars.澄湾排队操作, []);
  });
});

for (const entry of ['启动', '原地重试']) test(`${entry}清理失效重试记录时一并移除同一队列项，显示导致失效的楼层`, async () => {
  await withEnv(async e => {
    e.story = async () => { throw Error('模拟断线'); };
    await assert.rejects(e.runtime.send('原输入'), /模拟断线/);
    assert.equal(e.vars.澄湾排队操作[0].id, e.vars.澄湾失败请求.id);
    e.messages[1].message = '后来保存的输入';
    if (entry === '启动') {
      await e.runtime.dispose();
      e.runtime = createRuntime();
      await e.runtime.start();
    } else {
      await assert.rejects(e.runtime.retry(), /第1楼的原文已变化/);
    }
    assert.match(e.runtime.view.error, /第1楼的原文已变化.*旧请求已清理/);
    assert.equal(e.vars.澄湾失败请求, null);
    assert.equal(e.runtime.view.canResend, true);
    assert.deepEqual(e.vars.澄湾排队操作, []);
    assert.equal(e.messages.length, 2);
    assert.equal(e.calls.length, 1);
  });
});

test('资料选择已写入且等待保存确认时，临时编辑来源并重启仍可回到原输入完成同一轮', async () => {
  await withEnv(async e => {
    let failed = false;
    const save = SillyTavern.saveChat;
    SillyTavern.saveChat = async () => {
      if (!failed && e.messages[0].data.stat_data._系统.资料加载.选择依据?.startsWith('story:')) {
        failed = true;
        throw Error('模拟资料选择保存断线');
      }
      return save();
    };
    e.update = async () => e.runtime.view.phase === 'information' ? JSON.stringify({ 地点: [], 组织: [] }) : block([]);
    await assert.rejects(e.runtime.send('原输入'), /断线/);
    const storyId = e.vars.澄湾失败请求.id;
    const journalId = e.vars.澄湾待确认提交.commitId;
    await e.runtime.dispose();
    e.messages[1].message = '临时改写';
    e.saveDisk();
    e.runtime = createRuntime();
    await e.runtime.start();
    await assert.rejects(e.runtime.retry(), /第1楼的原文已变化/);
    assert.equal(e.vars.澄湾失败请求.id, storyId);
    assert.equal(e.vars.澄湾待确认提交.commitId, journalId);
    e.messages[1].message = '原输入';
    await e.runtime.retry();
    assert.ok(e.state()._系统.提交记录[storyId]);
    assert.ok(e.state()._系统.提交记录[journalId]);
    assert.deepEqual(e.calls.map(call => call.stage), ['information', 'story', 'variables']);
  }, undefined, { characterAuto: false, informationAuto: true, variable: endpoint('variable'), phone: endpoint('phone') });
});
