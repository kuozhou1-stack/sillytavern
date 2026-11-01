const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const { test } = require('node:test'), assert = require('node:assert/strict');
const file = path.join(__dirname, '双API流程.spec.cjs');
const harness = new Module(file, module);
harness.filename = file;
harness.paths = Module._nodeModulePaths(__dirname);
const nativeRequire = harness.require.bind(harness);
harness.require = name => name === 'node:test' ? { test() {} } : nativeRequire(name);
harness._compile(fs.readFileSync(file, 'utf8').split('const novelGoodReply =')[0] +
  '\nmodule.exports={withEnv,seed,block,patch,time};', file);
const { withEnv, seed, block, patch, time } = harness.exports;
const { Schema } = require('../schema.ts');
const { copy, validateModel } = require('../运行/core.ts');
const { validateSettlement } = require('../运行/settlement.ts');
const { applyPhoneAction, finalizePhone, canSeePost } = require('../运行/phone.ts');
const { prepareLibraryCommand } = require('../运行/character-library.ts');

function ledger() {
  return Schema.parse({ 玩家: { id: 'player', 资金: { 余额分: 900,
    交易: { paid: { 类型: '支出', 金额分: 100, 状态: '已完成', 事件id: 'purchase' } } } },
    事件: { purchase: { 事实: '已完成购买' } } });
}

test('已结算交易不能回退、删除或改写收支后重复结算，说明仍可补充', () => {
  const before = ledger();
  for (const change of [
    s => { s.玩家.资金.交易.paid.状态 = '待结'; },
    s => { delete s.玩家.资金.交易.paid; },
    s => { s.玩家.资金.交易.paid.金额分 = 50; },
    s => { s.玩家.资金.交易.paid.类型 = '收入'; },
  ]) {
    const next = copy(before); change(next);
    assert.throws(() => validateSettlement(before, next), /已完成交易/);
    assert.throws(() => validateSettlement(before, validateModel(before, next)), /已完成交易|脚本管理字段/);
  }
  const annotated = copy(before); annotated.玩家.资金.交易.paid.用途 = '补充购买说明';
  assert.equal(validateSettlement(before, validateModel(before, annotated)).玩家.资金.余额分, 900);
  const refund = copy(before);
  refund.事件.refund = { ...copy(before.事件.purchase), 事实: '实际退回50' };
  refund.玩家.资金.交易.refund = { ...copy(before.玩家.资金.交易.paid), 类型: '退款', 金额分: 50, 事件id: 'refund' };
  refund.玩家.资金.余额分 = 950;
  assert.equal(validateSettlement(before, validateModel(before, refund)).玩家.资金.余额分, 950);
});

test('正文和手机共用时间一致性：未来消息不落盘，重试只补结算', async () => {
  await withEnv(async e => {
    const message = { 会话id: 'chat', 发送账号id: 'npc', 故事时间: time(30),
      内容块: [{ 类型: '文字', id: 'text', 正文: '回复' }] };
    const commands = [{ op: 'insert', path: '/手机/原文/消息/reply', value: message }];
    e.update = async () => block(commands);
    await assert.rejects(e.runtime.send('正文收到手机消息'), /时间晚于世界时间/);
    assert.equal(e.state().手机.原文.消息.reply, undefined);
    assert.equal(e.messages.length, 3);
    e.update = async () => block([...commands, patch('/世界/当前时间', time(30))]);
    await e.runtime.retry();
    assert.equal(e.state().手机.原文.消息.reply._发送状态, '已投递');
    assert.equal(e.calls.filter(c => c.kind === 'story').length, 1);
    assert.equal(e.messages.length, 3);
  });
});

test('玩家发布、转发与模型发布使用同一拉黑受众，既往受众不重算', () => {
  const before = seed(); before.手机.联系人.b.状态 = '拉黑';
  before.手机.原文.帖子.original = Schema.parse({ 手机: { 原文: { 帖子: { original: {
    平台: '朋友圈', 发布账号id: 'me', 可见范围: '公开', 故事时间: time(0),
    内容块: [{ 类型: '文字', id: 'original', 正文: '原帖' }],
  } } } } }).手机.原文.帖子.original;
  for (const kind of ['post', 'repost']) {
    const next = applyPhoneAction(copy(before), { kind, platform: '邻信', id: 'original', text: '新动态' });
    const post = Object.entries(next.手机.原文.帖子).find(([id]) => id !== 'original')[1];
    assert.deepEqual(post.受众账号id, []);
    assert.equal(canSeePost(next, post, 'npc'), false);
  }
  const candidate = copy(before);
  candidate.手机.原文.帖子.model = { ...copy(before.手机.原文.帖子.original), 可见范围: '联系人可见' };
  assert.deepEqual(finalizePhone(before, candidate).手机.原文.帖子.model.受众账号id, []);
  const history = copy(before); history.手机.原文.帖子.original.受众账号id = ['npc'];
  assert.deepEqual(finalizePhone(history, copy(history)).手机.原文.帖子.original.受众账号id, ['npc']);
});

test('群名、邀约说明和分类名按完整输入保存，不受额外字数门槛限制', () => {
  const name = '群聊名称'.repeat(25), text = '完整邀约说明'.repeat(50);
  const next = applyPhoneAction(seed(), { kind: 'invite', platform: '邻信', targets: ['npc'], groupName: name, text });
  assert.equal(Object.values(next.手机.群)[0].名称, name);
  assert(Object.values(next.手机.原文.消息)[0].内容块[0].正文.includes(text));
  const prepared = prepareLibraryCommand(seed(), undefined, { kind: 'create', name });
  assert.equal(prepared.created.name, name);
});
