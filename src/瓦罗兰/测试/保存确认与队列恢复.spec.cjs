const { test } = require('node:test');
const assert = require('node:assert/strict');
const { withEnv, environment, createRuntime, copy, deferred, until } = require('./修复宿主.cjs');

const queue = '澄湾排队操作';
const failed = '澄湾失败请求';
const pending = '澄湾待更新正文';
const disk = e => e.diskChat[0].chat_metadata.variables;
const ids = records => (records ?? []).map(item => item.id);

async function reload(e) {
  await e.runtime.dispose();
  const saved = copy(e.diskChat);
  e.vars = saved[0].chat_metadata.variables;
  e.messages = saved.slice(1).map(row => ({
    role: row.is_user ? 'user' : 'assistant', message: row.mes, extra: row.extra,
    swipe_id: row.swipe_id, swipes: row.swipes, swipe_info: row.swipe_info,
    data: row.variables[row.swipe_id ?? 0], swipes_data: row.swipes ? row.variables : undefined,
  }));
  e.runtime = createRuntime();
  await e.runtime.start();
}

for (const restart of [false, true]) {
  test(`失效出队保存失败${restart ? '后冷启动' : '后原地恢复'}，已落玩家楼不会再发送一次`, async () => {
    await withEnv(async e => {
      const nativeSave = SillyTavern.saveChat;
      let failCleanup = false;
      SillyTavern.saveChat = async () => {
        if (failCleanup && e.vars[queue].length === 0) throw Error('模拟出队保存断开');
        return nativeSave();
      };
      let id;
      e.story = async () => {
        id = e.vars[queue][0].id;
        e.messages[1].message = '改过的输入';
        await nativeSave();
        failCleanup = true;
        return '已失效的回复';
      };
      await assert.rejects(e.runtime.send('旧输入'), /第1楼的原文已变化.*出队保存断开/);
      assert.match(e.runtime.view.error, /旧请求清理未确认/);
      assert.equal(disk(e)[queue][0].inputSaved, true);
      assert.equal(disk(e)[queue][0].source.at(-1).text, '旧输入');
      failCleanup = false;
      if (restart) await reload(e);
      await assert.rejects(e.runtime.resumeQueued(id), /第1楼的原文已变化.*旧请求已清理/);
      assert.deepEqual(ids(disk(e)[queue]), []);
      assert.deepEqual(e.messages.map(row => row.message), ['初始楼层', '改过的输入']);
      assert.equal(e.calls.length, 1);
      assert.equal(e.runtime.view.canResend, true);
    });
  });
}

test('只保存了玩家输入和队列时冷启动沿用该输入', async () => {
  await withEnv(async e => {
    let interrupted;
    e.story = async () => { interrupted = copy(e.diskChat); throw Error('模拟进程在保存失败重试记录前退出'); };
    await assert.rejects(e.runtime.send('已落的输入'), /模拟进程/);
    e.diskChat = interrupted;
    await reload(e);
    const [item] = e.vars[queue];
    assert.equal(e.vars[failed], undefined);
    e.story = async () => '恢复的回复';
    await e.runtime.resumeQueued(item.id);
    assert.deepEqual(e.messages.map(row => row.message), ['初始楼层', '已落的输入', '恢复的回复']);
    assert.ok(e.state()._系统.提交记录[item.id]);
    assert.deepEqual(ids(disk(e)[queue]), []);
  });
});

test('玩家楼落下后再次提交相同输入，共用在途操作', async () => {
  await withEnv(async e => {
    const gate = deferred();
    e.story = () => gate.promise;
    const first = e.runtime.send('同一输入');
    await until(() => e.calls.length === 1);
    const second = e.runtime.send('同一输入');
    gate.resolve('完成正文');
    await Promise.all([first, second]);
    assert.deepEqual(e.messages.map(row => row.message), ['初始楼层', '同一输入', '完成正文']);
    assert.equal(e.calls.length, 2);
  });
});

test('正常正文最后一次确认已出队，冷启动后无需手工取消', async () => {
  await withEnv(async e => {
    e.messages[0].data.stat_data.地点.office = { 名称: '办公室' };
    await e.runtime.send('完成正文');
    assert.deepEqual(ids(e.vars[queue]), []);
    console.info('最后确认队列长度', ids(disk(e)[queue]).length);
    assert.deepEqual(ids(disk(e)[queue]), []);
    await reload(e);
    assert.deepEqual(e.runtime.view.recoverable, []);
    assert.equal(e.runtime.view.error, '');
    await e.runtime.manageInformation('地点', 'office', '仅名称');
    assert.equal(e.state()._系统.资料加载.地点覆盖.office, '仅名称');
  });
});

test('旧存档重开仅整理已提交且没有待确认记录的操作', async () => {
  await withEnv(async e => {
    const generate = e.story;
    let original;
    e.story = async (...args) => { original = copy(e.vars[queue][0]); return generate(...args); };
    await e.runtime.send('旧版已完成的请求');
    const future = { ...original, id: 'still-waiting', label: '另一个排队项' };
    disk(e)[queue] = [original, future];
    await reload(e);
    assert.deepEqual(ids(e.runtime.view.recoverable), [future.id]);
    assert.deepEqual(ids(disk(e)[queue]), [future.id]);
    assert.equal(e.calls.length, 2);
  });
});

test('同 ID 正文失败后重试，在失败标记交接读回 503 后再次重试', async () => {
  await withEnv(async e => {
    e.story = async () => { throw Error('正文服务故障'); };
    await assert.rejects(e.runtime.send('恢复正文'), /正文服务故障/);
    const id = e.vars[failed].id;
    const read = e.readDisk;
    let induced = false;
    e.readDisk = () => {
      if (!induced && e.vars[failed] === null && e.vars[pending] && e.vars[pending].replyFloor === undefined) {
        induced = true;
        return new Response('', { status: 503 });
      }
      return read();
    };
    e.story = async () => '保存的正文';
    await assert.rejects(e.runtime.retry(), /503/);
    assert(induced);
    await e.runtime.retry();
    console.info('重试后', { sameIdFailure: disk(e)[failed]?.id === id,
      rounds: Object.keys(e.state()._系统.已计轮事件).length, calls: e.calls.map(c => c.stage) });
    assert(e.state()._系统.提交记录[id]);
    assert.equal(disk(e)[failed], null);
    assert.deepEqual(ids(disk(e)[queue]), []);
    assert.deepEqual(Object.keys(e.state()._系统.已计轮事件), [id]);
    assert.deepEqual(e.calls.map(c => c.stage), ['story', 'story', 'variables']);
    assert.equal(e.messages.filter(row => row.role === 'user').length, 1);
  });
});

test('一次正文和告警记忆不重复提交同一份完整存档', async () => {
  await withEnv(async e => {
    const snapshots = [];
    const read = e.readDisk;
    e.readDisk = () => { snapshots.push(JSON.stringify(e.diskChat)); return read(); };
    await e.runtime.send('检查相同保存');
    const duplicates = snapshots.flatMap((value, i) => value === snapshots[i - 1] ? [i + 1] : []);
    console.info('正文保存与读回', snapshots.length, '连续相同快照位置', duplicates);
    const before = snapshots.length;
    await e.runtime.saveAlertMemory({ checked: true });
    console.info('告警保存与读回', snapshots.length - before);
    assert.deepEqual(duplicates, []);
    assert.equal(snapshots.length - before, 1);
    await e.runtime.saveAlertMemory({ checked: true });
    assert.equal(snapshots.length - before, 1);
  });
});

test('正文只清理本次操作的失败记录', async () => {
  await withEnv(async e => {
    e.story = async () => { throw Error('另一项正文生成失败'); };
    await assert.rejects(e.runtime.send('之前的请求'), /另一项正文生成失败/);
    const unrelated = copy(e.vars[failed]);
    await e.runtime.discardPending();
    e.story = async () => {
      e.vars[failed] = copy(unrelated);
      return '另一个请求顺利完成';
    };
    await e.runtime.send('完成当前请求');
    assert.deepEqual(disk(e)[failed], unrelated);
  });
});

test('旧版无 ID 的失败请求获得稳定身份后只计一轮', async () => {
  await withEnv(async e => {
    e.story = async () => { throw Error('正文失败'); };
    await assert.rejects(e.runtime.send('旧版请求'), /正文失败/);
    delete disk(e)[failed].id;
    delete disk(e)[queue];
    await reload(e);
    e.story = async () => '重试原旧版请求';
    await e.runtime.retry();
    assert.equal(disk(e)[failed], null);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
    assert.equal(e.messages.filter(row => row.role === 'user').length, 1);
  });
});

test('酒馆原生切换候选确认清掉该分支的旧队列', async () => {
  await withEnv(async e => {
    e.story = async () => { throw Error('正文失败'); };
    await assert.rejects(e.runtime.send('切换前的请求'), /正文失败/);
    assert.equal(ids(disk(e)[queue]).length, 1);
    e.listeners.get('swipe')(0);
    await until(() => disk(e)[failed] === null && ids(disk(e)[queue]).length === 0);
    await reload(e);
    assert.deepEqual(e.runtime.view.recoverable, []);
  });
});

for (const fail of [false, true]) test('正文出队确认期间加入手机操作，' + (fail ? '写盘失败保留两项' : '成功仅移除正文'), async () => {
  await withEnv(async e => {
    const gate = deferred();
    let atFinal = false, storyId;
    const save = SillyTavern.saveChat;
    SillyTavern.saveChat = async () => {
      storyId ??= e.vars[queue]?.find(item => item.kind === 'story')?.id;
      if (!atFinal && storyId && e.messages.at(-1).data?.stat_data?._系统.提交记录[storyId] &&
          e.vars[pending] === null) {
        atFinal = true;
        await gate.promise;
        if (fail) throw Error('模拟最终保存失败');
      }
      await save();
    };
    const story = e.runtime.send('并发检查').then(() => null, err => err);
    await until(() => atFinal);
    const phone = e.runtime.phoneAction({ kind: 'refresh', id: 'chat' }).then(result => result, err => err);
    const phoneId = e.vars[queue].find(item => item.kind === 'phone').id;
    gate.resolve();
    const storyResult = await story;
    const phoneResult = await phone;
    if (fail) {
      assert.match(String(storyResult), /模拟最终保存失败/);
      assert.match(String(phoneResult), /未完成/);
      assert.deepEqual(ids(e.vars[queue]), [storyId, phoneId]);
      assert.equal(e.vars[pending].id, storyId);
      await e.runtime.retry();
      assert.deepEqual(ids(disk(e)[queue]), [phoneId]);
      assert.equal(e.calls.filter(c => c.stage === 'story').length, 1);
      assert.equal((await e.runtime.resumeQueued(phoneId)).id, phoneId);
    } else {
      assert.equal(storyResult, null);
      assert.equal(phoneResult.id, phoneId);
    }
    assert.deepEqual(ids(disk(e)[queue]), []);
    assert(e.state()._系统.提交记录[storyId]);
    assert(e.state()._系统.提交记录[phoneId]);
  });
});

for (const kind of ['队列', '正文']) test('最终读回的' + kind + '不一致时保留操作，重试只确认原提交', async () => {
  await withEnv(async e => {
    let corrupted = false;
    const original = e.readDisk;
    e.readDisk = () => {
      if (corrupted || e.messages.length !== 3 || !Object.keys(e.messages[2].data?.stat_data?._系统.提交记录 ?? {}).length ||
          e.vars[pending] !== null) return original();
      corrupted = true;
      const result = copy(e.diskChat);
      if (kind === '队列') result[0].chat_metadata.variables[queue] = [{ id: 'unexpected' }];
      else result[3].mes = '服务端旧内容';
      return Response.json(result);
    };
    await assert.rejects(e.runtime.send('确认读回'), /保存未确认/);
    assert(corrupted);
    const id = e.vars[pending].id, calls = e.calls.length;
    assert.deepEqual(ids(e.vars[queue]), [id]);
    await e.runtime.retry();
    assert(e.state()._系统.提交记录[id]);
    assert.equal(e.calls.length, calls);
    assert.deepEqual(ids(disk(e)[queue]), []);
  });
});

test('同聊天的第二个窗口不能清理恢复记录或提交正文', async () => {
  const e = environment();
  const held = new Set();
  navigator.locks.request = async (name, options, callback) => {
    const fn = callback ?? options;
    if (held.has(name)) return fn(null);
    held.add(name);
    try { return await fn({}); } finally { held.delete(name); }
  };
  await e.runtime.start();
  const second = createRuntime();
  try {
    const before = copy(e.diskChat), reads = e.diskReads;
    await second.start();
    assert(second.view.readOnly);
    assert.throws(() => second.send('只读窗口的提交'), /不是活动写入/);
    assert.equal(e.diskReads, reads);
    assert.deepEqual(e.diskChat, before);
    await e.runtime.send('写入窗口的请求');
    assert.deepEqual(ids(disk(e)[queue]), []);
    assert.equal(e.calls.filter(c => c.stage === 'story').length, 1);
  } finally {
    await second.dispose();
    await e.runtime.dispose();
  }
});
