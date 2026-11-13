const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Schema, copy, withEnv, block } = require('./修复宿主.cjs');
const { managePhone } = require('../运行/phone-management.ts');
const { applyPhoneAction, finalizePhone, phoneProjection } = require('../运行/phone.ts');
const at = 分 => ({ 年: 2026, 月: 9, 日: 22, 时: 10, 分 });
const member = () => ({ 成员区间: { first: { 加入时间: at(0) } } });
function groupState() {
  return Schema.parse({
    玩家: { id: 'player' }, 世界: { 当前时间: at(2) },
    手机: {
      账号: { me: { 人物id: 'player' }, a: { 人物id: 'a' }, b: { 人物id: 'b' } },
      群: { group: { 成员: { me: member(), a: member(), b: member() } } },
      会话: { chat: { 群id: 'group', 类型: '群聊', 参与账号id: ['me', 'a', 'b'] } },
    },
  });
}
const send = text => ({ kind: 'send', id: 'chat', text });
function settleMessage(state, sender, time) {
  const next = copy(state);
  next.手机.原文.消息.model = {
    会话id: 'chat', 发送账号id: sender, 故事时间: time, 内容块: [{ 类型: '文字', id: 'block', 正文: '模型消息' }],
  };
  return finalizePhone(state, Schema.parse(next));
}

test('玩家退群后仍能读历史，发送原文、投递及顺序不再写入；重新加入后恢复发送', () => {
  let state = applyPhoneAction(groupState(), send('在群时的消息'));
  state.世界.当前时间 = at(4);
  state = managePhone(state, 'leaveGroup', 'group');
  const snapshot = copy(state);
  const view = phoneProjection(state);
  assert.equal(view.sessions[0].groupReadOnly, true);
  assert.equal(view.messagesMap.chat[0].blocks[0].content, '在群时的消息');
  assert.throws(() => applyPhoneAction(state, send('退群后的消息')), /发送者.*不在群中/);
  assert.deepEqual(state, snapshot);
  const other = settleMessage(state, 'b', at(4));
  assert.deepEqual(other.手机.原文.消息.model._已投递账号id, ['a']);
  assert.equal(phoneProjection(other).messagesMap.chat.length, 1);
  state.手机.群.group.成员.me.成员区间.second = { 加入时间: at(6), 离开时间: null };
  state.世界.当前时间 = at(6);
  assert.equal(phoneProjection(state).sessions[0].groupReadOnly, false);
  state = applyPhoneAction(state, send('再加入时的消息'));
  assert.equal(phoneProjection(state).messagesMap.chat[0].blocks[0].content, '再加入时的消息');
  assert.equal(Object.keys(state.手机.原文.消息).length, 2);
});

test('模型发言和收件人按消息时点判断，离群前、离开当刻、重新加入当刻和未知时间各自生效', () => {
  let state = groupState();
  state.世界.当前时间 = at(4);
  state = managePhone(state, 'removeMember', 'group', 'a');
  state.世界.当前时间 = at(8);
  state.手机.群.group.成员.a.成员区间.second = { 加入时间: at(6), 离开时间: at(7) };
  for (const time of [at(2), at(6)]) {
    const candidate = settleMessage(state, 'a', time);
    assert.deepEqual(candidate.手机.原文.消息.model._已投递账号id, ['me', 'b']);
    assert.equal(phoneProjection(candidate).messagesMap.chat[0].blocks[0].content, '模型消息');
  }
  for (const time of [at(4), at(5), at(7), null]) {
    assert.throws(() => settleMessage(state, 'a', time), /发送者.*不在群中/);
    assert.equal(state.手机.原文.消息.model, undefined);
  }
  assert.deepEqual(settleMessage(state, 'b', null).手机.原文.消息.model._已投递账号id, ['me']);
});

test('隔离宿主拒绝离群成员的模型回包，重试只落一次有效消息，旧历史保留', async () => {
  let initial = applyPhoneAction(groupState(), send('已保存的群消息'));
  initial._系统.建档完成 = true;
  initial.世界.当前时间 = at(4);
  initial = managePhone(initial, 'removeMember', 'group', 'a');
  const snapshot = copy(initial.手机.原文.消息);
  await withEnv(async e => {
    let sender = 'a';
    e.update = async () => block([{ op: 'add', path: '/手机/原文/消息/model', value: {
      会话id: 'chat', 发送账号id: sender, 故事时间: at(4), 内容块: [{ 类型: '文字', id: 'new', 正文: '新消息' }],
    } }]);
    await assert.rejects(e.runtime.phoneAction({ kind: 'refresh', id: 'chat' }), /发送者.*不在群中/);
    assert.deepEqual(e.state().手机.原文.消息, snapshot);
    sender = 'b';
    await e.runtime.retry();
    const state = e.state();
    assert.equal(Object.keys(state.手机.原文.消息).length, Object.keys(snapshot).length + 1);
    assert.deepEqual(state.手机.原文.消息.model._已投递账号id, ['me']);
    assert.equal(Object.values(state.手机._接收侧记录).filter(receipt => receipt.原内容id === 'model').length, 1);
    for (const [id, msg] of Object.entries(snapshot)) assert.deepEqual(state.手机.原文.消息[id], msg);
  }, initial);
});
