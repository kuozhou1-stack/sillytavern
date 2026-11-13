const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, parent, ...args) {
  if (name.startsWith('.') && parent && fs.existsSync(path.resolve(path.dirname(parent.filename), name + '.ts')))
    name += '.ts';
  return resolve.call(this, name, parent, ...args);
};
require.extensions['.ts'] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    file,
  );
global.z = require('zod').z;
global._ = require('lodash');
const { Schema } = require(root + '/schema.ts');
const { createRuntime } = require(root + '/运行/host.ts');
const { copy } = require(root + '/运行/core.ts');
const { updateBlock } = require(root + '/运行/message-protocol.ts');
const { normalizeWorldInformation } = require(root + '/运行/世界资料.ts');
const { normalizeMapLandmarks } = require(root + '/运行/地图地标.ts');
const { normalizeGeographicNames } = require(root + '/运行/地理名称.ts');
const block = patches => `<UpdateVariable><JSONPatch>${JSON.stringify(patches)}</JSONPatch></UpdateVariable>`;
function structuredFixtureReply(config, reply) {
  if (config.json_schema?.name !== 'variable_update' || typeof reply !== 'string') return reply;
  try {
    return JSON.stringify({ JSONPatch: JSON.stringify(updateBlock(reply).commands) });
  } catch {
    // Intentionally malformed provider fixtures stay malformed for error tests.
    return reply;
  }
}
const patch = (path, value) => ({ op: 'replace', path, value });
const time = 分 => ({ 年: 2026, 月: 9, 日: 22, 时: 10, 分 });
const endpoint = name => ({ apiurl: `https://${name}.invalid/v1`, model: name, key: `test-${name}` });
const turn = () => new Promise(resolve => setImmediate(resolve));
async function until(check) {
  for (let i = 0; i < 150; i++) {
    if (check()) return;
    await turn();
  }
  throw Error('等待测试阶段超时');
}
function deferred() {
  let resolve;
  const promise = new Promise(r => (resolve = r));
  return { promise, resolve };
}
function seed() {
  return Schema.parse({
    _系统: { 建档完成: true },
    世界: { 当前时间: time(0) },
    玩家: { id: 'player', 姓名: '测试玩家', 当前状态: { 体力值: 80 } },
    角色: { npc: { 姓名: '联系人', 层级: '次要' }, remote: { 姓名: '不在场人物', 层级: '次要', 简介: '完整资料标记' } },
    手机: {
      账号: { me: { 人物id: 'player' }, npc: { 人物id: 'npc' } },
      联系人: { a: { 本人账号id: 'me', 对方账号id: 'npc' }, b: { 本人账号id: 'npc', 对方账号id: 'me' } },
      会话: { chat: { 类型: '私聊', 参与账号id: ['me', 'npc'] } },
    },
  });
}
function environment(initial = seed(), settings = { characterAuto: false, variable: endpoint('variable'), phone: endpoint('phone') }) {
  // 常规双API用例从已迁入当前世界资料的存档开始，首次迁移由资料专项用例覆盖。
  // 沿用实际迁移函数，不更改数据版本、提交记录或其他旧格式字段的缺省情况。
  initial = normalizeWorldInformation(normalizeMapLandmarks(normalizeGeographicNames(copy(initial))));
  const e = {
    chat: 'isolated-test',
    // 此组验证旧双API协议；资料选择另由资料按需加载.spec.cjs显式开启并覆盖。
    character: { 澄湾设置: { informationAuto: false, ...copy(settings) } },
    vars: {},
    messages: [{ role: 'assistant', message: '初始楼层', data: { stat_data: initial }, extra: {} }],
    calls: [],
    parses: 0,
    writes: 0,
    ruleWrites: 0,
    atmosphereEntries: [],
    atmosphereWrites: 0,
    stops: [],
    presetBudget: { max_context: 1000000, max_completion_tokens: 1000, should_stream: false },
    countTokens: message => Math.ceil(JSON.stringify(message).length / 4),
    diskReads: 0,
    mutations: [],
    copyMvuOnReply: false,
    listeners: new Map(),
    story: async () => '已经完成的正文',
    update: async () => block([]),
    rules: ['[mvu_update]变量更新规则', '[mvu_update]变量输出格式'].map((name, uid) => ({
      uid,
      name,
      content: `${name}-当前世界书内容`,
      enabled: true,
      position: { type: 'at_depth', role: 'system', depth: 0, order: 14730 + uid * 10 },
      strategy: { type: 'selective', keys: [] },
    })),
  };
  function messages(range, options = {}) {
    let rows = e.messages.map((m, id) => ({
      ...copy(m),
      message_id: id,
      swipe_id: m.swipe_id ?? 0,
      swipes: copy(m.swipes ?? [m.message]),
      swipes_data: copy(m.swipes_data ?? [m.data ?? {}]),
      swipes_info: Array.from({ length: m.swipes?.length ?? 1 }, (_, index) => copy(
        m.swipe_info?.[index] ?? (index === 0 ? m.extra ?? {} : {}))),
      extra: copy(m.swipe_info?.[m.swipe_id ?? 0] ?? m.extra ?? {}),
    }));
    if (typeof range === 'number') {
      const id = range < 0 ? e.messages.length + range : range;
      rows = rows.filter(m => m.message_id === id);
    } else if (typeof range === 'string' && /^(\d+)-(\d+)$/.test(range)) {
      const [, first, last] = range.match(/^(\d+)-(\d+)$/);
      rows = rows.filter(m => m.message_id >= Number(first) && m.message_id <= Number(last));
    }
    if (options.role) rows = rows.filter(m => m.role === options.role);
    return rows;
  }
  e.sharedFiles = new Map();
  e.localFiles = new Map();
  global.SillyTavern = {
    getCurrentChatId: () => e.chat, saveChat: async () => e.saveDisk(), getRequestHeaders: () => ({}),
    characters: [{ name: 'fixture', avatar: 'fixture.png' }], characterId: '0', groupId: null,
    // Native persisted shape for source checks and server readback verification.
    get chat() { return e.messages.map(m => ({
      mes: m.message, is_user: m.role === 'user', is_system: !!m.is_hidden,
      extra: m.role === 'system' ? { ...m.extra, type: 'narrator' } : m.extra,
      swipe_id: m.swipe_id, swipes: m.swipes, swipe_info: m.swipe_info,
      variables: m.swipes_data ?? [m.data ?? {}],
    })); },
  };
  e.saveDisk = () => { e.diskChat = [{ chat_metadata: { variables: copy(e.vars) } }, ...copy(SillyTavern.chat)]; };
  e.saveDisk();
  e.readDisk = () => Response.json(copy(e.diskChat));
  global.fetch = async (url, options) => {
    const pathname = new URL(url).pathname;
    if (pathname === '/api/chats/get' || pathname === '/api/chats/group/get') { e.diskReads++; return e.readDisk(); }
    if (pathname === '/api/users/me') return Response.json({ handle: 'test-account' });
    if (pathname === '/api/files/upload') {
      const payload = JSON.parse(options.body);
      e.sharedFiles.set('/user/files/' + payload.name, JSON.parse(Buffer.from(payload.data, 'base64').toString('utf8')));
      return Response.json({ path: payload.name });
    }
    return e.sharedFiles.has(pathname) ? Response.json(e.sharedFiles.get(pathname)) : new Response('', { status: 404 });
  };
  global.getVariables = options =>
    copy(
      options.type === 'character'
        ? e.character
        : options.type === 'chat'
          ? e.vars
          : e.messages[options.message_id ?? 0].data,
    );
  global.replaceVariables = async (data, options) => {
    if (options.type === 'character') e.character = copy(data);
    else e.vars = copy(data);
  };
  global.getCharWorldbookNames = () => ({ primary: 'test-worldbook' });
  global.getWorldbook = async () => copy([...e.rules, ...e.atmosphereEntries]);
  global.createWorldbookEntries = async (_book, entries) => {
    const added = entries.map((entry, index) => ({ uid: 100000 + index, ...copy(entry) }));
    e.atmosphereEntries.push(...added); e.atmosphereWrites++;
    return { worldbook: await getWorldbook(), new_entries: copy(added) };
  };
  global.updateWorldbookWith = async (_book, fn) => {
    const next = fn(copy([...e.rules, ...e.atmosphereEntries]));
    const rules = next.filter(entry => entry.name !== '规则｜氛围设计');
    const atmosphere = next.filter(entry => entry.name === '规则｜氛围设计');
    if (!_.isEqual(rules, e.rules)) e.ruleWrites++;
    if (!_.isEqual(atmosphere, e.atmosphereEntries)) e.atmosphereWrites++;
    e.rules = rules; e.atmosphereEntries = atmosphere;
    return copy(next);
  };
  global.window = {
    parent: { TavernHelper: { updateWorldbookWith: global.updateWorldbookWith },
      location: { href: 'http://tavern-fixture.invalid/' },
      localStorage: { getItem: key => e.localFiles.get(key) ?? null, setItem: (key,value) => e.localFiles.set(key,value) } },
    location: { reload() {} },
  };
  Object.defineProperty(global, 'navigator', {
    configurable: true,
    value: { locks: { request: async (_name, options, fn) => (fn ?? options)({}) } },
  });
  global.getLastMessageId = () => e.messages.length - 1;
  global.getPreset = () => ({ settings: e.presetBudget });
  global.builtin = { promptManager: { getTokenHandler: () => ({
    countTokenAsyncFn: message => e.countTokens(message),
  }) } };
  global.getChatMessages = messages;
  global.createChatMessages = async (rows, options) => {
    e.mutations.push({ kind: 'create', refresh: options?.refresh });
    for (const row of copy(rows)) {
      const message = { data: {}, extra: {}, ...row };
      if (e.copyMvuOnReply && message.role === 'assistant' && message.extra.cw_update_pending) {
        message.data = copy(e.messages[0].data);
        message.swipe_info = [{ extra: copy(message.extra) }];
      }
      e.messages.push(message);
    }
  };
  global.setChatMessages = async (rows, options) => {
    e.mutations.push({ kind: 'set', refresh: options?.refresh });
    for (const row of rows) {
      const { message_id, ...fields } = row;
      const message = e.messages[message_id], selected = message.swipe_id ?? 0;
      // 酒馆助手 4.12.1 通过 message/data 区分普通写入；只传 extra 不会写入。
      if ('message' in fields || 'data' in fields) {
        if ('message' in fields) {
          message.message = fields.message;
          if (message.swipes) message.swipes[selected] = fields.message;
        }
        if (fields.data) {
          message.data = copy(fields.data);
          if (message.swipes_data) message.swipes_data[selected] = message.data;
        }
        if (fields.extra) {
          message.extra = copy(fields.extra);
          message.swipe_info = Array.from({ length: message.swipes?.length ?? 1 }, () => ({}));
          message.swipe_info[selected] = message.extra;
        }
      } else if (fields.swipes || fields.swipes_data || fields.swipes_info || 'swipe_id' in fields) {
        message.swipe_id = fields.swipe_id ?? selected;
        message.swipes = copy(fields.swipes ?? message.swipes ?? [message.message]);
        message.swipes_data = copy(fields.swipes_data ?? message.swipes_data ?? [message.data]);
        message.swipe_info = copy(fields.swipes_info ?? message.swipe_info ?? [message.extra]);
        message.message = message.swipes[message.swipe_id];
        message.data = message.swipes_data[message.swipe_id];
        message.extra = message.swipe_info[message.swipe_id];
      }
      e.writes++;
    }
  };
  global.deleteChatMessages = async (ids, options) => {
    e.mutations.push({ kind: 'delete', refresh: options?.refresh });
    e.messages = e.messages.filter((_, i) => !ids.includes(i));
  };
  async function finalConfig(config) {
    const { promptContextText, variableRuleText } = require('../运行/prompt-context.ts');
    const depthEntries = config.overrides?.chat_history?.with_depth_entries !== false;
    const data = { custom_prompt_post_processing: 'strict', messages: [
      { role: 'system', content: '模拟原生世界书/预设' },
      ...(depthEntries ? [
        ...[...e.rules, ...e.atmosphereEntries].filter(entry => entry.enabled)
          .map(({ position, content, name }) => ({ role: position?.role ?? 'system',
            content: name.startsWith('[mvu_update]') ? variableRuleText(content.replace(/^# \{\{chengwan_variables\}\}\r?\n|^# \{\{chengwan_variables_end\}\}\r?\n?/gm,'')) : content }))
          .filter(entry => entry.content.trim()),
        ...[promptContextText(() => e.state())].filter(Boolean).map(content => ({ role: 'system', content })),
      ] : []),
      ...[...(config.injects ?? []), ...(config.ordered_prompts ?? []), ...(config.overrides?.chat_history?.prompts ?? [])]
        .filter(p => typeof p === 'object').map(({ role, content }) => ({ role, content })),
      { role: 'user', content: config.user_input ?? '' },
      { role: 'system', content: '模拟原生预设尾部' },
    ] };
    if(e.emitNativeSettings)await e.emitNativeSettings(data);else await e.listeners.get('completion_settings')?.(data);
    if (e.stops.includes(config.generation_id)) throw Error('模拟已取消请求');
    return { ...config, finalMessages: copy(data.messages) };
  }
  global.generate = async config => {
    const final = await finalConfig(config);
    const stage = e.runtime.view.phase;
    e.calls.push({ kind: stage === 'story' ? 'story' : 'update', stage, config: copy(final) });
    return structuredFixtureReply(config, await (stage === 'story' ? e.story(final) : e.update(final)));
  };
  global.generateRaw = async () => { throw Error('角色卡请求必须携带预设'); };
  global.stopGenerationById = id => { e.stops.push(id); };
  global.formatAsTavernRegexedString = text => text;
  global.eventOn = (event, fn) => {
    e.listeners.set(event, fn);
    return {
      stop() {
        e.listeners.delete(event);
      },
    };
  };
  global.eventRemoveListener = (event, fn) => {
    if (e.listeners.get(event) === fn) e.listeners.delete(event);
  };
  global.iframe_events = { STREAM_TOKEN_RECEIVED_FULLY: 'stream' };
  global.tavern_events = {
    CHAT_CHANGED: 'chat',
    MESSAGE_SWIPED: 'swipe',
    MESSAGE_EDITED: 'edited',
    MESSAGE_DELETED: 'delete',
    MESSAGE_UPDATED: 'edit',
    USER_MESSAGE_RENDERED: 'user_rendered',
    CHARACTER_MESSAGE_RENDERED: 'character_rendered',
    CHAT_COMPLETION_SETTINGS_READY: 'completion_settings',
    GENERATION_STOPPED: 'generation_stopped',
  };
  global.Mvu = {
    events: { VARIABLE_UPDATE_ENDED: 'mvu' },
    getMvuData: options => copy(e.messages[options.message_id].data),
    replaceMvuData: async (data, options) => {
      e.messages[options.message_id].data = copy(data);
      e.writes++;
    },
    parseMessage: async (text, old) => {
      e.parses++;
      const data = copy(old);
      for (const command of updateBlock(text).commands) {
        const parts = command.path
          .split('/')
          .slice(1)
          .map(p => p.replaceAll('~1', '/').replaceAll('~0', '~'));
        if (command.op === 'remove') _.unset(data.stat_data, parts);
        else if (['replace', 'add', 'insert'].includes(command.op)) _.set(data.stat_data, parts, copy(command.value));
        else throw Error('测试补丁不支持此操作');
      }
      return data;
    },
  };
  e.runtime = createRuntime();
  e.state = () => e.runtime.view.data;
  return e;
}
async function withEnv(fn, initial, settings) {
  const e = environment(initial, settings);
  await e.runtime.start();
  try {
    await fn(e);
  } finally {
    await e.runtime.dispose();
  }
}


module.exports = { Schema, copy, environment, withEnv, block, patch, endpoint, until, deferred, createRuntime };
