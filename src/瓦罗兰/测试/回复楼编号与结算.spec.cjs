const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { withEnv, createRuntime, block, patch } = require('./修复宿主.cjs');

const body = '钟声响起。';
const marker = '（第2楼）\n';

for (const [mode, initial, expected] of [
  ['重试缓存', body, marker + body],
  ['旧回执随后加编号', body, marker + body],
  ['旧回执随后去编号', marker + body, body],
  ['旧回执的编号从末尾移到开头', body + '\n（第2楼）', marker + body],
  ['回执与真实编辑', body, marker + body + '两声。'],
]) {
  test(mode + '按原请求恢复回复楼', async () => withEnv(async e => {
    e.story = async () => initial;
    e.update = async () => { throw Error('模拟变量服务断开'); };
    await assert.rejects(e.runtime.send('听钟'), /模拟变量服务断开/);
    const row = e.messages[2];
    const id = e.vars.澄湾待更新正文.id;
    const realEdit = mode === '回执与真实编辑';
    row.message = expected;
    if (row.swipes) row.swipes[0] = row.message;
    if (mode !== '重试缓存') {
      delete e.vars.澄湾待更新正文;
      row.extra.cw_story_request.narrativeHash = createHash('sha256').update(initial).digest('hex');
    }
    await e.runtime.dispose();
    e.runtime = createRuntime();
    await e.runtime.start();
    if (realEdit) {
      assert.match(e.runtime.view.error, /正文.*(编辑|变化|失效)/);
      assert.equal(e.vars.澄湾待更新正文?.id, undefined);
      assert.equal(row.message, expected);
      return;
    }
    assert.equal(e.vars.澄湾待更新正文?.id, id, e.runtime.view.error);
    e.update = async () => block([]);
    await e.runtime.retry();
    assert.deepEqual(e.calls.map(c => c.kind), ['story', 'update', 'update']);
    assert.equal(e.diskChat.at(-1).mes, expected);
    assert.equal(row.extra.cw_story_settlements['0'].commitId, id);
  }));
}

for (const edit of ['本楼编号', '正文改写']) {
  test('变量返回前的' + edit + '保留在已落助手楼上', async () => withEnv(async e => {
    const expected = edit === '本楼编号' ? marker + body : '钟声停了。';
    e.story = async () => body;
    e.update = async () => {
      e.messages[2].message = expected;
      if (e.messages[2].swipes) e.messages[2].swipes[0] = expected;
      return block([]);
    };
    if (edit === '本楼编号') {
      await e.runtime.send('听钟');
      assert.equal(e.vars.澄湾待更新正文, null);
      assert.equal(e.diskChat.at(-1).mes, expected);
    } else {
      await assert.rejects(e.runtime.send('听钟'), /正文.*编辑/);
      assert.equal(e.messages[2].extra.cw_story_settlements, undefined);
    }
    assert.equal(e.messages[2].message, expected);
  }));
}

test('回复在变量请求期间被编辑，重试、删楼和重载均不能将旧结算写到上一楼', async () => withEnv(async e => {
  e.update = async () => {
    e.messages[2].message = '改后的正文';
    return block([patch('/玩家/当前状态/体力值', 7)]);
  };
  await assert.rejects(e.runtime.send('听钟'), /正文已被编辑/);
  const journal = structuredClone(e.vars.澄湾待确认提交);
  assert.equal(journal.replyFloor, 2);
  await assert.rejects(e.runtime.retry(), /正文已编辑/);
  assert.equal(e.vars.澄湾待确认提交, null);
  assert.equal(e.messages[2].message, '改后的正文');
  await e.runtime.messageAction('delete', 2);
  // 旧存档可能已删掉回复楼，只剩待确认日志。
  e.vars.澄湾待确认提交 = journal;
  e.saveDisk();
  await e.runtime.dispose();
  e.runtime = createRuntime();
  await e.runtime.start();
  assert.match(e.runtime.view.error, /结算尚未确认/);
  // 本机酒馆助手把越界请求截到最后一楼。
  const readMessages = global.getChatMessages;
  global.getChatMessages = (range, options) => readMessages(typeof range === 'number' ? Math.min(range, e.messages.length - 1) : range, options);
  await e.runtime.retry();
  assert.equal(e.vars.澄湾待确认提交, null);
  assert.equal(e.messages.length, 2);
  assert.equal(e.messages[0].data.stat_data.玩家.当前状态.体力值, 80);
  assert.equal(e.messages[0].data.stat_data._系统.提交记录[journal.commitId], undefined);
  assert.deepEqual(e.calls.map(c => c.kind), ['story', 'update']);
}));

test('原楼号已由其他回复占用时，缺少旧提交收据就不能确认或改写结算', async () => withEnv(async e => {
  let journal;
  const save = SillyTavern.saveChat;
  SillyTavern.saveChat = async () => {
    if (e.vars.澄湾待确认提交?.replyFloor === 2) journal = structuredClone(e.vars.澄湾待确认提交);
    await save();
  };
  await e.runtime.send('听钟');
  const floor = e.messages[2];
  floor.message = '另一段回复';
  delete floor.data.stat_data._系统.提交记录[journal.commitId];
  e.vars.澄湾待确认提交 = journal;
  await assert.rejects(e.runtime.retry(), /第 2 楼缺少这次结算的确认记录/);
  assert.equal(e.vars.澄湾待确认提交.commitId, journal.commitId);
  assert.equal(e.messages[0].data.stat_data._系统.提交记录[journal.commitId], undefined);
  assert.equal(floor.message, '另一段回复');
  await e.runtime.discardPending();
  assert.equal(e.vars.澄湾待确认提交, null);
  assert.deepEqual(e.calls.map(c => c.kind), ['story', 'update']);
}));

test('仅余回复楼确认日志，核对已写候选的收据后只做保存确认', async () => withEnv(async e => {
  let journal;
  const save = SillyTavern.saveChat;
  SillyTavern.saveChat = async () => {
    if (e.vars.澄湾待确认提交?.replyFloor === 2) journal = structuredClone(e.vars.澄湾待确认提交);
    await save();
  };
  await e.runtime.send('听钟');
  assert.equal(e.messages[2].extra.cw_story_settlements[0].commitId, journal.commitId);
  e.vars.澄湾待确认提交 = journal;
  await e.runtime.retry();
  assert.equal(e.vars.澄湾待确认提交, null);
  assert.equal(e.messages[0].data.stat_data._系统.提交记录[journal.commitId], undefined);
  assert.deepEqual(e.calls.map(c => c.kind), ['story', 'update']);
}));
