const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../运行/generation/world-info-source.js'), 'utf8');
const scanner = import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function entry(uid, options = {}) {
  return {
    uid, world: 'fixture', hash: uid, key: ['target'], keysecondary: [], content: `ENTRY_${uid}`,
    order: 100, position: 0, decorators: [], selective: false, disable: false,
    constant: false, excludeRecursion: false, preventRecursion: false,
    useProbability: false, probability: 100, sticky: 0, cooldown: 0, delay: 0,
    ...options,
  };
}
function fixture(entries) {
  const events = [];
  const metadata = {};
  const native = {
    script: {
      chat_metadata: metadata, this_chid: 0, characters: [{ avatar: 'fixture.png' }],
      extension_prompt_roles: { SYSTEM: 0, USER: 1, ASSISTANT: 2 },
      event_types: { WORLDINFO_SCAN_DONE: 'scan', WORLD_INFO_ACTIVATED: 'activated', WORLDINFO_ENTRIES_LOADED: 'loaded' },
      eventSource: { async emit(...args) { events.push(args); } },
      substituteParams(text, options) { return text.replaceAll('{{scenario}}', options.dynamicMacros.scenario); },
    },
    extensions: { getContext: () => ({ tagMap: {}, extensionPrompts: { shared: { value: 'WRONG' } } }) },
    tokenizers: { getTokenCountAsync: async text => text.length, getTokenizerModel: () => 'fixture-model' },
    regex: { getRegexedString: text => text, regex_placement: { WORLD_INFO: 6 } },
    utils: { escapeRegex: text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), getCharaFilename: () => 'fixture',
      getStringHash: text => JSON.parse(text).uid },
    i18n: { t: values => values.join('') },
    powerUser: { power_user: {} },
    worldInfo: {
      worldInfoCache: new Map(),
      selected_world_info: ['fixture'], world_info: {}, METADATA_KEY: 'world_info',
      world_info_character_strategy: 0, world_info_insertion_strategy: { evenly: 0, character_first: 1, global_first: 2 },
      loadWorldInfo: async () => ({ entries: Object.fromEntries(structuredClone(entries).map(item => [item.uid, item])) }),
      world_info_depth: 1, world_info_min_activations: 0, world_info_min_activations_depth_max: 0,
      world_info_budget: 100, world_info_recursive: false, world_info_overflow_alert: false,
      world_info_case_sensitive: false, world_info_match_whole_words: false,
      world_info_use_group_scoring: false, world_info_budget_cap: 0, world_info_max_recursion_steps: 0,
      DEFAULT_DEPTH: 4, DEFAULT_WEIGHT: 100, MAX_SCAN_DEPTH: 1000,
      scan_state: { NONE: 0, INITIAL: 1, RECURSION: 2, MIN_ACTIVATIONS: 3 },
      world_info_logic: { AND_ANY: 0, NOT_ALL: 1, NOT_ANY: 2, AND_ALL: 3 },
      world_info_position: { before: 0, after: 1, ANTop: 2, ANBottom: 3, atDepth: 4, EMTop: 5, EMBottom: 6, outlet: 7 },
      wi_anchor_position: { before: 0, after: 1 },
      parseRegexFromString: text => text.startsWith('/') ? new RegExp(text.slice(1, -1)) : null,
    },
  };
  return { native, metadata, events };
}
function request(overrides = {}) {
  return { chat: ['target'], maxContext: 10000, isDryRun: false, scenario: 'SCENE',
    extensionPrompts: {}, userInput: '', globalScanData: { trigger: 'normal' }, ...overrides };
}
async function scan(native, options) {
  return (await scanner).scanWorldInfoSource(native, request(options));
}

test('任务空历史只读真实聊天进度下的黏性，取消后不提交或广播激活', async () => {
  const { native, metadata, events } = fixture([entry(1, { sticky: 4 })]);
  await scan(native, { chatLength: 1 });
  const saved = structuredClone(metadata.timedWorldInfo);
  const result = await scan(native, { chat: [], chatLength: 3, updateWorldInfo: false });
  assert(result.worldInfoBefore.includes('ENTRY_1'));
  assert.deepEqual(metadata.timedWorldInfo, saved);
  assert.equal(events.filter(([name]) => name === 'activated').length, 1);
  const controller = new AbortController();
  const entered = deferred(), release = deferred();
  const pending = scan(native, { chatLength: 4, signal: controller.signal, extensionPrompts: {
    delayed: { value: 'target', scan: true, filter: async () => { entered.resolve(); await release.promise; return true; } },
  } });
  await entered.promise;
  controller.abort(Error('stop-after-filter'));
  release.resolve();
  await assert.rejects(pending, /stop-after-filter/);
  assert.deepEqual(metadata.timedWorldInfo, saved);
  assert.equal(events.filter(([name]) => name === 'activated').length, 1);
});

test('只读取实际绑定书且合法空书与扩展筛空可继续，读取失败保留错误', async () => {
  const { native } = fixture([]);
  native.worldInfo.selected_world_info = ['global'];
  native.worldInfo.world_info.charLore = [{ name: 'fixture', extraBooks: ['extra', 'global'] },
    { name: 'other', extraBooks: ['unrelated'] }];
  native.script.characters[0].data = { extensions: { world: 'main' } };
  native.script.chat_metadata.world_info = 'chat';
  native.powerUser.power_user.persona_description_lorebook = 'persona';
  const reads = [];
  native.worldInfo.loadWorldInfo = async name => { reads.push(name); return { entries: {} }; };
  let directoryReads = 0;
  native.script.getRequestHeaders = () => ({});
  native.host = { fetch: async url => {
    assert.equal(url, '/api/worldinfo/list');
    directoryReads++;
    return Response.json(['global', 'main', 'extra', 'chat', 'persona'].map(file_id => ({ file_id })));
  } };
  await scan(native);
  assert.deepEqual(reads.sort(), ['global', 'main', 'extra', 'chat', 'persona'].sort());
  assert.equal(directoryReads, 1);
  native.worldInfo.loadWorldInfo = async () => null;
  await assert.rejects(scan(native), /global.*读取失败/);
  const error = Error('connection-lost');
  native.worldInfo.loadWorldInfo = async () => { throw error; };
  await assert.rejects(scan(native), value => value === error);
});

test('异步筛选和读书期间改绑定仍扫描请求建立时的同一组已读取条目', async () => {
  for (const broken of ['initial', 'new-book', 'none']) {
    const e = fixture([]), reads = [];
    e.native.worldInfo.selected_world_info = ['initial'];
    e.native.worldInfo.loadWorldInfo = async name => {
      reads.push(name);
      return name === broken ? null : { entries: { 1: entry(1, { constant: true, content: name + '_RULE' }) } };
    };
    const pending = scan(e.native, { extensionPrompts: { change: {
      value: '', scan: true, filter: async () => {
        await Promise.resolve();
        e.native.worldInfo.selected_world_info = ['new-book'];
        return true;
      },
    } } });
    if (broken === 'initial') await assert.rejects(pending, /initial.*读取失败/);
    else assert((await pending).worldInfoBefore.includes('initial_RULE'));
    assert.deepEqual(reads, ['initial']);
  }
  const e = fixture([]), reads = [], gate = deferred(), entered = deferred();
  e.native.worldInfo.selected_world_info = ['first', 'second'];
  e.native.worldInfo.loadWorldInfo = async name => {
    reads.push(name);
    if (name === 'first') { entered.resolve(); await gate.promise; }
    return { entries: { 1: entry(1, { content: name + '_RULE', constant: true, world: name }) } };
  };
  const pending = scan(e.native);
  await entered.promise;
  e.native.worldInfo.selected_world_info.splice(0, 2, 'replacement');
  gate.resolve();
  const result = await pending;
  assert.deepEqual(reads, ['first', 'second']);
  assert(result.worldInfoBefore.includes('first_RULE') && result.worldInfoBefore.includes('second_RULE'));
});

test('本次加载条目的来源优先级装饰器hash及扩展事件与固定原生聚合一致', async () => {
  const upstream = path.resolve(__dirname, '../../../../SillyTavern/public/scripts');
  const declarations = (file, names) => {
    const ast = ts.createSourceFile(file, fs.readFileSync(path.join(upstream, file), 'utf8'), ts.ScriptTarget.Latest, true);
    return ast.statements.filter(node => names.includes(node.name?.text))
      .map(node => node.getText(ast).replace(/^export /, '')).join('\n');
  };
  const aggregateCode = declarations('world-info.js',
    ['getGlobalLore', 'getCharacterLore', 'getChatLore', 'getPersonaLore', 'getSortedEntries', 'parseDecorators']);
  const hash = vm.runInNewContext(declarations('utils.js', ['getStringHash']) + '\ngetStringHash');
  for (const strategy of [0, 1, 2]) {
    const e = fixture([]), books = {};
    for (const [index, name] of ['global', 'character', 'chat', 'persona', 'extra'].entries()) {
      const row = entry(index, { order: 100 - index, content: index === 0 ? '@@unknown\n@@@activate\nGLOBAL' : name });
      delete row.world; delete row.hash; delete row.decorators;
      books[name] = { entries: { [index]: row } };
    }
    e.native.worldInfo.selected_world_info = ['global'];
    e.native.worldInfo.world_info.charLore = [{ name: 'fixture', extraBooks: ['extra', 'global', 'chat', 'persona'] }];
    e.native.script.characters[0].data = { extensions: { world: 'character' } };
    e.native.script.chat_metadata.world_info = 'chat';
    e.native.powerUser.power_user.persona_description_lorebook = 'persona';
    e.native.worldInfo.world_info_character_strategy = strategy;
    e.native.worldInfo.loadWorldInfo = async name => structuredClone(books[name]);
    e.native.utils.getStringHash = hash;
    const originalEmit = e.native.script.eventSource.emit;
    e.native.script.eventSource.emit = async (name, payload) => {
      if (name === 'loaded') payload.globalLore.push({ ...entry(99), world: 'extension', content: '@@dont_activate\nHIDDEN' });
      await originalEmit(name, payload);
    };
    const expected = await vm.runInNewContext(aggregateCode + '\ngetSortedEntries', {
      characters: e.native.script.characters, this_chid: 0, getCharaFilename: () => 'fixture',
      selected_world_info: e.native.worldInfo.selected_world_info, world_info: e.native.worldInfo.world_info,
      chat_metadata: e.native.script.chat_metadata, METADATA_KEY: 'world_info', power_user: e.native.powerUser.power_user,
      loadWorldInfo: e.native.worldInfo.loadWorldInfo, eventSource: e.native.script.eventSource,
      event_types: e.native.script.event_types, world_info_character_strategy: strategy,
      world_info_insertion_strategy: e.native.worldInfo.world_info_insertion_strategy,
      sortFn: (a, b) => b.order - a.order, getStringHash: hash,
      KNOWN_DECORATORS: ['@@activate', '@@dont_activate'], structuredClone, console: { debug() {}, error() {} },
    })();
    await scan(e.native);
    const actual = e.events.find(([name]) => name === 'scan')[1].sortedEntries;
    assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)));
    assert.equal(new Set(actual.map(item => item.world + '.' + item.uid)).size, actual.length);
  }
});

test('加载扩展可合法筛空，事件源本身拒绝时保留原异常', async () => {
  const e = fixture([entry(1)]);
  e.native.script.eventSource.emit = async (name, payload) => {
    if (name === 'loaded') payload.globalLore.length = 0;
  };
  assert.equal((await scan(e.native)).worldInfoBefore, '');
  const error = Error('entry-handler-failed');
  e.native.script.eventSource.emit = async name => { if (name === 'loaded') throw error; };
  await assert.rejects(scan(e.native), caught => caught === error);
});

test('宿主用合法空形状返回缺书时停止，原名补回后重试能加载条目', async () => {
  const e = fixture([]);
  const cache = e.native.worldInfo.worldInfoCache;
  let file;
  e.native.worldInfo.loadWorldInfo = async name => {
    if (cache.has(name)) return structuredClone(cache.get(name));
    const data = structuredClone(file ?? { entries: {} });
    cache.set(name, data);
    return data;
  };
  e.native.script.getRequestHeaders = () => ({});
  e.native.host = { fetch: async () => Response.json(file ? [{ file_id: 'fixture', name: '书内自称' }] : []) };
  await assert.rejects(scan(e.native), /fixture.*不存在/);
  file = { entries: { 1: entry(1) } };
  assert.equal((await scan(e.native)).worldInfoBefore, 'ENTRY_1');
});

test('目录失败或取消后补回原书可重试，迟到的缺书结果保留并发写入的有效缓存', async () => {
  for (const outcome of ['offline', 'aborted', 'concurrent']) {
    const { native } = fixture([]);
    const cache = native.worldInfo.worldInfoCache;
    const controller = new AbortController();
    let file = { entries: {} };
    native.worldInfo.loadWorldInfo = async name => {
      if (cache.has(name)) return structuredClone(cache.get(name));
      cache.set(name, file);
      return file;
    };
    native.script.getRequestHeaders = () => ({});
    const restored = { entries: { 1: entry(1) } };
    native.host = { fetch: async () => {
      if (outcome === 'offline') return new Response(null, { status: 503 });
      if (outcome === 'aborted') controller.abort(Error('目录请求取消'));
      if (outcome === 'concurrent') cache.set('fixture', restored);
      return Response.json([]);
    } };
    const expected = { offline: /目录.*503/, aborted: /目录请求取消/, concurrent: /fixture.*不存在/ };
    await assert.rejects(scan(native, { signal: controller.signal }), expected[outcome]);
    if (outcome === 'concurrent') assert.deepEqual(cache.get('fixture'), restored);
    file = restored;
    native.host.fetch = async () => Response.json([{ file_id: 'fixture' }]);
    assert.equal((await scan(native)).worldInfoBefore, 'ENTRY_1');
  }
});

test('扩展的临时关键词只影响本轮，事件结束后的改写不影响递归激活', async () => {
  const e = fixture([]);
  const book = { entries: { 1: entry(1, { content: 'chain' }), 2: entry(2, { key: ['chain'] }) } };
  const cache = e.native.worldInfo.worldInfoCache;
  e.native.worldInfo.loadWorldInfo = async name => {
    if (cache.has(name)) return structuredClone(cache.get(name));
    cache.set(name, book);
    return book;
  };
  e.native.worldInfo.world_info_recursive = true;
  let held;
  const emit = e.native.script.eventSource.emit;
  e.native.script.eventSource.emit = async (name, payload) => {
    if (name === 'loaded' && !held) {
      held = payload.globalLore;
      held[0].key[0] = 'temporary';
    }
    return emit(name, payload);
  };
  e.native.tokenizers.getTokenCountAsync = async text => {
    held[1].key[0] = 'late';
    return text.length;
  };
  assert((await scan(e.native, { chat: ['temporary'] })).worldInfoBefore.includes('ENTRY_2'));
  assert((await scan(e.native)).worldInfoBefore.includes('ENTRY_2'));
});

test('并发扫描保留各自深度条目、场景宏、AN和异步筛选注入', async () => {
  const gate = deferred();
  const entered = deferred();
  const { native } = fixture([
    entry(1, { key: ['A'], position: 4, depth: 2, content: 'DEPTH {{scenario}}' }),
    entry(2, { key: ['B'], position: 4, depth: 3, content: 'DEPTH {{scenario}}' }),
    entry(3, { constant: true, position: 2, content: 'AN {{scenario}}' }),
  ]);
  const a = scan(native, { chat: [''], scenario: 'A', extensionPrompts: {
    local: { value: '{{scenario}}', scan: true, filter: async () => { entered.resolve(); await gate.promise; return true; } },
  } });
  await entered.promise;
  const b = await scan(native, { chat: [''], scenario: 'B', userInput: 'B' });
  gate.resolve();
  const resultA = await a;
  assert.deepEqual(resultA.worldInfoDepth, [{ depth: 2, role: 0, entries: ['DEPTH A'] }]);
  assert.deepEqual(b.worldInfoDepth, [{ depth: 3, role: 0, entries: ['DEPTH B'] }]);
  assert.deepEqual(resultA.anBefore, ['AN A']);
  assert.deepEqual(b.anBefore, ['AN B']);
  assert.equal(native.extensions.getContext().extensionPrompts.shared.value, 'WRONG');
});

test('本轮输入参与扫描而不消耗历史深度，空场景明确展开为空', async () => {
  const { native } = fixture([
    entry(1, { key: ['latest'], content: 'LATEST' }),
    entry(2, { key: ['older'], content: 'OLDER' }),
    entry(3, { key: ['input'], content: 'INPUT [{{scenario}}]' }),
  ]);
  const result = await scan(native, { chat: ['latest', 'older'], userInput: 'input', scenario: '' });
  assert(result.worldInfoBefore.includes('LATEST'));
  assert(result.worldInfoBefore.includes('INPUT []'));
  assert(!result.worldInfoBefore.includes('OLDER'));
});

test('异步筛选异常向调用方传播', async () => {
  const { native } = fixture([entry(1)]);
  await assert.rejects(scan(native, { extensionPrompts: {
    broken: { value: 'target', scan: true, filter: async () => { throw Error('FILTER_BROKEN'); } },
  } }), /FILTER_BROKEN/);
});

test('递归、次关键字、分组优先级和正则输出保留', async () => {
  const { native } = fixture([
    entry(1, { content: 'chain', keysecondary: ['second'], selective: true, selectiveLogic: 0 }),
    entry(2, { key: ['chain'], content: 'RECURSION' }),
    entry(3, { group: 'group', groupOverride: true, order: 300, content: 'WINNER' }),
    entry(4, { group: 'group', groupOverride: true, order: 200, content: 'LOSER' }),
  ]);
  native.worldInfo.world_info_recursive = true;
  const result = await scan(native, { chat: ['target second'] });
  assert(result.worldInfoBefore.includes('RECURSION'));
  assert(result.worldInfoBefore.includes('WINNER'));
  assert(!result.worldInfoBefore.includes('LOSER'));
});

test('时效条目并发合并按条目保留并绑定原聊天，dry run不落盘', async () => {
  const { native, metadata } = fixture([
    entry(1, { key: ['A'], sticky: 2 }), entry(2, { key: ['B'], cooldown: 3 }),
  ]);
  const gate = deferred();
  const entered = deferred();
  let block = true;
  native.tokenizers.getTokenCountAsync = async text => {
    if (block) { block = false; entered.resolve(); await gate.promise; }
    return text.length;
  };
  const a = scan(native, { chat: ['A'] });
  await entered.promise;
  await scan(native, { chat: ['B'] });
  const otherChat = {};
  native.script.chat_metadata = otherChat;
  gate.resolve();
  await a;
  assert(metadata.timedWorldInfo.sticky['fixture.1']);
  assert(metadata.timedWorldInfo.cooldown['fixture.2']);
  assert.deepEqual(otherChat, {});
  const before = structuredClone(metadata);
  native.script.chat_metadata = metadata;
  await scan(native, { chat: ['A', '', '', '', ''], isDryRun: true });
  assert.deepEqual(metadata, before);
});

test('原生扫描完成事件可嵌套发起扫描，各自输出保持归属', async () => {
  const { native, events } = fixture([entry(1, { constant: true, content: '{{scenario}}', position: 4, depth: 1 })]);
  let nested;
  native.script.eventSource.emit = async (name, payload) => {
    events.push([name, payload]);
    if (name === 'scan' && !nested) {
      nested = true;
      nested = await scan(native, { scenario: 'INNER' });
    }
  };
  const result = await scan(native, { scenario: 'OUTER' });
  assert.deepEqual(result.worldInfoDepth[0].entries, ['OUTER']);
  assert.deepEqual(nested.worldInfoDepth[0].entries, ['INNER']);
  assert.equal(events.filter(([name]) => name === 'activated').length, 2);
});

test('较早扫描的时效删除不会覆盖并发更新后的同一条目', async () => {
  const { native, metadata } = fixture([entry(1, { key: ['A'], sticky: 2 })]);
  metadata.timedWorldInfo = {
    sticky: { 'fixture.1': { hash: 1, start: 0, end: 1, protected: false } }, cooldown: {},
  };
  const gate = deferred();
  const entered = deferred();
  let block = true;
  native.tokenizers.getTokenCountAsync = async text => {
    if (block) { block = false; entered.resolve(); await gate.promise; }
    return text.length;
  };
  const a = scan(native, { chat: ['none', 'old'] });
  await entered.promise;
  await scan(native, { chat: ['A', 'old'] });
  const updated = structuredClone(metadata.timedWorldInfo.sticky['fixture.1']);
  gate.resolve();
  await a;
  assert.deepEqual(metadata.timedWorldInfo.sticky['fixture.1'], updated);
  assert.equal(updated.start, 2);
});

const ts = require('typescript');
const vm = require('node:vm');
const dataFile = path.join(__dirname, '../运行/generation/data.ts');
const dataModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(dataFile, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  exports: dataModule.exports, module: dataModule, structuredClone, console,
  require: name => {
    assert.equal(name, './world-info');
    return { scanWorldInfo: async (...args) => (await scanner).scanWorldInfoSource(...args) };
  },
});
const { prepareRequestData } = dataModule.exports;
const openaiSource = fs.readFileSync(path.resolve(__dirname, '../../../../SillyTavern/public/scripts/openai.js'), 'utf8');
const openaiAst = ts.createSourceFile('openai.js', openaiSource, ts.ScriptTarget.Latest, true);
const formatterSource = openaiAst.statements.find(node => node.name?.text === 'setOpenAIMessages').getText(openaiAst);

function dataFixture(entries = []) {
  const env = fixture(entries);
  const { native } = env;
  Object.assign(native.script, {
    name1: 'Player', name2: 'Character',
    extension_prompt_types: { BEFORE_PROMPT: 0, IN_PROMPT: 2, IN_CHAT: 1 },
    extension_prompts: {
      TEMP_USER_MESSAGE: { value: 'STALE_INPUT', scan: true, position: 2, depth: 0, role: 1 },
      'customDepthWI-0-0': { value: 'STALE_DEPTH', position: 1, depth: 0, role: 0 },
    },
    chat: [{ name: 'Player', is_user: true, mes: 'older' }, { name: 'Character', is_user: false, mes: 'latest' }],
    getCharacterCardFields: () => ({ scenario: 'BASE_SCENE', persona: 'PERSONA', description: 'DESCRIPTION',
      personality: 'PERSONALITY', mesExamples: 'BASE_EXAMPLE', system: '', jailbreak: '' }),
    getExtensionPromptRoleByName: role => ({ system: 0, user: 1, assistant: 2 })[role],
    getMaxContextSize: () => 10000,
    getBiasStrings: () => ({ promptBias: '' }),
  });
  native.script.characters[0].data = { extensions: { depth_prompt: { prompt: 'CHAR_DEPTH', depth: 4, role: 'system' } } };
  Object.assign(env.metadata, { notePosition: 1, noteDepth: 2, noteRole: 0 });
  native.authorsNote = { NOTE_MODULE_NAME: '2_floating_prompt', shouldWIAddPrompt: true,
    metadata_keys: { position: 'notePosition', depth: 'noteDepth', role: 'noteRole' } };
  native.extensions.extension_settings = { note: { allowWIScan: true } };
  native.powerUser = { power_user: { persona_description_position: 0 }, getCustomStoppingStrings: () => [],
    persona_description_positions: { IN_PROMPT: 0, TOP_AN: 1, BOTTOM_AN: 2, AT_DEPTH: 3 } };
  native.host = { $: selector => { assert.equal(selector, '#extension_floating_prompt'); return { val: () => 'NOTE' }; } };
  native.worldInfo.world_info_include_names = true;
  native.openai = { oai_settings: { send_if_empty: 'EMPTY_INPUT', names_behavior: 0, chat_completion_source: 'custom' },
    setOpenAIMessageExamples: blocks => blocks.map(block => [{ role: 'system', content: block }]) };
  native.openai.setOpenAIMessages = vm.runInNewContext(`(${formatterSource})`, {
    oai_settings: native.openai.oai_settings,
    getChatCompletionModel: () => 'fixture',
    IGNORE_SYMBOL: Symbol.for('ignore'), system_message_types: { NARRATOR: 'narrator' },
    character_names_behavior: { NONE: 0, DEFAULT: 1, CONTENT: 2, COMPLETION: 3 },
    selected_group: null, name1: 'Player', name2: 'Character',
    getMediaDisplay: () => 'list', getMediaIndex: () => 0, structuredClone,
  });
  return env;
}
function prepare(native, config = {}) {
  return prepareRequestData(native, { generation_id: 'fixture', user_input: 'input', ...config });
}

test('请求准备入口采用原生历史格式器，最新历史和本轮输入分别激活世界书', async () => {
  const { native } = dataFixture([
    entry(1, { key: ['Character: latest'], content: 'LATEST', triggers: ['normal'] }),
    entry(2, { key: ['older'], content: 'OLDER' }),
    entry(3, { key: ['input'], content: 'INPUT' }),
  ]);
  const result = await prepare(native);
  assert.equal(result.messages[0].content, 'input');
  assert.equal(result.messages[1].content, 'latest');
  assert.equal(result.messages[2].content, 'older');
  assert(result.worldInfoBefore.includes('LATEST'));
  assert(result.worldInfoBefore.includes('INPUT'));
  assert(!result.worldInfoBefore.includes('OLDER'));
});

test('作者注释合并保留世界书上下注释与persona顺序，宿主槽不变', async () => {
  const { native } = dataFixture([
    entry(1, { constant: true, position: 2, content: 'TOP {{scenario}}' }),
    entry(2, { constant: true, position: 3, content: 'BOTTOM {{scenario}}' }),
  ]);
  native.powerUser.power_user.persona_description_position = 1;
  const original = structuredClone(native.script.extension_prompts);
  const result = await prepare(native, { overrides: { scenario: 'LOCAL' } });
  assert.equal(result.extensionPrompts['2_floating_prompt'].value, 'TOP LOCAL\nPERSONA\nNOTE\nBOTTOM LOCAL');
  assert.deepEqual(native.script.extension_prompts, original);
  assert.equal(result.extensionPrompts.TEMP_USER_MESSAGE, undefined);
});

test('后台变量入口清空历史仍保留深度规则，资料选择入口显式关闭深度', async () => {
  const { native } = dataFixture([entry(1, { constant: true, position: 4, depth: 0, content: 'VARIABLE_RULE' })]);
  const worker = await prepare(native, { overrides: { persona_description: '', char_description: '',
    chat_history: { prompts: [], with_depth_entries: true } } });
  assert.equal(worker.messages.length, 1);
  assert.equal(worker.personaDescription, '');
  assert.equal(worker.charDescription, '');
  assert.equal(worker.extensionPrompts['customDepthWI-0-0'].value, 'VARIABLE_RULE');
  const selector = await prepare(native, { overrides: { persona_description: '', char_description: '',
    char_personality: '', scenario: '', world_info_before: '', world_info_after: '',
    chat_history: { prompts: [], with_depth_entries: false } } });
  assert.equal(selector.messages.length, 1);
  assert.equal(selector.scenario, '');
  assert.equal(selector.worldInfoBefore, '');
  assert.equal(selector.worldInfoAfter, '');
  assert(!Object.keys(selector.extensionPrompts).some(key => key.startsWith('customDepthWI')));
});

test('世界书示例前后顺序沿用原生规则，显式空示例关闭全部示例', async () => {
  const { native } = dataFixture([
    entry(1, { constant: true, position: 5, order: 300, content: 'TOP_HIGH' }),
    entry(2, { constant: true, position: 5, order: 200, content: 'TOP_LOW' }),
    entry(3, { constant: true, position: 6, order: 100, content: 'BOTTOM' }),
  ]);
  const result = await prepare(native);
  assert.equal(JSON.stringify(result.messageExamples.map(block => block[0].content.trim())),
    JSON.stringify(['<START>\nTOP_HIGH', '<START>\nTOP_LOW', '<START>\nBASE_EXAMPLE', '<START>\nBOTTOM']));
  const disabled = await prepare(native, { overrides: { dialogue_examples: '' } });
  assert.equal(disabled.messageExamples.length, 0);
});

test('请求准备并发经过真实扫描后深度和场景保持独立，注入筛选失败向上传递', async () => {
  const { native } = dataFixture([
    entry(1, { key: ['REQUEST_ALPHA'], position: 4, depth: 0, content: 'ENTRY_A {{scenario}}' }),
    entry(2, { key: ['REQUEST_BETA'], position: 4, depth: 0, content: 'ENTRY_B {{scenario}}' }),
  ]);
  const gate = deferred(), entered = deferred();
  const original = structuredClone(native.script.extension_prompts);
  const a = prepare(native, { user_input: 'REQUEST_ALPHA', overrides: { scenario: 'SCENE_A' }, injects: [{
    content: 'LOCAL', position: 'in_chat', depth: 0, role: 'system', should_scan: true,
    filter: async () => { entered.resolve(); await gate.promise; return true; },
  }] });
  await entered.promise;
  const b = await prepare(native, { user_input: 'REQUEST_BETA', overrides: { scenario: 'SCENE_B' } });
  gate.resolve();
  const resultA = await a;
  assert.equal(resultA.extensionPrompts['customDepthWI-0-0'].value, 'ENTRY_A SCENE_A');
  assert.equal(b.extensionPrompts['customDepthWI-0-0'].value, 'ENTRY_B SCENE_B');
  await assert.rejects(prepare(native, { injects: [{ content: 'BAD', position: 'none', depth: 0,
    role: 'system', should_scan: true, filter: async () => { throw Error('DATA_FILTER_FAILED'); } }] }), /DATA_FILTER_FAILED/);
  assert.deepEqual(native.script.extension_prompts, original);
});
