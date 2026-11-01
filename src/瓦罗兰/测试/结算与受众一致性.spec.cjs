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
const { applyPhoneAction, finalizePhone, phoneProjection } = require('../运行/phone.ts');
const { managePhone, ensurePhoneSession } = require('../运行/phone-management.ts');
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

test('旧拉黑状态转为正常，发布与转发不再携带受众控制，旧动态正常显示', () => {
  const before = seed(); before.手机.联系人.b.状态 = '拉黑';
  before.手机.原文.帖子.original = Schema.parse({ 手机: { 原文: { 帖子: { original: {
    平台: '朋友圈', 发布账号id: 'me', 可见范围: '公开', 故事时间: time(0),
    内容块: [{ 类型: '文字', id: 'original', 正文: '原帖' }],
  } } } } }).手机.原文.帖子.original;
  for (const kind of ['post', 'repost']) {
    const next = applyPhoneAction(copy(before), { kind, platform: '邻信', id: 'original', text: '新动态' });
    const post = Object.entries(next.手机.原文.帖子).find(([id]) => id !== 'original')[1];
    assert.equal(Object.hasOwn(post, '受众账号id'), false);
    assert.equal(Object.hasOwn(post, '可见范围'), false);
    assert.equal(next.手机.联系人.b.状态, '正常');
  }
  const candidate = copy(before);
  candidate.手机.原文.帖子.model = { ...copy(before.手机.原文.帖子.original), 可见范围: '联系人可见' };
  assert.equal(Object.hasOwn(finalizePhone(before, candidate).手机.原文.帖子.model, '受众账号id'), false);
  const history = copy(before); history.手机.原文.帖子.original.受众账号id = ['npc'];
  history.手机.原文.帖子.original.可见范围 = '仅自己';
  const cleaned = Schema.parse(history);
  assert.equal(Object.hasOwn(cleaned.手机.原文.帖子.original, '可见范围'), false);
  assert(phoneProjection(cleaned, '邻信', true).posts.some(p => p.id === 'original'));
  assert.deepEqual(Schema.parse(cleaned), cleaned);
});

test('非好友可以在现有会话发送，动态评论不再检查受众，缺少账号或帖子仍明确报错', () => {
  const before = seed();
  before.手机.联系人 = {};
  assert.doesNotThrow(() => applyPhoneAction(copy(before), { kind: 'send', id: 'chat', text: '继续已有会话' }));
  const fresh = copy(before); fresh.手机.会话 = {};
  assert.doesNotThrow(() => ensurePhoneSession(fresh, '私聊', 'npc'));
  const candidate = Schema.parse(before);
  candidate.手机.原文.帖子.post = Schema.parse({ 手机: { 原文: { 帖子: { post: {
    发布账号id: 'npc', 平台: '朋友圈', 故事时间: time(0),
  } } } } }).手机.原文.帖子.post;
  candidate.手机.原文.评论.comment = Schema.parse({ 手机: { 原文: { 评论: { comment: {
    帖子id: 'post', 评论账号id: 'me', 故事时间: time(0),
  } } } } }).手机.原文.评论.comment;
  assert.doesNotThrow(() => finalizePhone(before, copy(candidate)));
  const missingPost = copy(candidate); missingPost.手机.原文.评论.comment.帖子id = 'missing';
  assert.throws(() => finalizePhone(before, missingPost), /评论引用的帖子不存在/);
  const missingAccount = copy(candidate); missingAccount.手机.原文.评论.comment.评论账号id = 'missing';
  assert.throws(() => finalizePhone(before, missingAccount), /评论账号不存在/);
});

test('群成员管理不按群主或管理员限制，创建者退出仍保留群和消息历史', () => {
  const before = seed();
  before.手机.群 = Schema.parse({ 手机: { 群: { group: {
    创建者账号id: 'npc', 管理员账号id: ['npc'], 成员: {
      me: { 成员区间: { first: { 加入时间: time(0) } } },
      npc: { 成员区间: { first: { 加入时间: time(0) } } },
    },
  } } } }).手机.群;
  const changed = managePhone(before, 'removeMember', 'group', 'npc');
  assert.deepEqual(changed.手机.群.group.成员.npc.成员区间.first.离开时间, time(0));
  assert.equal(Object.hasOwn(changed.手机.群.group, '管理员账号id'), false);
  const owned = copy(before); owned.手机.群.group.创建者账号id = 'me';
  assert.doesNotThrow(() => managePhone(owned, 'leaveGroup', 'group'));
});

test('群名、邀约说明和分类名按完整输入保存，不受额外字数门槛限制', () => {
  const name = '群聊名称'.repeat(25), text = '完整邀约说明'.repeat(50);
  const next = applyPhoneAction(seed(), { kind: 'invite', platform: '邻信', targets: ['npc'], groupName: name, text });
  assert.equal(Object.values(next.手机.群)[0].名称, name);
  assert(Object.values(next.手机.原文.消息)[0].内容块[0].正文.includes(text));
  const prepared = prepareLibraryCommand(seed(), undefined, { kind: 'create', name });
  assert.equal(prepared.created.name, name);
});
