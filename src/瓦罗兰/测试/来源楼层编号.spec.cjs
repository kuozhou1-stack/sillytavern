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

test('独立 advice 跨过楼号时保留原有段落；编辑编号和正文之间的空行仍失效', () => {
  const { assistant } = setup();
  const advice = '<advice>同一建议</advice>';
  const archive = '（第0楼）\n\n正文';
  assistant.mes = advice + '\n\n' + archive;
  const prior = messageSource();
  assistant.mes = archive + '\n\n' + advice;
  assert.doesNotThrow(() => assertMessageSource(prior));
  const moved = messageSource();
  assistant.mes = '（第0楼）\n正文\n\n' + advice;
  assert.throws(() => assertMessageSource(moved), /第0楼的原文已变化/);
});

test('预设在最后一个完整 planning 块的边界写入楼号，正反向校验都能复原', () => {
  const { assistant } = setup();
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
    const original = messageSource();
    assistant.mes = numbered;
    assert.doesNotThrow(() => assertMessageSource(original));
    const after = messageSource();
    assistant.mes = bare;
    assert.doesNotThrow(() => assertMessageSource(after));
  }
  assistant.mes = header + '\n正文';
  const before = messageSource();
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
    const original = messageSource();
    assistant.mes = incomplete + '\n' + marker + '\n正文';
    assert.throws(() => assertMessageSource(original), /第0楼的原文已变化/);
  }
});

test('已有的独立尾号可在同一助手楼移到开头，回复哈希兼容形式保留正文原字节', () => {
  const { assistant, source } = setup();
  const { assistantFloorTextVariants } = require('../运行/request-source.ts');
  for (const eol of ['\n', '\r\n']) {
    const body = '开头\r\n\n正文末尾有空格 ';
    const marker = '（第0楼）';
    const foot = body + eol + marker, head = marker + eol + body;
    assistant.mes = foot;
    const prior = messageSource();
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
  const wrong = messageSource();
  assistant.mes = '（第1楼）\n' + source[0].text;
  assert.throws(() => assertMessageSource(wrong), /第0楼的原文已变化/);
});

test('错楼号、标记位置、重复标记、换行或真实正文变化均报出首个差异', () => {
  for (const rewrite of [t => '（第1楼）\n' + t, t => t + '\n（第0楼）', t => '（第0楼）' + t,
    t => '（第0楼）\n（第0楼）\n' + t, t => '（第0楼）\n ' + t, t => '（第0楼）\n' + t + '变了']) {
    const { assistant, source } = setup();
    assistant.mes = rewrite(assistant.mes);
    assert.throws(() => assertMessageSource(source), /第0楼的原文已变化/);
  }
  const { assistant, user, source } = setup();
  assistant.mes = '（第0楼）\n' + assistant.mes;
  const marked = messageSource();
  assistant.mes = assistant.mes.replace('\n', '\r\n');
  assert.throws(() => assertMessageSource(marked), /第0楼的原文已变化/);
  user.mes = '（第1楼）\n' + user.mes;
  assert.throws(() => assertMessageSource(source), /第1楼的原文已变化/);
});

test('候选编辑、切换、角色、删楼及追加有各自原因，回复楼和前缀边界仍有效', () => {
  const { assistant, user, chat, source } = setup();
  assistant.swipes[0] = '真实候选修改';
  assert.throws(() => assertMessageSource(source), /第0楼的选中候选文本已变化/);
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
