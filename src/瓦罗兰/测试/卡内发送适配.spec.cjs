const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);
const { sendResponse } = require('../运行/generation/response.ts');
const { ApiProviderError } = require('../运行/generation/provider-error.ts');
const tavern = path.resolve(__dirname, '../../../../SillyTavern/public');
function declaration(file, name) {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(tavern, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  for (const node of source.statements) {
    if (node.name?.text === name) return node.getText(source).replace(/^export\s+/, '');
    if (ts.isVariableStatement(node)) {
      const entry = node.declarationList.declarations.find(item => item.name.getText(source) === name);
      if (entry) return `const ${entry.getText(source)};`;
    }
  }
  throw Error(`Native declaration not found: ${name}`);
}
const nativeCode = [
  declaration('scripts/openai.js', 'chat_completion_sources'),
  declaration('scripts/openai.js', 'createGenerationParameters'),
  declaration('scripts/openai.js', 'getStreamingReply'),
  declaration('scripts/sse-stream.js', 'EventSourceStream'),
  declaration('scripts/custom-request.js', 'ChatCompletionService'),
].join('\n');
function environment() {
  const sent = [], events = [], biasRequests = [];
  const settings = {
    chat_completion_source: 'openai', openai_model: 'gpt-4o', google_model: 'gemini-fixture',
    stream_openai: false, n: 1, temp_openai: 0.7, freq_pen_openai: 0, pres_pen_openai: 0,
    top_p_openai: 1, openai_max_tokens: 1000, bias_presets: {}, reverse_proxy: '', proxy_password: '',
  };
  const state = {
    sent, events, biasRequests, settings, stops: [],
    response: async payload => payload.stream
      ? new Response(['data: {"choices":[{"delta":{"content":"甲"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"乙","reasoning":"思考"}}]}\n\n', 'data: [DONE]\n\n'].join(''))
      : Response.json({ choices: [{ message: { content: '回包-' + payload.model } }] }),
    toolPause: async () => {},
  };
  const fetch = async (url, options) => {
    const payload = JSON.parse(options.body);
    if (url.includes('/bias?')) { biasRequests.push({ url, payload, signal: options.signal }); return Response.json({ token: payload[0].value }); }
    sent.push(payload);
    return state.response(payload, options);
  };
  const context = vm.createContext({
    fetch, Response, AbortController, TextDecoderStream, TransformStream, MessageEvent,
    getRequestHeaders: () => ({ 'x-fixture': 'true' }), getCustomStoppingStrings: limit => state.stops.slice(0, limit),
    substituteParams: text => text,
    getGroupNames: () => [], getReasoningEffort: () => '', getVerbosity: () => '',
    name1: '玩家', name2: '角色', openai_max_stop_strings: 4, power_user: {}, oai_settings: settings,
    ToolManager: { canPerformToolCalls: () => true, registerFunctionToolsOpenAI: async () => state.toolPause() },
    calculateLogitBias: () => { throw Error('Shared bias cache path used'); },
    validateReverseProxy: () => { throw Error('Shared proxy validator used'); },
    tryParseStreamingError: (_response, text) => { const data = JSON.parse(text); if (data.error) throw Error(data.error.message); },
    isDataURL: () => true,
  });
  vm.runInContext(nativeCode + '\nthis.api = { createGenerationParameters, ChatCompletionService };', context);
  const native = {
    powerUser: { getCustomStoppingStrings: () => [...state.stops] },
    host: { fetch },
    script: {
      substituteParams: text => text,
      getRequestHeaders: () => ({}), extractMessageFromData: data => data.choices[0].message.content,
      cleanUpMessage: ({ getMessage }) => getMessage,
      eventSource: { emit: async (...args) => events.push(args), once: () => { throw Error('Shared once used'); } },
    },
    openai: { oai_settings: settings, proxies: [], getChatCompletionModel: s => s.chat_completion_source === 'makersuite' ? s.google_model : s.openai_model,
      createGenerationParameters: context.api.createGenerationParameters },
    customRequest: { ChatCompletionService: context.api.ChatCompletionService },
    tokenizers: { getTokenizerModel: () => settings.openai_model },
  };
  return { ...state, native, state };
}
const signal = () => new AbortController().signal;
const messages = [{ role: 'user', content: '继续' }];

test('导入的 Vertex 请求使用本配置的短令牌与结构化参数，并隔离酒馆主代理', async t => {
  const vertex = require('../运行/vertex.ts');
  const profile = { projectId: 'fixture-project', region: 'global', vertexCredentialId: 'fixture-reference' };
  const config = vertex.vertexConnection({ ...profile, model: 'gemini-future' });
  const url = 'https://aiplatform.googleapis.com/v1/projects/fixture-project/locations/global/endpoints/openapi';
  const fixtureToken = 'fixture-access-token';
  t.mock.method(vertex, 'vertexTransport', async (received, model, signal) => {
    assert.deepEqual(received, { ...profile, vertexThinkingLevel: 'default' });
    assert.equal(signal.aborted, false);
    return { url, model: 'google/' + model, key: fixtureToken };
  });
  const e = environment();
  Object.assign(e.settings, { reverse_proxy: 'https://main.invalid', proxy_password: 'other-provider' });
  const schema = { name: 'fixture', value: { type: 'object', properties: {} } };
  await sendResponse(e.native, messages, { custom_api: config, json_schema: schema }, signal());
  const [out] = e.sent;
  assert.equal(out.custom_url, url);
  assert.equal(out.model, 'google/gemini-future');
  assert.equal(out.chat_completion_source, 'custom');
  assert.deepEqual(out.json_schema, schema);
  assert.equal(out.custom_include_body, undefined);
  assert.equal(out.reasoning_effort, undefined);
  assert.deepEqual(JSON.parse(out.custom_include_headers), { Authorization: 'Bearer ' + fixtureToken });
  assert(!JSON.stringify(out).includes('other-provider'));
  assert(!JSON.stringify(config).includes(fixtureToken));
  e.state.response = async () => Response.json({ error: { message: '拒绝 ' + fixtureToken } }, { status: 403 });
  await assert.rejects(sendResponse(e.native, messages, { custom_api: config }, signal()), /拒绝 \[密钥已隐藏\]/);
});

test('Vertex 思考档位遵循模型能力，实际连接携带一次档位且不改变模型 ID', async t => {
  const vertex = require('../运行/vertex.ts');
  t.mock.method(vertex, 'vertexTransport', async (_profile, model) => ({ url: 'https://fixture.invalid', model: 'google/' + model, key: 'fixture' }));
  const profile = { projectId: 'p', region: 'global', vertexCredentialId: 'fixture' };
  const e = environment();
  for (const [model, level, expected] of [
    ['gemini-3.1-pro-preview', 'medium', { extra_body: { google: { thinking_config: { thinking_level: 'MEDIUM' } } } }],
    ['gemini-3.8-flash', 'low', { extra_body: { google: { thinking_config: { thinking_level: 'LOW' } } } }],
    ['gemini-3.5-flash-lite', 'minimal', { extra_body: { google: { thinking_config: { thinking_level: 'MINIMAL' } } } }],
    ['gemini-4-neon', 'xhigh', { extra_body: { google: { thinking_config: { thinking_level: 'XHIGH' } } } }],
    ['gemini-2.5-pro', 'high', { reasoning_effort: 'high' }],
  ]) {
    const custom_api = vertex.vertexConnection({ ...profile, model, vertexThinkingLevel: level });
    await sendResponse(e.native, messages, { custom_api }, signal());
    const out = e.sent.at(-1);
    assert.deepEqual(JSON.parse(out.custom_include_body), expected);
    assert.equal(out.model, 'google/' + model);
    assert.equal(out.reasoning_effort, undefined);
    if (model === 'gemini-3.8-flash' || model === 'gemini-4-neon') {
      for (const key of ['top_k', 'top_p', 'temperature', 'presence_penalty', 'frequency_penalty']) assert.equal(out[key], undefined);
    }
  }
  assert.deepEqual(vertex.vertexThinkingLevels('publishers/google/models/gemini-4-argon-cyber-permissive'), ['default','low','medium','high']);
  assert.deepEqual(vertex.vertexThinkingLevels('google/gemini-3.1-pro-preview-customtools'), ['default','low','medium','high']);
  assert.deepEqual(vertex.vertexThinkingLevels('gemini-4-hydrogen'), ['default','low','medium','high','xhigh']);
  assert.deepEqual(vertex.vertexThinkingLevels('new-provider-model-high'), ['default']);
  const custom_api = vertex.vertexConnection({ ...profile, model: 'gemini-3.8-flash', vertexThinkingLevel: 'minimal' });
  await assert.rejects(sendResponse(e.native, messages, { custom_api }, signal()), /不支持 minimal/);
  assert.equal(e.sent.length, 5);
});

test('停止词快照遵守固定原生渠道数量长度及模型禁用规则', async () => {
  for (const [source, model] of [
    ['openai', 'gpt-4o'], ['openai', 'gpt-4-vision'], ['openai', 'o3'],
    ['openai', 'gpt-5.2'], ['openai', 'gpt-5-chat-latest'], ['openrouter', 'openai/o3'],
    ['makersuite', 'gemini'], ['vertexai', 'gemini'], ['claude', 'claude'],
    ['mistralai', 'mistral'], ['custom', 'custom'], ['cohere', 'command-r'],
    ['chutes', 'model'], ['perplexity', 'sonar'], ['zai', 'glm'],
    ['xai', 'grok-4'], ['xai', 'grok-4-fast-non-reasoning'], ['xai', 'grok-3-mini'],
  ]) {
    const e = environment();
    e.settings.chat_completion_source = source;
    e.settings.openai_model = model;
    e.settings.google_model = model;
    e.settings.assistant_prefill = '';
    e.settings.zai_endpoint = 'common';
    e.state.stops = ['ONE', '超过渠道十六字符长度的停止字符串_EXCEEDS_LIMIT', 'THREE', 'FOUR', 'FIVE', 'SIX'];
    const snapshot = [...e.state.stops];
    const expected = await e.native.openai.createGenerationParameters(e.settings, model, 'normal', structuredClone(messages));
    e.state.stops = [];
    await sendResponse(e.native, messages, {}, signal(), { stoppingStrings: snapshot });
    assert.deepEqual(e.sent[0].stop, expected.generate_data.stop ? [...expected.generate_data.stop] : undefined, source + '/' + model);
  }
  const e = environment();
  e.state.stops = ['NEW_STOP'];
  await sendResponse(e.native, messages, {}, signal(), { stoppingStrings: [] });
  assert(!Object.hasOwn(e.sent[0], 'stop'));
});

test('EJS公开接口使用本次消息上下文，尊重关闭状态，失败不发送', async () => {
  const e = environment();
  const contexts = [];
  const features = { enabled: true, generate_enabled: true };
  e.native.host.EjsTemplate = {
    getFeatures: () => features,
    prepareContext: async context => { contexts.push(context); return context; },
    evalTemplate: async (text, context) => {
      assert.equal(context, contexts.at(-1));
      return text.replace('<%= 2 + 3 %>', '5');
    },
  };
  const input = [{ role: 'user', content: '<%= 2 + 3 %>' },
    { role: 'system', content: [{ type: 'text', text: '<%= 2 + 3 %>' }] }];
  await sendResponse(e.native, input, {}, signal());
  assert.equal(e.sent[0].messages[0].content, '5');
  assert.equal(e.sent[0].messages[1].content[0].text, '5');
  assert.equal(input[0].content, '<%= 2 + 3 %>');
  assert.equal(contexts[0].generateData[0].content, '5');
  assert.equal(typeof contexts[0].runID, 'number');
  features.generate_enabled = false;
  await sendResponse(e.native, input, {}, signal());
  assert.equal(e.sent[1].messages[0].content, '<%= 2 + 3 %>');
  features.generate_enabled = true;
  const error = Error('template-failed');
  e.native.host.EjsTemplate.evalTemplate = async () => { throw error; };
  await assert.rejects(sendResponse(e.native, input, {}, signal()), caught => caught === error);
  assert.equal(e.sent.length, 2);
});

test('开启模板沙盒时普通文本和附件可发送，含模板的文本不进入无沙盒求值', async () => {
  const e = environment();
  const features = { enabled: true, generate_enabled: true, sandbox: true };
  let evaluations = 0;
  e.native.host.EjsTemplate = {
    getFeatures: () => features, prepareContext: async value => value,
    evalTemplate: () => { evaluations++; return 'expanded'; },
  };
  const attachment = { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } };
  const plain = [{ role: 'user', content: [{ type: 'text', text: '继续' }, attachment] }];
  await sendResponse(e.native, plain, {}, signal());
  assert.deepEqual(e.sent[0].messages, plain);
  const template = [{ role: 'user', content: [attachment, { type: 'text', text: '<%= 2+3 %>' }] }];
  await assert.rejects(sendResponse(e.native, template, {}, signal()), /沙盒/);
  features.sandbox = false;
  e.native.host.EjsTemplate.prepareContext = async value => { features.sandbox = true; return value; };
  await assert.rejects(sendResponse(e.native, template, {}, signal()), /沙盒/);
  assert.equal(evaluations, 0);
  assert.equal(e.sent.length, 1);
});

test('嵌套 EJS 请求各自有数字运行编号，同一请求内各段共用编号', async () => {
  const e = environment();
  const first = [{ role: 'user', content: '父<% %>' }, { role: 'system', content: '续<% %>' }];
  const child = [{ role: 'user', content: '子<% %>' }];
  const ids = {};
  e.native.host.EjsTemplate = {
    getFeatures: () => ({ enabled: true, generate_enabled: true, sandbox: false }),
    prepareContext: async ctx => ctx,
    evalTemplate: async (text, ctx) => {
      ids[text[0]] = ctx.runID;
      if (text.startsWith('父')) await sendResponse(e.native, child, {}, signal());
      return String(ctx.runID);
    },
  };
  await sendResponse(e.native, first, {}, signal());
  assert.equal(typeof ids.父, 'number');
  assert.equal(typeof ids.子, 'number');
  assert.notEqual(ids.子, ids.父);
  assert.equal(ids.续, ids.父);
  assert.deepEqual(e.sent.map(row => row.messages.map(m => m.content)), [[String(ids.子)], [String(ids.父), String(ids.父)]]);
});

test('卡内发送沿原生参数构造及自定义请求，主连接不注册共享once', async () => {
  const e = environment();
  const schema = { name: 'fixture', value: { type: 'object' }, strict: true };
  assert.equal(await sendResponse(e.native, messages, { generation_id: 'main', json_schema: schema }, signal()), '回包-gpt-4o');
  assert.deepEqual(e.sent[0].json_schema, schema);
  assert.equal(e.sent[0].temperature, 0.7);
  assert.equal(e.sent[0].include_reasoning, true);
  assert.equal(e.events.length, 0);
  assert.equal(e.settings.reverse_proxy, '');
});

for (const samePrompt of [false, true]) test(`并发${samePrompt ? '共用' : '独立'}提示词的模型、结构化合同与tools属于各自请求`, async () => {
  const e = environment();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  let count = 0;
  e.state.toolPause = async () => { if (++count === 1) { entered(); await gate; } };
  const first = sendResponse(e.native, messages, { generation_id: 'a', json_schema: { name: 'a', value: {} },
    tools: [{ type: 'function', function: { name: 'a', parameters: {} } }] }, signal());
  await started;
  e.settings.openai_model = 'gpt-4.1';
  const secondMessages = samePrompt ? messages : [{ role: 'user', content: '另一条输入' }];
  const second = await sendResponse(e.native, secondMessages, { generation_id: 'b', json_schema: { name: 'b', value: {} },
    tools: [{ type: 'function', function: { name: 'b', parameters: {} } }] }, signal());
  release();
  assert.equal(await first, '回包-gpt-4o');
  assert.equal(second, '回包-gpt-4.1');
  assert.deepEqual(e.sent.map(payload => payload.messages), [secondMessages, messages]);
  assert.deepEqual(messages, [{ role: 'user', content: '继续' }]);
  assert.deepEqual(e.sent.map(p => [p.model, p.json_schema.name, p.tools?.[0]?.function.name]), [
    ['gpt-4.1', 'b', 'b'], ['gpt-4o', 'a', 'a'],
  ]);
  assert.equal(e.events.length, 0);
});

test('显式准备快照保留本次预设、bias与代理，不读共享缓存及代理确认', async () => {
  const e = environment();
  const settings = { ...e.settings, reverse_proxy: 'https://proxy.invalid', proxy_password: 'fixture-password',
    bias_preset_selected: 'a', bias_presets: { a: [{ text: '甲', value: 7 }] } };
  e.settings.openai_model = 'changed-ui-model';
  await sendResponse(e.native, messages, {}, signal(), { settings, tokenizerModel: 'snapshot-tokenizer' });
  assert.equal(e.sent[0].model, 'gpt-4o');
  assert.equal(e.sent[0].reverse_proxy, 'https://proxy.invalid');
  assert.equal(e.sent[0].proxy_password, 'fixture-password');
  assert.deepEqual(e.sent[0].logit_bias, { token: 7 });
  assert(e.biasRequests[0].url.endsWith('model=gpt-4o')); 
  assert.equal(e.settings.reverse_proxy, '');
});

for (const source of ['openai', 'makersuite']) test('副连接继承预设并保留本次端点、密钥和模型 ' + source, async () => {
  const e = environment();
  await sendResponse(e.native, messages, { custom_api: { source, apiurl: 'https://fixture.invalid/v1/', key: 'fixture-key', model: 'custom-model' } }, signal());
  const payload = e.sent[0];
  assert.equal(payload.chat_completion_source, source);
  assert.equal(payload.model, 'custom-model');
  assert.equal(payload.reverse_proxy, 'https://fixture.invalid/v1');
  assert.equal(payload.proxy_password, 'fixture-key');
  assert.equal(e.settings.chat_completion_source, 'openai');
});

test('流式沿原生SSE与渠道解析，发送带本次id的完整及增量事件', async () => {
  const e = environment();
  assert.equal(await sendResponse(e.native, messages, { should_stream: true, generation_id: 'stream-a' }, signal()), '甲乙');
  assert.deepEqual(e.events.filter(x => x[0] === 'js_stream_token_received_fully'), [
    ['js_stream_token_received_fully', '甲', 'stream-a'], ['js_stream_token_received_fully', '甲乙', 'stream-a'],
  ]);
  assert.deepEqual(e.events.filter(x => x[0] === 'js_stream_token_received_incrementally').map(x => x[1]), ['甲', '乙']);
  assert(!e.events.some(x => /settings_ready|generation_(started|ended)/.test(x[0])));
});

test('错误及取消清楚传播，后续请求不继承失败参数', async () => {
  const e = environment();
  e.state.response = async () => Response.json({ error: { message: 'fixture failure' } }, { status: 400 });
  await assert.rejects(sendResponse(e.native, messages, { json_schema: { name: 'failed', value: {} } }, signal()), /fixture failure/);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(sendResponse(e.native, messages, {}, abort.signal), /abort/i);
  assert.equal(e.sent.length, 1);
  e.state.response = async () => Response.json({ choices: [{ message: { content: '恢复' } }] });
  assert.equal(await sendResponse(e.native, messages, {}, signal()), '恢复');
  assert.equal(e.sent[1].json_schema, undefined);
  assert.equal(e.events.length, 0);
});

test('额外连接识别酒馆 HTTP 200 包装的上游拒绝，错误内容隐藏密钥', async () => {
  const e = environment();
  const custom_api = { source: 'openai', apiurl: 'https://fixture.invalid/v1', key: 'fixture-key', model: 'test' };
  e.state.response = async () => Response.json({ error: { message: 'Invalid API key: fixture-key' } });
  await assert.rejects(sendResponse(e.native, messages, { custom_api }, signal()),
    error => error instanceof ApiProviderError && error.message === 'Invalid API key: [密钥已隐藏]');
  const abort = new AbortController();
  e.state.response = async () => { abort.abort(); throw Error('网络已断开'); };
  await assert.rejects(sendResponse(e.native, messages, { custom_api }, abort.signal),
    error => error.name === 'AbortError' && !(error instanceof ApiProviderError));
});


test('自定义OpenAI偏置使用目标模型，覆盖主连接的分词快照', async () => {
  const e = environment();
  const settings = { ...e.settings, bias_preset_selected: 'a', bias_presets: { a: [{ text: '甲', value: 7 }] } };
  await sendResponse(e.native, messages, { custom_api: { source: 'openai', apiurl: 'https://fixture.invalid/v1', model: 'gpt-4.1-mini' } },
    signal(), { settings, tokenizerModel: 'main-connection-model' });
  assert.equal(e.sent[0].model, 'gpt-4.1-mini');
  assert(e.biasRequests[0].url.endsWith('model=gpt-4.1-mini'));
  assert.deepEqual(e.sent[0].logit_bias, { token: 7 });
});

test('非OpenAI偏置保留准备阶段分词快照', async () => {
  const e = environment();
  const settings = { ...e.settings, chat_completion_source: 'openrouter', openrouter_model: 'snapshot-model',
    bias_preset_selected: 'a', bias_presets: { a: [{ text: '甲', value: 7 }] } };
  e.settings.openai_model = 'changed-ui-model';
  await sendResponse(e.native, messages, {}, signal(), { settings, tokenizerModel: 'snapshot-tokenizer' });
  assert(e.biasRequests[0].url.endsWith('model=snapshot-tokenizer'));
  assert.deepEqual(e.sent[0].logit_bias, { token: 7 });
});
