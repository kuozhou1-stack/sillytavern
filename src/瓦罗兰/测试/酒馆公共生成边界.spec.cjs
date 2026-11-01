const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript'), assert = require('node:assert/strict'), { test } = require('node:test');
const tavern = path.resolve(__dirname, '../../../../SillyTavern');
const sourceRoot = path.join(tavern, 'public/scripts/extensions/third-party/JS-Slash-Runner/src/function/generate');
function load(name, imports, extra = '', globals = {}) {
  const source = fs.readFileSync(path.join(sourceRoot, name), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(code + '\n' + extra, { exports, require: name => imports[name] ?? {},
    _: require('lodash'), console, $: () => ({ is: () => true }), ...globals });
  return exports;
}
function emitter() {
  const context = { console: { debug() {}, trace() {}, error() {} }, localStorage: { getItem: () => null } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(tavern, 'public/lib/eventemitter.js'), 'utf8')
    .replace('export { EventEmitter }', ''), context);
  return new context.EventEmitter();
}

test('generateRaw等待实际异步过滤结果，过滤异常保持可见', async () => {
  const prompts = {
    a: { value: 'INCLUDE', position: 0, depth: 0, role: 0, filter: async () => true },
    b: { value: 'EXCLUDE', position: 0, depth: 0, role: 0, filter: async () => false },
  };
  const raw = load('generateRaw.ts', { '@sillytavern/script': { extension_prompts: prompts,
    extension_prompt_types: { IN_PROMPT: 0 }, substituteParams: value => value } },
    'exports.filterPrompts = filteredGetExtensionPrompt;');
  assert.equal(await raw.filterPrompts(0, 0, '\n', 0, false), 'INCLUDE');
  prompts.b.filter = async () => { throw Error('filter failed'); };
  await assert.rejects(raw.filterPrompts(0, 0, '\n', 0, false), /filter failed/);
});

test('世界书处理成功和失败都会释放临时用户提示词', async () => {
  for (const fail of [false, true]) {
    let temporary = '';
    const data = load('dataProcessor.ts', {
      '@/function/generate/utils': { isPromptFiltered: () => true, parseMesExamples: () => [],
        addTemporaryUserMessage: value => { temporary = value; }, removeTemporaryUserMessage: () => { temporary = ''; },
        clearInjectionPrompts: async () => {} },
      '@sillytavern/script': { characters: [{}], this_chid: 0, baseChatReplace: value => value ?? '',
        getCharacterCardFields: () => ({}), getBiasStrings: () => ({ promptBias: '' }), getMaxContextSize: () => 32000 },
      '@sillytavern/scripts/openai': { setOpenAIMessageExamples: () => [] },
      '@sillytavern/scripts/world-info': { getWorldInfoPrompt: async () => {
        if (fail) throw Error('worldbook failed');
        return { worldInfoBefore: '', worldInfoAfter: '', worldInfoDepth: [], worldInfoExamples: [] };
      } },
    });
    const operation = data.prepareAndOverrideData({ overrides: { chat_history: [] } }, 'REQUEST_INPUT');
    if (fail) await assert.rejects(operation, /worldbook failed/); else await operation;
    assert.equal(temporary, '');
  }
});

test('once支持按原函数移除，emit等待异步once完成', async () => {
  const events = emitter(); let called = 0;
  const original = () => { called++; };
  events.once('event', original); events.removeListener('event', original);
  await events.emit('event'); assert.equal(called, 0);
  let release, finished = false;
  const gate = new Promise(resolve => { release = resolve; });
  events.once('event', async () => { await gate; finished = true; });
  const emitted = events.emit('event');
  assert.equal(finished, false); release(); await emitted;
  assert.equal(finished, true); assert.equal(events.events.event.length, 0);
});

function responseModule(events, send) {
  return load('responseGenerator.ts', {
    '@/function/generate/toolCallCompat': { resolveToolCallSource: () => 'openai', isSupportedToolCallSource: () => true,
      hasToolCallRequestOptions: () => false, normalizeRequestToolOptionsForSource: (_source, options) => ({ toolOptions: options, warnings: [] }),
      extractToolCallsForSupportedSources: () => null, extractReasoningSignatureForSupportedSources: () => null },
    '@/function/generate/types': { createGenerateResult: content => content },
    '@/function/generate/utils': { clearInjectionPrompts: async () => {}, extractMessageFromData: data => data.content },
    '@sillytavern/script': { eventSource: events, event_types: { CHAT_COMPLETION_SETTINGS_READY: 'settings' } },
    '@sillytavern/scripts/openai': { oai_settings: { chat_completion_source: 'openai' }, sendOpenAIRequest: send },
    '@sillytavern/scripts/reasoning': { extractReasoningFromData: () => '' },
  });
}

test('主连接的生成参数只注入自己的请求，并发完成或失败后不遗留监听器', async () => {
  const events = emitter(), a = [{ content: 'A' }], b = [{ content: 'B' }], payloads = [];
  let release; const gate = new Promise(resolve => { release = resolve; });
  const response = responseModule(events, async (_type, messages) => {
    if (messages[0].content === 'A') await gate;
    // createGenerationParameters keeps message objects but copies their array.
    const payload = { messages: messages.filter(message => message && typeof message === 'object') };
    await events.emit('settings', payload); payloads.push(payload);
    return { content: 'ok' };
  });
  const options = id => ({ tools: [{ type: 'function', function: { name: id } }] });
  const first = response.generateResponse({ prompt: a }, false, 'a', undefined, new AbortController(), undefined, options('A'));
  await response.generateResponse({ prompt: b }, false, 'b', undefined, new AbortController(), undefined, options('B'));
  release(); await first;
  assert.equal(payloads[0].tools[0].function.name, 'B');
  assert.equal(payloads[1].tools[0].function.name, 'A');
  assert.equal(events.events.settings.length, 0);
  const failed = responseModule(events, async () => { throw Error('before settings'); });
  await assert.rejects(failed.generateResponse({ prompt: [] }, false, 'failed', undefined, new AbortController()), /before settings/);
  assert.equal(events.events.settings.length, 0);
});

test('主连接并发复用同一提示词时仍分别注入工具与Schema', async () => {
  const events = emitter(), prompt = [{ role: 'user', content: 'same prompt' }], payloads = [];
  let release, calls = 0; const gate = new Promise(resolve => { release = resolve; });
  const response = responseModule(events, async (_type, messages) => {
    if (++calls === 1) await gate;
    const payload = { messages: messages.filter(message => message && typeof message === 'object') };
    await events.emit('settings', payload); payloads.push(payload);
    return { content: 'ok' };
  });
  const options = name => ({ tools: [{ type: 'function', function: { name } }] });
  const schema = name => ({ name, value: { type: 'object' } });
  const first = response.generateResponse({ prompt }, false, 'first', undefined, new AbortController(), undefined, options('A'), schema('A'));
  await response.generateResponse({ prompt }, false, 'second', undefined, new AbortController(), undefined, options('B'), schema('B'));
  release(); await first;
  assert.deepEqual(payloads.map(payload => payload.tools[0].function.name), ['B', 'A']);
  assert.deepEqual(payloads.map(payload => payload.json_schema.name), ['B', 'A']);
  assert(payloads.every(payload => payload.include_reasoning === true));
  assert.notEqual(payloads[0].messages[0], payloads[1].messages[0]);
  assert.deepEqual(prompt, [{ role: 'user', content: 'same prompt' }]);
  assert.equal(events.events.settings.length, 0);
});

test('预设路径允许清空临时场景，并在成功或失败后恢复原来的空场景', async () => {
  for (const [original, override, fail] of [['', 'temporary', false], ['', 'temporary', true], ['original', '', false]]) {
    const character = { scenario: original };
    const generate = load('generate.ts', { '@sillytavern/script': { characters: [character], this_chid: 0 },
      '@sillytavern/scripts/extensions': { getContext: () => ({ extensionPrompts: {} }) },
      '@sillytavern/scripts/openai': { prepareOpenAIMessages: async () => {
        assert.equal(character.scenario, override);
        if (fail) throw Error('preset failed');
        return [[]];
      } } });
    const operation = generate.handlePresetPath({ chatContext: { oaiMessages: [] }, characterInfo: {}, worldInfo: {} },
      '', { overrides: { scenario: override } });
    if (fail) await assert.rejects(operation, /preset failed/); else await operation;
    assert.equal(character.scenario, original);
  }
});
