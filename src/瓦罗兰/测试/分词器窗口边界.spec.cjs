const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { test } = require('node:test'), assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '..'), tavern = path.resolve(__dirname, '../../../../SillyTavern');
const nativeAst = ts.createSourceFile('openai.js', fs.readFileSync(path.join(tavern, 'public/scripts/openai.js'), 'utf8'),
  ts.ScriptTarget.Latest, true);
const handlerClass = nativeAst.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'TokenHandler');
const TokenHandler = vm.runInNewContext('(' + handlerClass.getText(nativeAst) + ')');
const managerAst = ts.createSourceFile('PromptManager.js', fs.readFileSync(path.join(tavern, 'public/scripts/PromptManager.js'), 'utf8'),
  ts.ScriptTarget.Latest, true);
const managerClass = managerAst.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'PromptManager');
const getter = managerClass.members.find(node => node.name?.getText(managerAst) === 'getTokenHandler');
const getTokenHandler = vm.runInNewContext('({' + getter.getText(managerAst) + '})').getTokenHandler;
const snapshot = value => JSON.parse(JSON.stringify(value));

function fixture(counter = async () => 10) {
  const handler = new TokenHandler(counter), imports = [];
  const settings = { max_context: 1000, max_completion_tokens: 10 };
  const scope = { builtin: { promptManager: { tokenHandler: handler, getTokenHandler } },
    getPreset: () => ({ settings }), URL,
    window: { parent: { location: { href: 'http://tokenizer-realm.invalid/' } } } };
  function load(file = path.join(root, '运行/worker-task.ts')) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, { ...scope, exports, require: name => {
      imports.push(name);
      throw ReferenceError("Cannot access 'SlashCommandParser' before initialization");
    } });
    return exports.assertFinalPromptBudget;
  }
  return { handler, imports, settings, scope, load };
}

test('已有原生计数函数可直接复用，不在角色窗口导入酒馆模块', async () => {
  const e = fixture();
  const payload = { messages: [{ role: 'user', content: '窗口边界合成输入' }] };
  const result = await e.load()(payload);
  assert.equal(result.inputTokens, 13);
  assert.deepEqual(e.imports, []);
});

test('逐消息及工具使用原函数，保持合法边界且不修改提示词和宿主统计', async () => {
  const seen = [], values = [41, 17, 9];
  const e = fixture(async message => { seen.push(snapshot(message)); return values[(seen.length - 1) % 3]; });
  const payload = { messages: [
    { role: 'assistant', content: null, tool_calls: [{ id: 'call-a', function: { name: 'test', arguments: '{}' } }] },
    { role: 'tool', content: '合成工具结果', tool_call_id: 'call-a' },
  ], tools: [{ type: 'function', function: { name: 'test' } }], max_tokens: 10 };
  const original = snapshot(payload), counts = snapshot(e.handler.getCounts());
  e.settings.max_context = 80;
  assert.equal((await e.load()(payload)).inputTokens, 70);
  assert.deepEqual(seen, [...payload.messages, { role: 'system', content: JSON.stringify(payload.tools) }]);
  assert.deepEqual(snapshot(e.handler.getCounts()), counts, '不经会累加界面统计的 countAsync 包装器');
  assert.deepEqual(payload, original);
  e.settings.max_context = 79;
  await assert.rejects(e.load()(payload), /输入约 70 tokens.*上下文 79/);
});

test('原生分词异常按原错误传递，不用默认计数继续请求', async () => {
  const error = Error('synthetic tokenizer failure');
  const e = fixture(async () => { throw error; });
  await assert.rejects(e.load()({ messages: [{ role: 'user', content: '合成输入' }] }), actual => actual === error);
  assert.deepEqual(e.imports, []);
});

test('计数无需访问子窗口模块加载或执行其他代码', async () => {
  const e = fixture();
  e.scope.window = new Proxy({}, { get() { throw Error('不应访问窗口模块加载'); } });
  assert.equal((await e.load()({ messages: [{ role: 'system', content: '合成任务' }] })).inputTokens, 13);
});

test('异步原生计数完成前不会提前确认预算', async () => {
  let release, settled = false;
  const gate = new Promise(resolve => { release = resolve; });
  const e = fixture(async () => { await gate; return 10; });
  const pending = e.load()({ messages: [{ role: 'user', content: '等待计数' }] }).then(result => {
    settled = true; return result;
  });
  await Promise.resolve(); await Promise.resolve(); assert.equal(settled, false);
  release(); assert.equal((await pending).inputTokens, 13);
});
