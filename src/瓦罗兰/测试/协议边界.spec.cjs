const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../运行/message-protocol.ts');
const protocol = new Module(filename, module);
protocol.filename = filename;
protocol.paths = Module._nodeModulePaths(path.dirname(filename));
protocol._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { updateBlock } = protocol.exports;
const block = commands => `<UpdateVariable><JSONPatch>${JSON.stringify(commands)}</JSONPatch></UpdateVariable>`;
const command = value => [{ op: 'replace', path: '/玩家/称呼', value }];

for (const suffix of ['}', ']', ']}', '\n}\n', '} ] }', '\r\n}\t]\r\n']) {
  test('完整补丁数组后的冗余闭括号可恢复 ' + JSON.stringify(suffix), () => {
    const commands = command({ text: '引号"、反斜线\\与字面量 }]}', nested: [1, { value: '</JSONPatch>' }] });
    const json = JSON.stringify(commands) + suffix;
    const raw = `<UpdateVariable><JSONPatch>${json}</JSONPatch></UpdateVariable>`;
    assert.deepEqual(updateBlock(raw, true).commands, commands);
    assert.deepEqual(updateBlock(json).commands, commands);
    assert.deepEqual(updateBlock(`<UpdateVariable><JSONPatch>\n\`\`\`json\n${json}\n\`\`\`\n</JSONPatch></UpdateVariable>`, true).commands, commands);
    assert.equal(protocol.exports.stripProtocol('正文\n' + raw), '正文');
  });
}

for (const json of [
  '[{"op":"replace","path":"/玩家/称呼","value":"名字"},]',
  '[{"op":"replace","path":"/玩家/称呼","value":"名字"}}]',
  '[{"op":"replace","path":"/玩家/称呼","value":"截断',
  '[{"op":"replace","path":"/玩家/称呼","value":"名字"}',
  JSON.stringify(command('名字')) + '说明',
  JSON.stringify(command('名字')) + '//注释',
  JSON.stringify(command('名字')) + '\n' + JSON.stringify(command('第二段')),
  '[01]}',
]) test('其他语法修复继续报告原始JSON错误 ' + json.slice(-20), () => {
  let original;
  try { JSON.parse(json); } catch (error) { original = error; }
  assert(original instanceof SyntaxError);
  assert.throws(() => updateBlock(`<UpdateVariable><JSONPatch>${json}</JSONPatch></UpdateVariable>`, true),
    error => error instanceof SyntaxError && error.message === original.message);
});

test('多块和示例边界在尾括号修复后保持一致', () => {
  const first = command('第一条');
  const last = command('第二条');
  const faulty = block(last).replace('</JSONPatch>', '}</JSONPatch>');
  assert.deepEqual(updateBlock(block(first) + '\n块间正文\n' + faulty, true).commands, [...first, ...last]);
  assert.throws(() => updateBlock(block(first) + faulty.replace('}]}</JSONPatch>', '},]</JSONPatch>'), true), SyntaxError);
  for (const example of ['<thinking>' + faulty + '</thinking>', '`' + faulty + '`', '```xml\n' + faulty + '\n```',
    faulty.split('\n').map(line => '    ' + line).join('\n')]) {
    const text = example + '\n\n正文\n' + block(first);
    assert.deepEqual(updateBlock(text, true).commands, first);
    assert.equal(protocol.exports.storedNarrative(text), example + '\n\n正文');
  }
});

for (const [name, thought] of [
  ['外层包装', '<Interleaving><thinking>说明 <UpdateVariable> 和 <JSONPatch>。</thinking>'],
  ['嵌套同名', '<thinking>外层<thinking>示例 <UpdateVariable></thinking>外层说明</thinking>'],
  ['嵌套异名', '<thinking>外层<reasoning>示例 <UpdateVariable><think>内部 <JSONPatch></think></reasoning></thinking>'],
  ['非前置', '预设说明\n<reasoning>示例 <UpdateVariable>。</reasoning>'],
  ['嵌套后仍有示例', '<thinking>外层<thinking>内部</thinking>尾部示例 <UpdateVariable></thinking>'],
]) test('NX07：' + name + '完整思考不计入协议', () => {
  const commands = command('原值');
  assert.deepEqual(updateBlock(thought + block(commands) + '</Interleaving>').commands, commands);
});

for (const value of [
  '正文中的 <UpdateVariable> 字面内容',
  '</UpdateVariable> <UpdateVariable> <JSONPatch> [] </JSONPatch>',
  '<UpdateVariable><JSONPatch>[]</JSONPatch></UpdateVariable>',
  '转义引号："；反斜线：\\；标签：</JSONPatch>；中文与换行\n保留',
  { note: '<LifeCheck>{}</LifeCheck>', nested: ['<thinking>原文</thinking>', '</JSONPatch>'] },
]) test('NX07：JSON 字面标签与转义保持原值 ' + JSON.stringify(value).slice(0, 30), () => {
  const commands = command(value);
  const parsed = updateBlock(block(commands));
  assert.deepEqual(parsed.commands, commands);
  // Simulate MVU's tagged transport: the first closing tag must be the real boundary.
  const transported = parsed.block.match(/<JSONPatch>([\s\S]*?)<\/JSONPatch>/i)[1];
  assert.deepEqual(JSON.parse(transported), commands);
});

test('真实回执不被补丁字符串中的伪回执取代', () => {
  const commands = command('<LifeCheck>{"fake":{}}</LifeCheck>');
  const raw = block(commands).replace('</UpdateVariable>', '<LifeCheck>{"a":{"结果":"无变化","依据":"保持"}}</LifeCheck></UpdateVariable>');
  const parsed = updateBlock(raw);
  assert.deepEqual(parsed.commands, commands);
  assert(!parsed.block.includes('<LifeCheck>'), '旧附加内容不再重新输出到MVU传输');
});

for (const [open, close] of [
  ['<output><content>', '</content></output>'],
  ['<Interleaving data-preset="test">', '</Interleaving>'],
  ['<thinking>', '</thinking>'],
  ['<reasoning><answer>', '</answer></reasoning>'],
  ['<Analysis>预设包装说明\n', '</Analysis>'],
  ['```xml\n<response>', '</response>\n```'],
]) test('完整变量块可由预设包装：' + open, () => {
  const commands = command('包装内的实际更新');
  const parsed = updateBlock(open + block(commands) + close);
  assert.deepEqual(parsed.commands, commands);
  assert.equal(parsed.block, block(commands));
});

test('JSONPatch允许标签空白、属性和完整JSON代码围栏，不要求Analysis', () => {
  const commands = command('保留值');
  const raw = '<UpdateVariable preset="x"><JSONPatch format="json">\n```json\n' +
    JSON.stringify(commands) + '\n```\n</JSONPatch ></UpdateVariable >';
  assert.deepEqual(updateBlock(raw).commands, commands);
});

test('终端协议被预设包裹时保留正文标签，纯变量包装不伪装成正文', () => {
  const { stripProtocol, storedNarrative } = protocol.exports;
  assert.equal(stripProtocol('<answer>正文\n' + block([]) + '</answer>'), '<answer>正文</answer>');
  assert.equal(stripProtocol('<answer><details>' + block([]) + '</details></answer>'), '');
  assert.equal(storedNarrative('<answer>正文\n<StatusPlaceHolderImpl/>\n' + block([]) + '</answer>'),
    '<answer>正文\n<StatusPlaceHolderImpl/></answer>');
});

test('思考中的完整示例不覆盖正文外的实际更新', () => {
  const actual = command('实际更新');
  assert.deepEqual(updateBlock('<thinking>' + block(command('示例')) + '</thinking><answer>' +
    block(actual) + '</answer>').commands, actual);
});

test('合法空数组继续接受，内部损坏和多个根值继续报错', () => {
  assert.deepEqual(updateBlock(block([])).commands, []);
  for (const json of ['{}', '[{"op":"replace",}]', '[] {}', '{"op":"replace"}]'])
    assert.throws(() => updateBlock(`<UpdateVariable><JSONPatch>${json}</JSONPatch></UpdateVariable>`));
});

for (const raw of [
  '<UpdateVariable><JSONPatch>[]</UpdateVariable>',
  '<UpdateVariable><JSONPatch>{}</JSONPatch></UpdateVariable>',
  '<UpdateVariable><JSONPatch>[{"op":"replace",}]</JSONPatch></UpdateVariable>',
]) test('坏协议继续拒绝 ' + raw.slice(0, 55), () => assert.throws(() => updateBlock(raw)));

test('直接JSON、JSONPatch片段和多个完整段落按数据读取，不以变量块数量或外围标签阻断', () => {
  const first = command('先写入'), second = [{ op: 'replace', path: '/玩家/姓名', value: '再写入' }];
  assert.deepEqual(updateBlock(JSON.stringify(first)).commands, first);
  assert.deepEqual(updateBlock('<answer>' + JSON.stringify(first) + '</answer>').commands, first);
  assert.deepEqual(updateBlock('```json\n' + JSON.stringify(first) + '\n```').commands, first);
  assert.deepEqual(updateBlock('<JSONPatch>' + JSON.stringify(first) + '</JSONPatch>').commands, first);
  assert.deepEqual(updateBlock(block(first) + block(second)).commands, [...first, ...second]);
  assert.deepEqual(updateBlock(block(first) + '<UpdateVariable>').commands, first);
  assert.deepEqual(updateBlock('<thinking>未闭合 <UpdateVariable>' + block(first)).commands, first);
  assert.deepEqual(updateBlock('<UpdateVariable><JSONPatch>' + JSON.stringify(first) + '</JSONPatch>').commands, first);
});

test('保持旧准入边界：外围未闭合思考及多余结束标签不额外拒绝完整变量块', () => {
  for (const text of [
    '<thinking>普通思考未闭合\n' + block([]),
    block([]) + '\n<thinking>附加内容未闭合',
    '<thinking><think>原有不规范辅助标记</thinking>' + block([]),
    '</UpdateVariable>' + block([]),
    '<thinking 未完成的附加标记\n' + block([]),
    '<UpdateVariable></JSONPatch><JSONPatch>[]</JSONPatch></UpdateVariable>',
    '<UpdateVariable><JSONPatch>[]</JSONPatch></JSONPatch></UpdateVariable>',
    '<UpdateVariable><JSONPatch note="example"></JSONPatch ><JSONPatch>[]</JSONPatch></UpdateVariable>',
    '<UpdateVariable><JSONPatch>[]</JSONPatch><JSONPatch></UpdateVariable>',
    block([]).replace('</UpdateVariable>', '"</UpdateVariable><UpdateVariable>"</UpdateVariable>'),
  ]) assert.deepEqual(updateBlock(text).commands, []);
});

for (const literal of ['"</thinking>"', '`</thinking>`', '```xml\n</thinking>\n```'])
  test('思考内部引用的闭标签不提前结束思考 ' + literal, () => {
    const sample = command('示例'), actual = command('正式');
    const thought = '<thinking>引用闭标签 ' + (literal.startsWith('```') ? '\n' : '') + literal + '\n' + block(sample) + '</thinking>';
    const raw = thought + '\n正文。\n' + block(actual);
    assert.deepEqual(updateBlock(raw, true).commands, actual);
    assert.equal(protocol.exports.storedNarrative(raw, true), thought + '\n正文。');
  });

test('同次缺少正式块时不会把代码或完整思考示例作为fallback', () => {
  const sample = block(command('示例'));
  for (const raw of ['```xml\n' + sample + '\n```', '`' + sample + '`', '<thinking>' + sample + '</thinking>']) {
    assert.throws(() => updateBlock(raw, true), /缺少/);
    assert.equal(protocol.exports.storedNarrative(raw, true), raw);
  }
});

test('专用变量通道保留thought包装与JSONPatch内部json围栏及JSON中的字面闭标签', () => {
  const commands = command('</UpdateVariable> ` ``` </thinking>');
  for (const raw of [
    '<thinking>' + block(commands) + '</thinking>',
    '```xml\n' + block(commands) + '\n```',
    '<UpdateVariable><JSONPatch>\n```json\n' + JSON.stringify(commands) + '\n```\n</JSONPatch></UpdateVariable>',
    JSON.stringify(commands),
  ]) assert.deepEqual(updateBlock(raw).commands, commands);
});

test('专用裸JSON及其普通包装不从字符串值提取伪补丁', () => {
  const commands = command('说明 ' + block(command('字符串内的伪指令')) + ' 尾部');
  for (const raw of [JSON.stringify(commands), '<answer>' + JSON.stringify(commands) + '</answer>',
    '```json\n' + JSON.stringify(commands) + '\n```']) {
    assert.deepEqual(updateBlock(raw).commands, commands);
  }
  assert.throws(() => updateBlock(JSON.stringify({ value: block([]) })), /JSONPatch数组/);
});

test('思考内补丁字符串中的假闭标签不截断思考范围', () => {
  const thought = '<thinking>' + block(command('引用 </thinking> 字面值')) + '\n' +
    block(command('仍然是示例')) + '</thinking>';
  assert.deepEqual(updateBlock(thought + '\n正文\n' + block(command('正式')), true).commands, command('正式'));
});

for (const example of [
  '> ' + block(command('引用示例')),
  '> 示例\n>\n> ' + block(command('引用示例')),
  '- 列表引用\n\n  > ' + block(command('引用示例')),
  '    ' + block(command('缩进示例')),
]) test('正文投影保留引用或首行缩进，重复投影不改变其语义 ' + example.slice(0, 20), () => {
  const actual = command('正式');
  const input = example + '\n\n正文\n' + block(actual);
  assert.deepEqual(updateBlock(input, true).commands, actual);
  const stored = protocol.exports.storedNarrative(input, true);
  assert.equal(stored, example + '\n\n正文');
  assert.equal(protocol.exports.storedNarrative(stored, true), stored);
  assert.throws(() => updateBlock(example, true), /缺少/);
});

for (const intro of ['他看了一眼 6" 屏幕。\n', '他看了一眼 6" 屏幕。', '<thinking>6" 屏幕</thinking>\n'])
  test('正文英寸引号不吞正式标签 ' + intro, () => {
    const actual = command('正式');
    assert.deepEqual(updateBlock(intro + block(actual), true).commands, actual);
    assert.equal(protocol.exports.storedNarrative(intro + block(actual)), intro.trimEnd());
  });

test('同一行的英寸、对白示例和真正补丁各自保留边界', () => {
  const sample = block(command('JSON 中的 "引号"、</JSONPatch> 和 ' + block(command('内层样例'))));
  const actual = command('真正的 "称呼"');
  for (const story of [
    '他测到 6"。她读出 "示例：' + sample + '"，于是合上书。',
    '他测到 6"。她读出 “示例：' + sample + '”，于是合上书。',
  ]) {
    const raw = story + block(actual);
    assert.deepEqual(updateBlock(raw, true).commands, actual);
    assert.equal(protocol.exports.storedNarrative(raw, true), story);
  }
});

test('思考内仅有补丁时保持同次与独立入口各自的合同', () => {
  const patches = command('示例或独立通道实际命令');
  for (const tag of ['thinking', 'think', 'reasoning', 'Analysis']) {
    const wrapped = '<UpdateVariable><answer><' + tag + '><JSONPatch>' + JSON.stringify(patches) +
      '</JSONPatch></' + tag + '></answer></UpdateVariable>';
    assert.throws(() => updateBlock(wrapped, true), /缺少正式/);
    assert.deepEqual(updateBlock(wrapped).commands, patches);
  }
  assert.deepEqual(updateBlock('<UpdateVariable><answer>' + JSON.stringify(patches) + '</answer></UpdateVariable>', true).commands, patches);
  assert.deepEqual(updateBlock('<UpdateVariable>[]</UpdateVariable>', true).commands, []);
});

for (const malformed of [
  block(command('完整段')).replace('</UpdateVariable>', '<JSONPatch>' + JSON.stringify(command('缺闭标签')) + '</UpdateVariable>'),
  block(command('完整段')).replace('<JSONPatch>', '<JSONPatch>' + JSON.stringify(command('嵌套前遗留')) + '<JSONPatch>'),
  block(command('完整段')) + '<JSONPatch>' + JSON.stringify(command('尾部遗留')),
]) test('非空补丁没有闭合时不能只返回已完整的段落', () => {
  assert.throws(() => updateBlock(malformed), /JSONPatch.*未结束/);
  if (malformed.endsWith('</UpdateVariable>')) assert.throws(() => updateBlock('正文\n' + malformed, true), /JSONPatch.*未结束/);
});
