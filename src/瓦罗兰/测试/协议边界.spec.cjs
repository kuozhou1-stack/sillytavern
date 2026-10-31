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
  assert(parsed.block.includes('<LifeCheck>{"a"'));
});

test('合法空数组继续接受，原始 JSON 不自动修复', () => {
  assert.deepEqual(updateBlock(block([])).commands, []);
  for (const json of ['{}', '[{"op":"replace",}]', '[] {}', '{"op":"replace"}]'])
    assert.throws(() => updateBlock(`<UpdateVariable><JSONPatch>${json}</JSONPatch></UpdateVariable>`));
});

for (const raw of [
  block([]) + block([]),
  '<UpdateVariable><JSONPatch>[]</JSONPatch>',
  '<UpdateVariable><JSONPatch>[]</UpdateVariable>',
  '<thinking>未闭合 <UpdateVariable>' + block([]),
  block([]) + '<UpdateVariable>',
  block([]).replace('</UpdateVariable>', '"</UpdateVariable><UpdateVariable>"</UpdateVariable>'),
  '<UpdateVariable><JSONPatch>[]</JSONPatch><JSONPatch>[]</JSONPatch></UpdateVariable>',
  '[{"op":"replace","path":"/玩家/称呼","value":"裸JSON不接受"}]',
]) test('坏协议继续拒绝 ' + raw.slice(0, 55), () => assert.throws(() => updateBlock(raw)));

test('保持旧准入边界：外围未闭合思考及多余结束标签不额外拒绝完整变量块', () => {
  for (const text of [
    '<thinking>普通思考未闭合\n' + block([]),
    block([]) + '\n<thinking>附加内容未闭合',
    '<thinking><think>原有不规范辅助标记</thinking>' + block([]),
    '</UpdateVariable>' + block([]),
    '<thinking 未完成的附加标记\n' + block([]),
  ]) assert.deepEqual(updateBlock(text).commands, []);
});
