const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const sourceRoot = path.resolve(__dirname, '../../../../SillyTavern/public/scripts');

// Exercise the card adapter with the installed upstream collection/budget implementations.
// Token counting and macro expansion are deterministic contracts; network/model behavior is tested by the caller.
function upstreamClasses(file, names, globals = {}) {
  const source = fs.readFileSync(path.join(sourceRoot, file), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const declarations = ast.statements.flatMap(node => {
    if (names.includes(node.name?.text)) return [node.getText(ast).replace(/^export /, '')];
    if (ts.isVariableStatement(node))
      return node.declarationList.declarations
        .filter(item => names.includes(item.name.getText(ast)))
        .map(item => 'const ' + item.getText(ast) + ';');
    return [];
  });
  assert.equal(declarations.length, names.length);
  const code = declarations.join('\n');
  return vm.runInNewContext(`${code}\n;({${names.join(',')}})`, { console, structuredClone, ...globals });
}
const countTokensOpenAIAsync = async value => JSON.stringify(value).length;
const classes = upstreamClasses(
  'openai.js',
  [
    'TokenHandler',
    'IdentifierNotFoundError',
    'TokenBudgetExceededError',
    'InvalidCharacterNameError',
    'Message',
    'MessageCollection',
    'ChatCompletion',
  ],
  {
    tokenHandler: { countAsync: countTokensOpenAIAsync },
  },
);
const promptClasses = upstreamClasses('PromptManager.js', ['Prompt', 'PromptCollection', 'PromptManager'], {
  debounce: fn => fn,
  debounce_timeout: { relaxed: 0 },
  DEFAULT_ORDER: 100,
  DEFAULT_DEPTH: 4,
});
function loadCard(filename, directory = path.resolve(__dirname, '../运行/generation')) {
  let file = path.resolve(directory, filename);
  if (!path.extname(file)) file += '.ts';
  const source = fs.readFileSync(file, 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(javascript, {
    exports: module.exports,
    module,
    require: name => (name.startsWith('.') ? loadCard(name, path.dirname(file)) : require(name)),
    structuredClone,
    AbortController,
    crypto: require('node:crypto').webcrypto,
    console: { ...console, log() {}, debug() {} },
  });
  return module.exports;
}
const { preparePreset } = loadCard('preset.ts');
function fixture() {
  const manager = new promptClasses.PromptManager();
  const identifiers = [
    'main',
    'scenario',
    'worldInfoBefore',
    'worldInfoAfter',
    'charDescription',
    'charPersonality',
    'dialogueExamples',
    'chatHistory',
  ];
  const settings = {
    openai_max_context: 100000,
    openai_max_tokens: 1000,
    scenario_format: 'Scene {{scenario}}',
    personality_format: '{{personality}}',
    wi_format: '{0}',
    group_nudge_prompt: '',
    impersonation_prompt: '',
    send_if_empty: '',
    new_chat_prompt: '[Start]',
    new_example_chat_prompt: '[Example]',
    names_behavior: 0,
    chat_completion_source: 'custom',
    prompts: identifiers.map(identifier => ({
      identifier,
      role: 'system',
      system_prompt: true,
      content: identifier === 'main' ? 'Main {{scenario}}' : '',
      injection_position: 0,
    })),
    prompt_order: [{ character_id: 1, order: identifiers.map(identifier => ({ identifier, enabled: true })) }],
  };
  manager.serviceSettings = settings;
  manager.activeCharacter = { id: 1 };
  const native = {
    script: {
      event_types: { CHAT_COMPLETION_PROMPT_READY: 'prompt-ready' },
      eventSource: { emit: async () => {} },
      name1: 'Player',
      name2: 'Character',
      extension_prompt_types: { BEFORE_PROMPT: 0, IN_PROMPT: 2, IN_CHAT: 1 },
      extension_prompt_roles: { SYSTEM: 0, USER: 1, ASSISTANT: 2 },
      getExtensionPromptMaxDepth: () => 100,
      substituteParams: (text, options) =>
        String(text ?? '').replace(/\{\{(\w+)\}\}/g, (_, key) => options.dynamicMacros[key] ?? ''),
    },
    openai: {
      ...classes,
      promptManager: manager,
      oai_settings: settings,
      isImageInliningSupported: () => false,
      isVideoInliningSupported: () => false,
      isAudioInliningSupported: () => false,
      isReasoningSignatureSupported: () => false,
      tool_reasoning_modes: { DISABLED: 'disabled' },
      chat_completion_sources: { OPENROUTER: 'openrouter', CUSTOM: 'custom', CLAUDE: 'claude' },
      formatWorldInfo: (text, { wiFormat }) => (text ? wiFormat.replace('{0}', text) : ''),
    },
    promptManager: { ...promptClasses, INJECTION_POSITION: { RELATIVE: 0, ABSOLUTE: 1 } },
    powerUser: { power_user: { pin_examples: false }, persona_description_positions: { IN_PROMPT: 0 },
      getCustomStoppingStrings: () => [] },
    tokenizers: { countTokensOpenAIAsync, getTokenizerModel: () => 'fixture-model' },
    groupChats: { selected_group: null },
    extensions: {
      getContext: () => ({ ToolManager: { isToolCallingSupported: () => false, canPerformToolCalls: () => false } }),
    },
  };
  return { native, settings };
}
function request(scenario, extensionPrompts = {}) {
  return {
    name2: 'Character',
    scenario,
    charDescription: 'Description',
    charPersonality: 'Personality',
    worldInfoBefore: 'Before',
    worldInfoAfter: 'After',
    messages: [
      { role: 'user', content: 'latest' },
      { role: 'assistant', content: 'previous' },
    ],
    messageExamples: [],
    extensionPrompts,
    type: 'normal',
  };
}
const plain = value => JSON.parse(JSON.stringify(value));
test('keeps native preset order, roles, history chronology and local scenario macros', async () => {
  const { native } = fixture();
  const result = plain(await preparePreset(native, request('A')));
  assert.deepEqual(
    result.map(item => item.content),
    ['Main A', 'Scene A', 'Before', 'After', 'Description', 'Personality', '[Start]', 'previous', 'latest'],
  );
  assert.equal(result.at(-1).role, 'user');
});
test('awaits false extension filters and propagates the original failure before send', async () => {
  const { native } = fixture();
  const denied = await preparePreset(
    native,
    request('A', { hidden: { value: 'must not enter', position: 1, depth: 0, role: 0, filter: async () => false } }),
  );
  assert.ok(!JSON.stringify(denied).includes('must not enter'));
  const error = new Error('filter failed');
  let sent = 0;
  await assert.rejects(
    async () => {
      await preparePreset(
        native,
        request('A', {
          broken: {
            value: 'depth',
            position: 1,
            depth: 0,
            role: 0,
            filter: async () => {
              throw error;
            },
          },
        }),
      );
      sent++;
    },
    caught => caught === error,
  );
  assert.equal(sent, 0);
});
test('concurrent requests keep depth values, scenarios and prompt manager settings separate', async () => {
  const { native, settings } = fixture();
  let release;
  const barrier = new Promise(resolve => {
    release = resolve;
  });
  const a = preparePreset(
    native,
    request('A', {
      depth: {
        value: 'depth {{scenario}}',
        position: 1,
        depth: 0,
        role: 0,
        filter: async () => {
          await barrier;
          return true;
        },
      },
    }),
  );
  const b = preparePreset(
    native,
    request('B', { depth: { value: 'depth {{scenario}}', position: 1, depth: 0, role: 0 } }),
  );
  const bResult = await b;
  release();
  const aResult = await a;
  assert.ok(JSON.stringify(aResult).includes('depth A'));
  assert.ok(!JSON.stringify(aResult).includes('depth B'));
  assert.ok(JSON.stringify(bResult).includes('depth B'));
  assert.equal(settings.prompts[0].content, 'Main {{scenario}}');
});
test('mandatory token budget errors reject instead of returning a partial prompt', async () => {
  const { native, settings } = fixture();
  settings.openai_max_context = 3;
  await assert.rejects(preparePreset(native, request('A')), /Token budged exceeded/);
});
test('preserves example messages and absolute prompt depth and role', async () => {
  const { native, settings } = fixture();
  settings.prompts.push({
    identifier: 'absolute',
    role: 'user',
    system_prompt: false,
    content: 'absolute {{scenario}}',
    injection_position: 1,
    injection_depth: 1,
    injection_order: 50,
  });
  settings.prompt_order[0].order.push({ identifier: 'absolute', enabled: true });
  const data = request('A');
  data.messageExamples = [[{ content: 'example text', name: 'example_user' }]];
  const result = plain(await preparePreset(native, data));
  const injected = result.find(item => item.content === 'absolute A');
  assert.equal(injected.role, 'user');
  assert.ok(result.find(item => item.content === 'example text' && item.name === 'example_user'));
  assert.equal(result.at(-2).content, 'absolute A');
  assert.equal(result.at(-1).content, 'latest');
});

test('explicit empty scene and persona overrides survive macro expansion', async () => {
  const { native } = fixture();
  native.powerUser.power_user.persona_description = 'host persona';
  native.powerUser.power_user.persona_description_position = 0;
  const data = request('');
  data.personaDescription = '';
  const result = await preparePreset(native, data);
  assert.ok(!JSON.stringify(result).includes('host persona'));
  assert.equal(result[0].content, 'Main ');
  assert.ok(!result.some(message => message.content === 'Scene '));
});

function integratedFixture() {
  const { native, settings } = fixture();
  const sent = [],
    listeners = new Map(),
    events = [];
  const toolManager = native.extensions.getContext().ToolManager;
  native.extensions = {
    extension_settings: { note: { allowWIScan: false } },
    getContext: () => ({ ToolManager: toolManager, tagMap: {} }),
  };
  Object.assign(native.script, {
    characters: [{ avatar: 'fixture.png', data: { extensions: {} } }],
    this_chid: 0,
    chat_metadata: {},
    extension_prompts: {},
    chat: [{ is_user: false, name: 'Character', mes: 'saved history', extra: {} }],
    getCharacterCardFields: () => ({
      description: 'Description',
      personality: 'Personality',
      scenario: 'HOST',
      persona: '',
      mesExamples: '',
      system: '',
      jailbreak: '',
    }),
    getExtensionPromptRoleByName: () => 0,
    getMaxContextSize: () => 100000,
    getBiasStrings: () => ({ promptBias: '' }),
    getRequestHeaders: () => ({}),
    extractMessageFromData: data => data.choices[0].message.content,
    event_types: {
      CHAT_COMPLETION_PROMPT_READY: 'prompt-ready',
      GENERATION_STOPPED: 'stop',
      GENERATION_AFTER_COMMANDS: 'commands',
      GENERATE_AFTER_DATA: 'data',
      WORLDINFO_SCAN_DONE: 'scan',
      WORLD_INFO_ACTIVATED: 'activated',
      WORLDINFO_ENTRIES_LOADED: 'loaded',
    },
    eventSource: {
      on(event, callback) {
        const callbacks = listeners.get(event) ?? new Set();
        callbacks.add(callback);
        listeners.set(event, callbacks);
      },
      removeListener(event, callback) {
        listeners.get(event)?.delete(callback);
      },
      async emit(event, ...args) {
        events.push([event, ...args]);
        for (const callback of listeners.get(event) ?? []) await callback(...args);
      },
      once() {
        throw Error('shared once injection used');
      },
    },
  });
  native.host = { $: () => ({ val: () => '' }) };
  native.authorsNote = {
    NOTE_MODULE_NAME: '2_floating_prompt',
    metadata_keys: { position: 'position', depth: 'depth', role: 'role' },
    shouldWIAddPrompt: false,
  };
  native.regex = { getRegexedString: text => text, regex_placement: { USER_INPUT: 1, AI_OUTPUT: 2, WORLD_INFO: 6 } };
  native.utils = {
    escapeRegex: text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    getCharaFilename: () => 'fixture',
    getStringHash: text => JSON.parse(text).uid,
  };
  native.i18n = { t: values => values.join('') };
  native.tokenizers.getTokenCountAsync = async text => text.length;
  native.worldInfo = {
    worldInfoCache: new Map(),
    selected_world_info: ['fixture'], world_info: {}, METADATA_KEY: 'world_info',
    world_info_character_strategy: 0, world_info_insertion_strategy: { evenly: 0, character_first: 1, global_first: 2 },
    world_info_include_names: false,
    world_info_depth: 1,
    world_info_min_activations: 0,
    world_info_min_activations_depth_max: 0,
    world_info_budget: 100,
    world_info_recursive: false,
    world_info_overflow_alert: false,
    world_info_case_sensitive: false,
    world_info_match_whole_words: false,
    world_info_use_group_scoring: false,
    world_info_budget_cap: 0,
    world_info_max_recursion_steps: 0,
    DEFAULT_DEPTH: 4,
    DEFAULT_WEIGHT: 100,
    MAX_SCAN_DEPTH: 1000,
    scan_state: { NONE: 0, INITIAL: 1, RECURSION: 2, MIN_ACTIVATIONS: 3 },
    world_info_logic: { AND_ANY: 0, NOT_ALL: 1, NOT_ANY: 2, AND_ALL: 3 },
    world_info_position: { before: 0, after: 1, ANTop: 2, ANBottom: 3, atDepth: 4, EMTop: 5, EMBottom: 6, outlet: 7 },
    wi_anchor_position: { before: 0, after: 1 },
    parseRegexFromString: () => null,
    loadWorldInfo: async () => ({ entries: Object.fromEntries(
      ['A', 'B'].map((key, uid) => [uid, {
        uid,
        world: 'fixture',
        hash: uid,
        key: [`TOKEN_${key}`],
        keysecondary: [],
        content: `DEPTH_${key} {{scenario}}`,
        order: 100,
        position: 4,
        depth: 0,
        role: 0,
        decorators: [],
        selective: false,
        disable: false,
        constant: false,
        excludeRecursion: false,
        preventRecursion: false,
        useProbability: false,
        probability: 100,
        sticky: 0,
        cooldown: 0,
        delay: 0,
      }]),
    ) }),
  };
  const nativeContext = {
    oai_settings: settings,
    name1: 'Player',
    name2: 'Character',
    selected_group: null,
    getChatCompletionModel: () => 'fixture-model',
    getGroupNames: () => [],
    getMediaDisplay: () => 'list',
    getMediaIndex: () => 0,
    IGNORE_SYMBOL: Symbol('ignore'),
    system_message_types: { NARRATOR: 10 },
    character_names_behavior: { NONE: -1, DEFAULT: 0, COMPLETION: 1, CONTENT: 2 },
    getCustomStoppingStrings: () => [],
    substituteParams: text => text.replaceAll('{{scenario}}', 'HOST'),
    getReasoningEffort: () => '',
    getVerbosity: () => '',
    openai_max_stop_strings: 4,
    power_user: {},
    ToolManager: toolManager,
  };
  Object.assign(
    native.openai,
    upstreamClasses(
      'openai.js',
      [
        'setOpenAIMessages',
        'setOpenAIMessageExamples',
        'parseExampleIntoIndividual',
        'createGenerationParameters',
        'chat_completion_sources',
      ],
      nativeContext,
    ),
  );
  native.openai.getChatCompletionModel = nativeContext.getChatCompletionModel;
  native.customRequest = upstreamClasses('custom-request.js', ['ChatCompletionService'], {
    AbortController,
    getRequestHeaders: () => ({}),
    fetch: async (url, options) => {
      assert.equal(url, '/api/backends/chat-completions/generate');
      const payload = JSON.parse(options.body);
      sent.push(payload);
      return Response.json({ choices: [{ message: { content: 'ok' } }] });
    },
  });
  const { createCardGeneration } = loadCard('index.ts');
  return { native, sent, events, listeners, api: createCardGeneration(native) };
}

test('宿主与助手留下的世界书深度槽不重入本轮，关闭深度时仍保留扩展自有注入', async () => {
  const { native, api, sent } = integratedFixture();
  const { inject_ids } = upstreamClasses('constants.js', ['inject_ids']);
  const slot = { position: native.script.extension_prompt_types.IN_CHAT, depth: 0, role: 0 };
  const prompts = {
    [inject_ids.CUSTOM_WI_DEPTH_ROLE(0, 0)]: { ...slot, value: 'DEPTH_A HOST_STALE' },
    'customDepthWI-0-0': { ...slot, value: 'HELPER_STALE' },
    'customDepthWI_notes': { ...slot, value: 'EXTENSION_NOTES' },
  };
  Object.assign(native.script.extension_prompts, structuredClone(prompts));
  for (const enabled of [true, false]) {
    await api.generate({ user_input: 'TOKEN_A', overrides: { chat_history: { with_depth_entries: enabled } } });
    const messages = JSON.stringify(sent.at(-1).messages);
    assert.equal(messages.split('DEPTH_A').length - 1, enabled ? 1 : 0);
    assert(!messages.includes('HOST_STALE') && !messages.includes('HELPER_STALE'));
    assert(messages.includes('EXTENSION_NOTES'));
  }
  assert.deepEqual(native.script.extension_prompts, prompts);
});

test('扫描期间改变人设位置和提示偏置只影响下一请求', async () => {
  for (const [initial, next] of [[0, 4], [4, 0]]) {
    const e = integratedFixture();
    const power = e.native.powerUser.power_user;
    e.native.powerUser.persona_description_positions = { IN_PROMPT: 0, AT_DEPTH: 4 };
    Object.assign(power, { persona_description_position: initial, persona_description_depth: 0,
      persona_description_role: 0, user_prompt_bias: 'bias-A' });
    e.native.script.getBiasStrings = () => ({ promptBias: power.user_prompt_bias });
    const changeSettings = () => {
      power.persona_description_position = next;
      power.user_prompt_bias = 'bias-B';
    };
    e.native.script.eventSource.on('loaded', changeSettings);
    const config = { user_input: 'TOKEN_A', overrides: { persona_description: 'persona-marker' } };
    await e.api.generate(config);
    e.native.script.eventSource.removeListener('loaded', changeSettings);
    await e.api.generate(config);
    assert.deepEqual(e.sent.map(payload => payload.messages.filter(m => m.content?.includes('persona-marker')).length), [1, 1]);
    assert.deepEqual(e.sent.map(payload => payload.messages.find(m => m.content?.startsWith('bias-'))?.content), ['bias-A', 'bias-B']);
  }
});

for (const alreadySaved of [false, true]) test(`预算不足不发送丢失${alreadySaved ? '已落楼本轮输入' : '显式本轮事实'}的请求`, async () => {
  const e = integratedFixture();
  e.native.openai.oai_settings.openai_max_context = 2000;
  const text = '本轮必须保留的事实'.repeat(500);
  if (alreadySaved) e.native.script.chat.push({ is_user: true, name: 'Player', mes: text, extra: {} });
  await assert.rejects(e.api.generate({ user_input: alreadySaved ? '' : text }), /预算不足/);
  assert.equal(e.sent.length, 0);
});

test('关闭历史标记明确失败，正常预算可裁剪旧历史但保留本轮', async () => {
  const e = integratedFixture();
  const settings = e.native.openai.oai_settings;
  settings.prompt_order[0].order.find(item => item.identifier === 'chatHistory').enabled = false;
  await assert.rejects(e.api.generate({ user_input: 'current' }), /聊天历史/);
  assert.equal(e.sent.length, 0);
  settings.prompt_order[0].order.find(item => item.identifier === 'chatHistory').enabled = true;
  settings.openai_max_context = 2000;
  e.native.script.chat[0].mes = 'old'.repeat(1000);
  await e.api.generate({ user_input: 'current' });
  assert.equal(e.sent[0].messages.at(-1).content, 'current');
  assert(!JSON.stringify(e.sent[0]).includes('oldoldold'));
});

for (const key of ['1_memory', '2_floating_prompt', '3_vectors', '4_vectors_data_bank', 'chromadb']) {
  test(`固定槽 ${key} 的异步筛选遵守原角色和位置，异常传播`, async () => {
    const e = fixture();
    let calls = 0;
    const prompt = { value: 'FILTERED', position: 0, role: 1, filter: async () => { calls++; return false; } };
    const result = await preparePreset(e.native, request('A', { [key]: prompt }));
    assert.equal(calls, 1);
    assert(!JSON.stringify(result).includes('FILTERED'));
    const error = Error('fixed-slot-error');
    prompt.filter = async () => { throw error; };
    await assert.rejects(preparePreset(e.native, request('A', { [key]: prompt })), value => value === error);
    delete prompt.filter;
    const included = await preparePreset(e.native, request('A', { [key]: prompt }));
    assert(JSON.stringify(included).includes('FILTERED'));
  });
}

test('卡内专用宏按请求在预设与世界书中展开，正常共享宏不变', async () => {
  const e = integratedFixture();
  e.native.openai.oai_settings.prompts[0].content = 'main {{valoran_rule}}';
  e.native.script.extension_prompts['ordinary'] = { value: 'shared {{valoran_rule}}', position: 2 };
  const base = e.native.script.substituteParams;
  e.native.script.substituteParams = (text, options) => base(text.replaceAll('{{valoran_rule}}', 'NORMAL'), options);
  await e.api.generate({ user_input: '{{valoran_rule}}' }, {
    expandPrompt: text => text.replaceAll('{{valoran_rule}}', 'LOCAL'), updateWorldInfo: false,
  });
  const payload = JSON.stringify(e.sent[0]);
  assert(payload.includes('main LOCAL'));
  assert(payload.includes('shared LOCAL'));
  assert.equal(e.sent[0].messages.at(-1).content, 'LOCAL');
  assert.equal(e.native.script.substituteParams('{{valoran_rule}}', { dynamicMacros: {} }), 'NORMAL');
});

test('完成前事件的正文改写返回Runtime，事件中取消不交付迟到正文', async () => {
  const e = integratedFixture();
  e.native.script.eventSource.on('js_generation_before_end', async completed => {
    completed.message = 'EJS处理后的正文';
  });
  assert.equal(await e.api.generate({ user_input: 'current' }), 'EJS处理后的正文');
  e.native.script.eventSource.on('js_generation_before_end', async (_completed, id) => { e.api.stop(id); });
  await assert.rejects(e.api.generate({ user_input: 'current' }), /生成已取消/);
});

test('显式卡宏上下文保留原生可选提示undefined输入合同', async () => {
  const e = integratedFixture();
  delete e.native.openai.oai_settings.group_nudge_prompt;
  await e.api.generate({ user_input: 'current' }, {
    expandPrompt: text => text.replaceAll('{{valoran_rule}}', 'LOCAL'), updateWorldInfo: false,
  });
  assert.equal(e.sent.length, 1);
  assert.equal(e.sent[0].messages.at(-1).content, 'current');
});

test('完整卡内入口的异步筛选拒绝保持零HTTP出站并释放监听', async () => {
  const { api, sent, listeners } = integratedFixture();
  const failure = new Error('entry filter rejection');
  await assert.rejects(
    api.generate({
      generation_id: 'reject',
      user_input: 'current input',
      injects: [
        {
          content: 'depth',
          role: 'system',
          depth: 0,
          should_scan: false,
          filter: async () => {
            throw failure;
          },
        },
      ],
    }),
    error => error === failure,
  );
  assert.equal(sent.length, 0);
  assert.equal(listeners.get('stop').size, 0);
});

test('完整卡内入口保留本轮输入和真实历史格式化结果', async () => {
  const { api, sent, events } = integratedFixture();
  assert.equal(await api.generate({ generation_id: 'normal', user_input: 'current input' }), 'ok');
  assert.equal(sent.length, 1);
  assert.ok(sent[0].messages.some(message => message.content === 'saved history' && message.role === 'assistant'));
  assert.equal(sent[0].messages.at(-1).content, 'current input');
  assert.equal(sent[0].messages.at(-1).role, 'user');
  assert.equal(events.filter(([name]) => name === 'prompt-ready').length, 1);
  assert.ok(events.findIndex(([name]) => name === 'prompt-ready') < events.findIndex(([name]) => name === 'data')); 
});

test('完整卡内并发入口在扫描等待后保持世界书深度和场景归属', async () => {
  const { api, sent, native } = integratedFixture();
  let release, entered;
  const gate = new Promise(resolve => {
    release = resolve;
  });
  const reached = new Promise(resolve => {
    entered = resolve;
  });
  const a = api.generate({
    generation_id: 'A',
    user_input: 'TOKEN_A',
    overrides: { scenario: 'SCENE_A' },
    injects: [
      {
        content: 'A',
        role: 'system',
        depth: 0,
        should_scan: true,
        filter: async () => {
          entered();
          await gate;
          return true;
        },
      },
    ],
  });
  await reached;
  await api.generate({ generation_id: 'B', user_input: 'TOKEN_B', overrides: { scenario: 'SCENE_B' } });
  release();
  await a;
  assert.equal(sent.length, 2);
  const first = JSON.stringify(sent[0].messages),
    second = JSON.stringify(sent[1].messages);
  assert.ok(first.includes('DEPTH_B SCENE_B'));
  assert.ok(!first.includes('DEPTH_A'));
  assert.ok(second.includes('DEPTH_A SCENE_A'));
  assert.ok(!second.includes('DEPTH_B'));
  assert.deepEqual(native.script.extension_prompts, {});
  assert.equal(native.script.getCharacterCardFields().scenario, 'HOST');
});


test('完整卡内入口扫描拒绝后保留共享注入并停止发送', async () => {
  const { api, sent, native } = integratedFixture();
  native.script.extension_prompts.EXISTING = { value: 'shared', position: 0, depth: 0, role: 0 };
  native.worldInfo.loadWorldInfo = async () => { throw Error('scan failed'); };
  await assert.rejects(api.generate({ user_input: 'request input' }), /scan failed/);
  assert.equal(sent.length, 0);
  assert.deepEqual(native.script.extension_prompts, { EXISTING: { value: 'shared', position: 0, depth: 0, role: 0 } });
});

test('完整卡内入口明确空场景在成功和筛选失败后保持宿主场景', async () => {
  for (const fail of [false, true]) {
    const { api, sent, native } = integratedFixture();
    const input = { user_input: 'request input', overrides: { scenario: '' } };
    if (fail) input.injects = [{ content: 'depth', role: 'system', depth: 0, should_scan: false,
      filter: async () => { throw Error('preset failed'); } }];
    if (fail) await assert.rejects(api.generate(input), /preset failed/);
    else {
      await api.generate(input);
      assert.ok(!JSON.stringify(sent[0].messages).includes('HOST'));
      assert.ok(sent[0].messages.some(message => message.content === 'Main '));
    }
    assert.equal(native.script.getCharacterCardFields().scenario, 'HOST');
  }
});


test('完整卡内Claude预填充采用请求场景并保留显式空场景', async () => {
  for (const scenario of ['REQUEST_SCENE', '']) {
    const { api, sent, native } = integratedFixture();
    native.openai.oai_settings.chat_completion_source = 'claude';
    native.openai.oai_settings.assistant_prefill = 'prefill {{scenario}}';
    await api.generate({ user_input: 'input', overrides: { scenario } });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].assistant_prefill, 'prefill ' + scenario);
    assert.equal(sent[0].messages[0].content, 'Main ' + scenario);
    assert.equal(native.script.getCharacterCardFields().scenario, 'HOST');
  }
});
