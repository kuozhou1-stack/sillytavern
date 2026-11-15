const { test } = require('node:test');
const assert = require('node:assert/strict');
global.z = require('zod');
const { messageSource, assertMessageSource, MessageSourceError } = require('../运行/request-source.ts');

function setup() {
  const assistant = { mes: '街上开始落雨。', swipes: ['较早候选', '备用候选'], swipe_id: 0 };
  const user = { mes: '带上雨伞。', is_user: true };
  global.SillyTavern = { chat: [assistant, user] };
  return { assistant, user, source: messageSource(), chat: SillyTavern.chat };
}

function setupContinuation() {
  const { assistant, chat } = setup();
  chat.pop();
  return assistant;
}

function continuationSource() {
  const source = messageSource();
  source.at(-1).continuationStart = true;
  return source;
}

test('助手楼本号独占首行可增删，包括正文和仍未同步的选中候选', () => {
  for (const newline of ['\n', '\r\n']) {
    const { assistant, source } = setup();
    const marker = '（第0楼）' + newline;
    assistant.mes = marker + assistant.mes;
    assistant.swipes[0] = marker + assistant.swipes[0];
    assert.doesNotThrow(() => assertMessageSource(source));
    const marked = messageSource();
    assert.equal(marked[0].archive, assistant.mes);
    assistant.mes = source[0].archive;
    assistant.swipes[0] = source[0].candidate;
    assert.doesNotThrow(() => assertMessageSource(marked));
    const legacy = source.map(({ id, role, swipe, text }) => ({ id, role, swipe, text }));
    assistant.mes = marker + assistant.mes;
    assert.doesNotThrow(() => assertMessageSource(legacy));
  }
});

test('编号与有回执的 advice 转移叠加仍能识别玩家原输入', () => {
  const { assistant, user, source } = setup();
  user.extra = { izumi_advice: { version: 1, revision: 1, assistantId: 0, text: user.mes, replacementText: '已转移' } };
  assistant.mes = '（第0楼）\n<advice>' + user.mes + '</advice>\n\n' + assistant.mes;
  assistant.swipes[0] = assistant.mes;
  user.mes = '已转移';
  assert.doesNotThrow(() => assertMessageSource(source));
  user.extra.izumi_advice.assistantId = 8;
  assert.throws(() => assertMessageSource(source), MessageSourceError);
});

test('玩家原话包含字面 advice 标签，外层转移回执仍还原完整输入', () => {
  const { assistant, user } = setup();
  const original = '把 <advice>某项</advice> 当作普通文字。';
  user.mes = original;
  const source = messageSource();
  user.extra = { izumi_advice: { version: 1, revision: 1, assistantId: 0, text: original, replacementText: '已转移' } };
  assistant.mes = '<advice>' + original + '</advice>\n\n' + assistant.mes;
  user.mes = '已转移';
  assert.equal(messageSource()[1].text, original);
  assert.doesNotThrow(() => assertMessageSource(source));
  assistant.mes = assistant.mes.replace('某项', '另一项');
  assert.throws(() => assertMessageSource(source), /第1楼的原文已变化/);
});

test('续写起点的独立 advice 跨过楼号时保留原有段落；编辑正文空行仍失效', () => {
  const assistant = setupContinuation();
  const advice = '<advice>同一建议</advice>';
  const archive = '（第0楼）\n\n正文';
  assistant.mes = advice + '\n\n' + archive;
  const prior = continuationSource();
  assistant.mes = archive + '\n\n' + advice;
  assert.doesNotThrow(() => assertMessageSource(prior));
  const moved = continuationSource();
  assistant.mes = archive + '\n\n<advice>另一条建议</advice>';
  assert.throws(() => assertMessageSource(moved), /第0楼的原文已变化/);
  assistant.mes = '（第0楼）\n正文\n\n' + advice;
  assert.throws(() => assertMessageSource(moved), /第0楼的原文已变化/);
});

test('相同 advice 不能掩盖续写起点的末尾空格、空行或实质改字', () => {
  const assistant = setupContinuation();
  const advice = '<advice>同一建议</advice>\n\n';
  const body = '第一段\n\n末段 \n\n';
  assistant.mes = advice + body;
  const source = continuationSource();
  for (const changed of [body.replace('末段 ', '末段'), body.slice(0, -1), body.replace('末段', '另一段')]) {
    assistant.mes = advice + changed;
    assert.throws(() => assertMessageSource(source), /第0楼的原文已变化/);
  }
});

test('续写起点有独立 advice 时，同行带结束标签的字面正文仍参与比较', () => {
  const assistant = setupContinuation();
  assistant.mes = '<advice>同一建议</advice>\n\n原文\n<advice>第一种</advice>仍是同行正文';
  const source = continuationSource();
  assistant.mes = assistant.mes.replace('第一种', '第二种');
  assert.throws(() => assertMessageSource(source), /第0楼的原文已变化/);
});

test('续写起点在最后一个完整 planning 块的边界写入楼号，正反向都能复原', () => {
  const assistant = setupContinuation();
  const p = '<konatan_planning~outer><konatan_planning>子计划</konatan_planning></konatan_planning>';
  const header = p + '\n第一段\n' + p;
  const marker = '（第0楼）';
  const pairs = [
    [header + '\n正文', header + '\n' + marker + '\n正文'],
    [p + '\r\n\r\n正文 ', p + '\r\n' + marker + '\r\n\r\n正文 '],
    [p + '正文\r下一段', p + '\r' + marker + '\r正文\r下一段'],
    [p + '\n', p + '\n' + marker], [p, p + '\n' + marker],
  ];
  for (const [bare, numbered] of pairs) {
    assistant.mes = bare;
    const original = continuationSource();
    assistant.mes = numbered;
    assert.doesNotThrow(() => assertMessageSource(original));
    const after = continuationSource();
    assistant.mes = bare;
    assert.doesNotThrow(() => assertMessageSource(after));
  }
  assistant.mes = header + '\n正文';
  const before = continuationSource();
  for (const altered of [
    header + '\n（第7楼）\n正文', header.replace('子计划', '更改计划') + '\n' + marker + '\n正文',
    header + '\n正文\n' + marker, header.replace(p, p + '\n' + marker) + '\n正文',
    header + '\n' + marker + '\n' + marker + '\n正文', header + '\n' + marker + '\n改写正文',
    header + '\n' + marker + '\n\n正文',
  ]) {
    assistant.mes = altered;
    assert.throws(() => assertMessageSource(before), /第0楼的原文已变化/);
  }
  for (const incomplete of ['<konatan_planning>尚未结束', p + '<konatan_planning', '</konatan_planning>']) {
    assistant.mes = incomplete + '\n正文';
    const original = continuationSource();
    assistant.mes = incomplete + '\n' + marker + '\n正文';
    assert.throws(() => assertMessageSource(original), /第0楼的原文已变化/);
  }
});

test('续写起点的独立尾号可移到开头，回复哈希兼容形式保留正文原字节', () => {
  const assistant = setupContinuation(), source = continuationSource();
  const { assistantFloorTextVariants } = require('../运行/request-source.ts');
  for (const eol of ['\n', '\r\n']) {
    const body = '开头\r\n\n正文末尾有空格 ';
    const marker = '（第0楼）';
    const foot = body + eol + marker, head = marker + eol + body;
    assistant.mes = foot;
    const prior = continuationSource();
    assistant.mes = head;
    assert.doesNotThrow(() => assertMessageSource(prior));
    assert.deepEqual([...assistantFloorTextVariants(foot, 0)], [head]);
    assert.deepEqual([...assistantFloorTextVariants(head, 0)], [body, foot]);
    assistant.mes = body;
    assert.throws(() => assertMessageSource(prior), /第0楼的原文已变化/);
    assistant.mes = marker + eol + foot;
    assert.throws(() => assertMessageSource(prior), /第0楼的原文已变化/);
  }
  assistant.mes = source[0].text + '\n（第1楼）';
  const wrong = continuationSource();
  assistant.mes = '（第1楼）\n' + source[0].text;
  assert.throws(() => assertMessageSource(wrong), /第0楼的原文已变化/);
});

test('续写起点的错楼号、重复标记、换行或真实正文变化均报出首个差异', () => {
  for (const rewrite of [t => '（第1楼）\n' + t, t => t + '\n（第0楼）', t => '（第0楼）' + t,
    t => '（第0楼）\n（第0楼）\n' + t, t => '（第0楼）\n ' + t, t => '（第0楼）\n' + t + '变了']) {
    const assistant = setupContinuation(), source = continuationSource();
    assistant.mes = rewrite(assistant.mes);
    assert.throws(() => assertMessageSource(source), /第0楼的原文已变化/);
  }
  const assistant = setupContinuation();
  const original = continuationSource();
  assistant.swipes[0] = '改写了起点的选中候选';
  assert.throws(() => assertMessageSource(original), /第0楼的选中候选文本已变化/);
  assistant.mes = '（第0楼）\n' + assistant.mes;
  const marked = continuationSource();
  assistant.mes = assistant.mes.replace('\n', '\r\n');
  assert.throws(() => assertMessageSource(marked), /第0楼的原文已变化/);
});

test('历史助手同一候选改字可继续，玩家编辑、切候选、删楼与追加照常检验', () => {
  const { assistant, user, chat, source } = setup();
  assistant.swipes[0] = '真实候选修改';
  assert.doesNotThrow(() => assertMessageSource(source));
  assistant.mes = '普通助手正文已改写';
  assert.doesNotThrow(() => assertMessageSource(source));
  user.mes = '（第1楼）\n' + user.mes;
  assert.throws(() => assertMessageSource(source), /第1楼的原文已变化/);
  user.mes = source[1].text;
  assistant.swipe_id = 1;
  assert.throws(() => assertMessageSource(source), /第0楼切换了候选/);
  assistant.swipe_id = 0;
  assistant.swipes[0] = source[0].candidate;
  user.is_user = false;
  assert.throws(() => assertMessageSource(source), /第1楼的发言身份已变化/);
  user.is_user = true;
  chat.pop();
  assert.throws(() => assertMessageSource(source), /第1楼已缺失/);
  chat.push(user, { mes: '新正文' });
  assert.doesNotThrow(() => assertMessageSource(source, 2));
  assert.doesNotThrow(() => assertMessageSource(source, undefined, true));
  assert.throws(() => assertMessageSource(source), /新增了第2楼/);
});
