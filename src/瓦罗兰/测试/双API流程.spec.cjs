const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const assert = require('node:assert/strict');
const { test } = require('node:test');
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
const { SettingsSchema, validateSettings, createSettingsController, apiBrowserKey } = require(root + '/运行/settings.ts');
const { createRuntime, activeContext } = require(root + '/运行/host.ts');
const { livePromptConfig } = require(root + '/运行/prompts.ts');
const { finalizeWorkerPrompt, workerTask } = require(root + '/运行/worker-task.ts');
const { connectRuntime } = require(root + '/运行/bridge.ts');
const { copy } = require(root + '/运行/core.ts');
const { prepareLibraryCommand, LibrarySchema, libraryView } = require(root + '/运行/character-library.ts');
const { validateModel } = require(root + '/运行/core.ts');
const { pendingUpdateTasks, withUpdateTasks } = require(root + '/运行/update-tasks.ts');
const { stripProtocol, storedNarrative, updateBlock } = require(root + '/运行/message-protocol.ts');
const { parseAndValidateCharacterJson } = require(root + '/界面/桌面端/utils/char_importer.ts');
const { displayedMessage } = require(root + '/界面/桌面端/utils/message-display.ts');
const { systemGoods } = require(root + '/运行/novel-system.ts');
const { createProfile } = require(root + '/运行/creation.ts');
const { openingMessage } = require(root + '/运行/opening.ts');
const { exportCharacter, importCharacter } = require(root + '/运行/characters.ts');
const { normalizeWorldInformation } = require(root + '/运行/世界资料.ts');
const { normalizeMapLandmarks } = require(root + '/运行/地图地标.ts');
const { normalizeGeographicNames } = require(root + '/运行/地理名称.ts');
const block = patches => `<UpdateVariable><JSONPatch>${JSON.stringify(patches)}</JSONPatch></UpdateVariable>`;
// Opt in only in fixtures that intend to finish the pending life checks.
function lifeCheckedBlock(state, patches = [], updated = {}) {
  const targets = [...new Set(pendingUpdateTasks(state)
    .filter(id => ['生活更新', '自然融入', '升格'].includes(state._系统.任务[id].类别))
    .flatMap(id => state._系统.任务[id].目标id))];
  const receipts = Object.fromEntries(targets.map(id => [id, updated[id]
    ? { 结果: '已更新', 依据: updated[id] }
    : { 结果: '无变化', 依据: '本次检查覆盖区间内无新增事实，保留既定生活状态' }]));
  return block(patches).replace('</UpdateVariable>', '<LifeCheck>' + JSON.stringify(receipts) + '</LifeCheck></UpdateVariable>');
}
const patch = (path, value) => ({ op: 'replace', path, value });
const time = 分 => ({ 年: 2026, 月: 9, 日: 22, 时: 10, 分 });
const publicPerson = person => { const result = copy(person); delete result._管理; delete result._更新循环; return result; };
const endpoint = name => ({ apiurl: `https://${name}.invalid/v1`, model: name, key: `test-${name}` });
const turn = () => new Promise(resolve => setImmediate(resolve));


test('建档说明仅临时注入：失败重试仍可用，成功后退出，历史不保存长清单', async () => {
  await withEnv(async e => {
    await e.runtime.createProfile({ player: { 姓名: '建档测试者' }, characters: [] });
    const configs = [];
    e.story = async config => {
      assert.match(JSON.stringify(config.injects), /本次开场专用/);
      assert.equal(e.messages.at(-1).message, openingMessage);
      return '清晨，玩家在住所整理书桌。';
    };
    e.update = async config => {
      configs.push(config);
      assert.match(JSON.stringify(config), /本次建档变量整理/);
      throw Error('模拟首次建档结算失败');
    };
    await assert.rejects(e.runtime.startOpening(), /模拟首次建档结算失败/);
    const saved = e.messages.map(m => m.message).join('\n');
    assert(!saved.includes('本次开场专用'));
    assert(!saved.includes('本次建档变量整理'));
    e.update = async config => {
      configs.push(config);
      assert.match(JSON.stringify(config), /本次建档变量整理/);
      return block([patch('/玩家/外貌/体型', '匀称')]);
    };
    await e.runtime.retry();
    assert.equal(e.state().玩家.外貌.体型, '匀称');
    assert.equal(e.messages.filter(m => m.role === 'user' && m.message === openingMessage).length, 1);
    e.story = async config => {
      assert(!JSON.stringify(config).includes('本次开场专用'));
      return '玩家观察窗外。';
    };
    e.update = async config => {
      assert(!JSON.stringify(config).includes('本次建档变量整理'));
      return block([]);
    };
    await e.runtime.send('看看窗外');
    assert.equal(configs.length, 2);
  }, Schema.parse({}));
});
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
      extra: copy(m.swipe_info?.[0] ?? m.extra ?? {}),
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
  global.SillyTavern = { getCurrentChatId: () => e.chat, saveChat: async () => {}, getRequestHeaders: () => ({}) };
  global.fetch = async (url, options) => {
    const pathname = new URL(url).pathname;
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
  global.getWorldbook = async () => copy(e.rules);
  global.updateWorldbookWith = async (_book, fn) => {
    e.ruleWrites++;
    e.rules = fn(copy(e.rules));
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
      Object.assign(e.messages[message_id], copy(fields));
      const selected = e.messages[message_id].swipe_id;
      if (selected !== undefined && e.messages[message_id].swipes_data && fields.data)
        e.messages[message_id].swipes_data[selected] = copy(fields.data);
      if (selected !== undefined && e.messages[message_id].swipes && fields.message !== undefined)
        e.messages[message_id].swipes[selected] = fields.message;
      if (fields.extra && e.messages[message_id].swipe_info) e.messages[message_id].swipe_info[0] = copy(fields.extra);
      e.writes++;
    }
  };
  global.deleteChatMessages = async (ids, options) => {
    e.mutations.push({ kind: 'delete', refresh: options?.refresh });
    e.messages = e.messages.filter((_, i) => !ids.includes(i));
  };
  global.generate = async config => {
    e.calls.push({ kind: config.custom_api ? 'preset-update' : 'story', config: copy(config) });
    return config.custom_api ? e.update(config) : e.story(config);
  };
  global.generateRaw = async config => {
    e.calls.push({ kind: 'update', config: copy(config) });
    return e.update(config);
  };
  global.stopGenerationById = () => {};
  global.formatAsTavernRegexedString = text => text;
  global.eventOn = (event, fn) => {
    e.listeners.set(event, fn);
    return {
      stop() {
        e.listeners.delete(event);
      },
    };
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

const novelGoodReply = (name = '城市便携杯') => JSON.stringify({ 商品: [{
  名称: name, 价格: 12, 类别: '工具与设备', 描述: '普通便携水杯，无超常效果。', 稀有: false, 限购: 1,
}] });

test('技能栏可经建档保存，主次角色种族形态经导入导出与关闭恢复保留', () => {
  const skills = { cooking: { 名称: '烹饪', 品质: '生活精通', 描述: '擅长家常菜' } };
  const created = createProfile(Schema.parse({}), { player: { 姓名: '测试玩家', 技能栏: skills }, characters: [] });
  assert.deepEqual(created.玩家.技能栏, skills);
  for (const 层级 of ['主要', '次要']) {
    const raw = { id: 'shape_person', 姓名: '形态验证人物', 层级, 种族: '自定义种族', 当前形态: '常态' };
    const input = JSON.stringify(raw);
    const result = parseAndValidateCharacterJson(input);
    assert.equal(result.success, true, result.error);
    const state = seed();
    importCharacter(state, result.charId, result.mappedCharacter);
    const pack = exportCharacter(state, result.charId);
    const reimported = parseAndValidateCharacterJson(pack);
    assert.equal(reimported.success, true, reimported.error);
    assert.equal(reimported.mappedCharacter.种族, raw.种族);
    assert.equal(reimported.mappedCharacter.当前形态, raw.当前形态);
    const disabled = prepareLibraryCommand(state, undefined, { kind: 'enabled', ids: [raw.id], enabled: false });
    assert(!disabled.state.角色[raw.id]);
    const restored = prepareLibraryCommand(disabled.state, disabled.library, { kind: 'enabled', ids: [raw.id], enabled: true });
    assert.equal(restored.state.角色[raw.id].种族, raw.种族);
    assert.equal(restored.state.角色[raw.id].当前形态, raw.当前形态);
    assert.equal(JSON.stringify(raw), input);
  }
});

test('新技能品质和角色形态可经MVU正文结算落到消息快照，并进入后续变量请求', async () => {
  await withEnv(async e => {
    e.story = async () => '玩家完成烹饪练习，联系人按明确设定恢复常态。';
    e.update = async () => block([
      { op: 'insert', path: '/玩家/技能栏/cooking', value: { 名称: '家常烹饪', 品质: '入门', 描述: '能独立完成一道家常菜' } },
      patch('/角色/npc/种族', '自定义种族'),
      patch('/角色/npc/当前形态', '常态'),
    ]);
    await e.runtime.send('按已有设定继续练习');
    const saved = e.messages.at(-1).data.stat_data;
    assert.deepEqual(saved.玩家.技能栏, e.state().玩家.技能栏);
    assert.equal(saved.玩家.技能栏.cooking.品质, '入门');
    assert.equal(saved.角色.npc.种族, '自定义种族');
    assert.equal(saved.角色.npc.当前形态, '常态');
    const config = await livePromptConfig(e.state(), '后续互动', 'worker');
    const projected = config.injects.map(item => { try { return JSON.parse(item.content); } catch { return null; } })
      .find(item => item?.玩家 && item?.角色);
    assert.deepEqual(projected.玩家.技能栏, saved.玩家.技能栏);
    assert.equal(projected.角色.npc.种族, saved.角色.npc.种族);
    assert.equal(projected.角色.npc.当前形态, saved.角色.npc.当前形态);
    assert.equal(e.runtime.view.messages.at(-1).variableUpdate.state, 'saved');
  });
});

test('P1 API配置：三通道独立保存、跨浏览器及重新导卡读取，命名空间不触碰澄湾', async () => {
  const e = environment(), controller = createSettingsController();
  const legacy = copy(e.character);
  const sister = { version: 1, value: endpoint('sister-only') };
  e.sharedFiles.set('/user/files/chengwan-shanghai-v2-api-variable.json', sister);
  for (const channel of ['variable', 'phone', 'information']) {
    const api = { ...endpoint('shared-' + channel), key: '合成钥匙🔑', ...(channel === 'information' ? { reuseVariable: false } : {}) };
    const saved = await controller.save({ [channel]: api }, channel);
    assert.equal(saved.warning, '');
    assert.deepEqual(JSON.parse(e.localFiles.get(apiBrowserKey(channel, 'test-account'))), saved.value[channel]);
  }
  assert.deepEqual(e.character, legacy, '独立API保存不改旧角色卡配置');
  assert.deepEqual(e.sharedFiles.get('/user/files/chengwan-shanghai-v2-api-variable.json'), sister);
  e.localFiles.clear();
  e.character.澄湾设置 = {};
  window.parent.location.href = 'http://192.168.1.22:8000/';
  const loaded = await createSettingsController().load();
  assert.equal(loaded.warning, '');
  for (const channel of ['variable', 'phone', 'information']) {
    assert.equal(loaded.value[channel].model, 'shared-' + channel);
    assert.equal(loaded.value[channel].key, '合成钥匙🔑');
  }
  assert.equal(loaded.value.information.reuseVariable, false);
  assert.notEqual(apiBrowserKey('variable', 'account-A'), apiBrowserKey('variable', 'account-B'));
  assert.equal(e.calls.length, 0);
});

test('P1 API配置：旧设置直接读取，资料默认复用变量连接，解析幂等且不写存档', async () => {
  const e = environment();
  const before = copy(e.character);
  const loaded = await createSettingsController().load();
  assert.deepEqual(loaded.value, SettingsSchema.parse(e.character.澄湾设置));
  assert.equal(loaded.value.information.reuseVariable, true);
  assert.deepEqual(SettingsSchema.parse(loaded.value), loaded.value);
  assert.deepEqual(e.character, before);
  assert.equal(e.sharedFiles.size, 0, '读取不自动迁移或覆盖配置');
});

test('P1 API配置：服务器优先，明确清空覆盖本地副本；离线保留副本并提示', async () => {
  const e = environment(), controller = createSettingsController();
  await controller.save({ variable: endpoint('cached-variable') }, 'variable');
  const online = global.fetch;
  global.fetch = async (url, options) => String(url).includes('/user/files/') ? Promise.reject(Error('隔离离线')) : online(url, options);
  const offline = await controller.load();
  assert.equal(offline.value.variable.model, 'cached-variable');
  assert.match(offline.warning, /已使用浏览器副本/);
  global.fetch = online;
  e.sharedFiles.set('/user/files/valoran-v1-api-variable.json', { version: 1, value: {} });
  const cleared = await controller.load();
  assert.equal(cleared.value.variable.apiurl, '');
  assert.equal(JSON.parse(e.localFiles.get(apiBrowserKey('variable','test-account'))).apiurl, '');
});

test('P1 API配置：写入拒绝或读回不符不更新浏览器副本及运行连接', async () => {
  for (const failure of ['upload', 'readback']) await withEnv(async e => {
    const before = copy(e.runtime.settings), originalFetch = global.fetch;
    e.localFiles.set(apiBrowserKey('variable','test-account'), JSON.stringify(before.variable));
    global.fetch = async (url, options) => new URL(url).pathname === '/api/files/upload'
      ? failure === 'upload' ? new Response('', {status:403}) : Response.json({path:'not-written'}) : originalFetch(url, options);
    await assert.rejects(e.runtime.saveSettings({...before,variable:endpoint('new')},'variable'),
      failure === 'upload' ? /HTTP 403/ : /读回不一致/);
    assert.deepEqual(e.runtime.settings, before);
    assert.deepEqual(JSON.parse(e.localFiles.get(apiBrowserKey('variable','test-account'))),before.variable);
    assert.equal(e.calls.length, 0);
  });
});

test('P1 API配置：服务器已保存而浏览器不可写，采用已读回的连接并明确提示', async () => {
  await withEnv(async e => {
    window.parent.localStorage.setItem = () => { throw Error('quota'); };
    const warning = await e.runtime.saveSettings({...copy(e.runtime.settings),phone:endpoint('server-confirmed')},'phone');
    assert.match(warning,/酒馆共用配置已保存，浏览器副本保存失败/);
    assert.equal(e.runtime.settings.phone.model,'server-confirmed');
    assert.equal(e.sharedFiles.get('/user/files/valoran-v1-api-phone.json').value.model,'server-confirmed');
    assert.equal(e.runtime.view.error,'');
    assert.equal(e.calls.length,0);
  });
});

test('P1 API配置：损坏服务器记录不重置已保存连接，告警与剧情错误独立', async () => {
  await withEnv(async e => {
    await e.runtime.saveSettings({...copy(e.runtime.settings),variable:endpoint('valid-cache')},'variable');
    e.sharedFiles.set('/user/files/valoran-v1-api-variable.json',{version:99,value:{}});
    const warning=await e.runtime.reloadSettings('variable');
    assert.match(warning,/格式不兼容/);
    assert.equal(e.runtime.settings.variable.model,'valid-cache');
    assert.equal(e.runtime.view.error,'');
    assert.equal(e.runtime.view.settingsWarning,warning);
  });
});

test('P1 API配置：单通道读取不改另一通道，重新初始化可恢复服务器完整配置', async () => {
  await withEnv(async e => {
    for(const channel of ['variable','phone'])await e.runtime.saveSettings({...copy(e.runtime.settings),[channel]:endpoint('saved-'+channel)},channel);
    e.sharedFiles.set('/user/files/valoran-v1-api-variable.json',{version:1,value:endpoint('remote-variable')});
    e.sharedFiles.set('/user/files/valoran-v1-api-phone.json',{version:1,value:endpoint('remote-phone')});
    await e.runtime.reloadSettings('phone');
    assert.equal(e.runtime.settings.variable.model,'saved-variable');
    assert.equal(e.runtime.settings.phone.model,'remote-phone');
    await e.runtime.dispose();
    e.localFiles.clear();
    e.character.澄湾设置={};
    e.runtime=createRuntime();await e.runtime.start();
    assert.equal(e.runtime.settings.variable.model,'remote-variable');
    assert.equal(e.runtime.settings.phone.model,'remote-phone');
    assert.equal(e.calls.length,0);
  });
});

test('P1 API配置：两表单并行保存完成顺序相反，不能覆盖另一已确认通道', async () => {
  await withEnv(async e => {
    const originalFetch=global.fetch,waiting=deferred();let blocked=false;
    global.fetch=async(url,options)=>{
      if(new URL(url).pathname==='/user/files/valoran-v1-api-variable.json'&&!blocked){blocked=true;await waiting.promise;}
      return originalFetch(url,options);
    };
    const before=copy(e.runtime.settings);
    const first=e.runtime.saveSettings({...before,variable:endpoint('new-variable')},'variable');
    await until(()=>blocked);
    await e.runtime.saveSettings({...before,phone:endpoint('new-phone')},'phone');
    waiting.resolve();await first;
    assert.equal(e.runtime.settings.variable.model,'new-variable');
    assert.equal(e.runtime.settings.phone.model,'new-phone');
  });
});

test('P1 API配置：独立资料端点只用于地点组织选择，正文变量继续原通道', async () => {
  await withEnv(async e => {
    e.update=async config=>config.ordered_prompts?.some(p=>typeof p==='object'&&p.content?.includes('本轮已完成正文'))
      ? block([]):JSON.stringify({地点:[],组织:[]});
    await e.runtime.send('看看周围');
    const raw=e.calls.filter(call=>call.kind==='update');
    assert.equal(raw[0].config.custom_api.model,'information');
    assert.equal(raw.at(-1).config.custom_api.model,'variable');
    assert.equal(e.calls.filter(call=>call.kind==='story').length,1);
  },seed(),{characterAuto:false,informationAuto:true,variable:endpoint('variable'),phone:endpoint('phone'),information:{...endpoint('information'),reuseVariable:false}});
});

const initialNovelReply = () => JSON.stringify({
  商品: JSON.parse(novelGoodReply()).商品,
  任务: [{ 名称: '记录一种街景色彩', 类型: '探索', 难度: '基础', 目标: '自选一处公共街景，实际观察并记录色彩细节。' }],
});

test('初始内容用一次手机端点请求同时保存任务和新品，保存重试不重复生成或赠币', async () => {
  await withEnv(async e => {
    await e.runtime.novelAction({ kind: 'enable', operationId: 'enable' });
    e.update = async () => initialNovelReply();
    let fail = true;
    global.SillyTavern.saveChat = async () => { if (fail) { fail = false; throw Error('初始内容保存未确认'); } };
    await assert.rejects(e.runtime.novelRefresh('initial'), /保存未确认/);
    assert.equal(e.calls.length, 1);
    assert.equal(e.calls[0].config.custom_api.apiurl, endpoint('phone').apiurl);
    assert.equal(Object.keys(e.vars.澄湾待确认提交.candidate.奇遇系统.任务).length, 4);
    assert.equal(Object.keys(e.vars.澄湾待确认提交.candidate.奇遇系统._商店商品).length, 1);
    assert.equal(Object.keys(e.state().奇遇系统.任务).length, 3);
    assert.equal(e.state().奇遇系统._系统币, 30);
    assert.match(e.runtime.view.recoverable[0].label, /初始任务与商品/);
    await e.runtime.resumeQueued(e.runtime.view.recoverable[0].id);
    assert.equal(e.calls.length, 1);
    assert.equal(Object.keys(e.state().奇遇系统.任务).length, 4);
    assert.equal(Object.keys(e.state().奇遇系统._商店商品).length, 1);
    assert.equal(e.runtime.view.recoverable.length, 0);
    assert.equal(e.vars.澄湾待确认提交, null);
    assert.equal(Object.keys(e.state().奇遇系统._流水).length, 1);
    assert.equal(e.parses, 0);
    assert.equal(e.messages.length, 1);
  });
});

test('初始请求失败重载后保留恢复入口，只恢复内容请求，不重做开启和赠礼', async () => {
  await withEnv(async e => {
    await e.runtime.novelAction({ kind: 'enable', operationId: 'enable' });
    e.update = async () => { throw Error('初始内容生成失败'); };
    await assert.rejects(e.runtime.novelRefresh('initial'), /初始内容生成失败/);
    const id = e.runtime.view.recoverable[0].id;
    await e.runtime.dispose();
    e.runtime = createRuntime();
    await e.runtime.start();
    assert.equal(e.runtime.view.recoverable[0].id, id);
    assert.equal(e.vars.澄湾排队操作[0].target, 'initial');
    assert.equal(e.state().奇遇系统._启用, true);
    assert.equal(e.state().奇遇系统._系统币, 30);
    e.update = async () => initialNovelReply();
    await e.runtime.resumeQueued(id);
    assert.equal(e.calls.length, 2);
    assert.equal(e.runtime.view.recoverable.length, 0);
    assert.equal(Object.keys(e.state().奇遇系统._流水).length, 1);
    assert.equal(Object.keys(e.state().奇遇系统.任务).length, 4);
    assert.equal(Object.keys(e.state().奇遇系统._商店商品).length, 1);
  });
});

test('奇遇刷新与手机共用独立端点，最终请求不携带存档或变量规则', async () => {
  await withEnv(async e => {
    await e.runtime.novelAction({ kind: 'enable', operationId: 'enable' });
    e.update = async config => {
      assert.equal(config.custom_api.model, 'phone');
      assert(!config.ordered_prompts.some(p => typeof p === 'string' && p !== 'user_input'));
      const messages = [{ role: 'system', content: JSON.stringify(e.state()) },
        { role: 'system', content: '外部预设的私有插入标记' }, { role: 'user', content: config.user_input }];
      e.listeners.get('completion_settings')({ messages });
      const payload = JSON.stringify(messages);
      for (const text of ['完整资料标记', '不在场人物', '外部预设的私有插入标记', '_系统币', '[chengwan-', '<UpdateVariable>'])
        assert(!payload.includes(text));
      return novelGoodReply();
    };
    global.window.parent.__chengwanService = { ready: true, runtime: e.runtime };
    const connection = connectRuntime(e.runtime);
    try {
      await connection.runtime.novelRefresh('shop');
      assert.equal(e.calls.length, 1);
      assert.equal(e.parses, 0);
      const good = systemGoods(e.state()).find(g => g.name === '城市便携杯');
      assert(good);
      assert(connection.runtime.view.data.奇遇系统._商店商品[good.id]);
      await connection.runtime.novelAction({ kind: 'buy', id: good.id, operationId: 'buy-new' });
      assert.equal(e.state().奇遇系统._系统币, 18);
      assert.equal(e.state().玩家.物品栏['cw_system_item_' + good.id].数量, 1);
      assert.equal(e.calls.length, 1);
    } finally { connection.disconnect(); }
  }, seed(), { phone: endpoint('phone') });
});

test('任务刷新只补新目标，保留玩家、时间、所有旧任务和接取进度', async () => {
  await withEnv(async e => {
    await e.runtime.novelAction({ kind: 'enable', operationId: 'enable' });
    const id = Object.keys(e.state().奇遇系统.任务)[0];
    await e.runtime.novelAction({ kind: 'accept', id, operationId: 'accept' });
    e.messages[0].data.stat_data.奇遇系统.任务[id].进度 = 37;
    e.runtime.refresh();
    const before = copy(e.state());
    e.update = async () => JSON.stringify({ 任务: [{ 名称: '整理桌面', 类型: '成长', 难度: '基础', 目标: '自选一处桌面实际整理。' }] });
    await e.runtime.novelRefresh('tasks');
    assert.equal(Object.keys(e.state().奇遇系统.任务).length, 4);
    assert.deepEqual(e.state().玩家, before.玩家);
    assert.deepEqual(e.state().世界, before.世界);
    for (const taskId of Object.keys(before.奇遇系统.任务))
      assert.deepEqual(e.state().奇遇系统.任务[taskId], before.奇遇系统.任务[taskId]);
    assert.deepEqual(e.state().奇遇系统._任务记录, before.奇遇系统._任务记录);
    assert.equal(e.state().奇遇系统._系统币, 30);
    assert.equal(e.messages.length, 1);
  });
});

test('刷新失败保留原内容与已有恢复队列，手动重试成功后清理记录', async () => {
  await withEnv(async e => {
    await e.runtime.novelAction({ kind: 'enable', operationId: 'enable' });
    const before = copy(e.state().奇遇系统);
    e.update = async () => { throw Error('模拟连接失败'); };
    await assert.rejects(e.runtime.novelRefresh('shop'), /模拟连接失败/);
    assert.deepEqual(e.state().奇遇系统, before);
    assert.equal(e.runtime.view.recoverable.length, 1);
    e.update = async () => novelGoodReply();
    await e.runtime.retry();
    assert.equal(e.calls.length, 2);
    assert.equal(Object.keys(e.state().奇遇系统._商店商品).length, 1);
    assert.equal(e.runtime.view.recoverable.length, 0);
    assert.equal(e.runtime.view.error, '');
  });
});

test('刷新保存未确认后恢复只确认保存，不重复调用 API 或新增商品', async () => {
  await withEnv(async e => {
    await e.runtime.novelAction({ kind: 'enable', operationId: 'enable' });
    e.update = async () => novelGoodReply();
    let fail = true;
    global.SillyTavern.saveChat = async () => { if (fail) { fail = false; throw Error('模拟保存失败'); } };
    await assert.rejects(e.runtime.novelRefresh('shop'), /模拟保存失败/);
    assert(e.vars.澄湾待确认提交);
    const id = e.runtime.view.recoverable[0].id;
    await e.runtime.resumeQueued(id);
    assert.equal(e.calls.length, 1);
    assert.equal(Object.keys(e.state().奇遇系统._商店商品).length, 1);
    assert.equal(e.runtime.view.recoverable.length, 0);
    assert.equal(e.runtime.view.error, '');
    assert.equal(e.vars.澄湾待确认提交, null);
  });
});

test('刷新期间拒绝重复请求，停止后忽略模型结果且不清空旧内容', async () => {
  await withEnv(async e => {
    await e.runtime.novelAction({ kind: 'enable', operationId: 'enable' });
    const before = copy(e.state().奇遇系统), gate = deferred();
    e.update = () => gate.promise;
    const operation = e.runtime.novelRefresh('shop');
    await until(() => e.calls.length === 1);
    assert.equal(e.runtime.view.operation, 'novel');
    assert.throws(() => e.runtime.novelRefresh('tasks'), /正在生成|当前正在/);
    e.runtime.stop();
    gate.resolve(novelGoodReply());
    await assert.rejects(operation, /取消/);
    assert.deepEqual(e.state().奇遇系统, before);
    assert.equal(e.runtime.view.recoverable.length, 0);
    assert.equal(e.runtime.view.busy, false);
  });
});

test('无效刷新内容可移除失败请求，原存档保留且按钮恢复可操作', async () => {
  await withEnv(async e => {
    await e.runtime.novelAction({ kind: 'enable', operationId: 'enable' });
    e.update = async () => JSON.stringify({ 商品: [], _系统币: 9999 });
    await assert.rejects(e.runtime.novelRefresh('shop'));
    await e.runtime.cancelQueued(e.runtime.view.recoverable[0].id);
    assert.equal(e.runtime.view.error, '');
    assert.equal(e.runtime.view.recoverable.length, 0);
    assert.equal(e.state().奇遇系统._系统币, 30);
    assert.deepEqual(e.state().奇遇系统._商店商品, {});
  });
});

test('奇遇系统开启与购买走本地统一保存，镜像即时同步且不请求模型', async () => {
  await withEnv(async e => {
    global.window.parent.__chengwanService = { ready: true, runtime: e.runtime };
    const connection = connectRuntime(e.runtime);
    try {
      await connection.runtime.novelAction({ kind: 'enable', operationId: 'enable-system' });
      assert.equal(e.state().奇遇系统._系统币, 30);
      assert.equal(connection.runtime.view.data.奇遇系统._系统币, 30);
      assert.equal(Object.keys(e.state().奇遇系统.任务).length, 3);
      const id = Object.keys(e.state().奇遇系统.任务)[0];
      await connection.runtime.novelAction({ kind: 'accept', id, operationId: 'accept-task' });
      await connection.runtime.novelAction({ kind: 'buy', id: 'water', operationId: 'purchase-water' });
      assert.equal(e.state().奇遇系统._系统币, 22);
      assert.equal(connection.runtime.view.data.奇遇系统._系统币, 22);
      assert.equal(e.state().玩家.物品栏.cw_system_item_water.数量, 1);
      assert.equal(e.state().奇遇系统._任务记录[id].状态, '进行中');
      assert.equal(e.calls.length, 0);
    } finally { connection.disconnect(); }
  });
});

test('奇遇命令等待保存和正文生成期间拒绝重复操作，不在请求结束后偷偷执行', async () => {
  await withEnv(async e => {
    await e.runtime.novelAction({ kind: 'enable', operationId: 'enable' });
    const save = deferred();
    const originalSave = SillyTavern.saveChat;
    SillyTavern.saveChat = () => save.promise;
    const buying = e.runtime.novelAction({ kind: 'buy', id: 'water', operationId: 'buy-once' });
    try {
      await until(() => e.runtime.view.updating);
      assert.throws(() => e.runtime.novelAction({ kind: 'buy', id: 'water', operationId: 'duplicate' }), /正在生成、结算/);
    } finally {
      save.resolve();
      await buying;
      SillyTavern.saveChat = originalSave;
    }
    assert.equal(e.state().奇遇系统._系统币, 22);
    assert.equal(e.state().玩家.物品栏.cw_system_item_water.数量, 1);
    const story = deferred();
    e.story = () => story.promise;
    const sending = e.runtime.send('正在生成的正文');
    try {
      await until(() => e.calls.length === 1);
      assert.throws(() => e.runtime.novelAction({ kind: 'buy', id: 'water', operationId: 'during-story' }), /正在生成、结算/);
    } finally {
      e.runtime.stop();
      story.resolve('已停止的回复');
      await assert.rejects(sending);
    }
    assert.equal(e.state().奇遇系统._系统币, 22);
    assert.equal(e.state().玩家.物品栏.cw_system_item_water.数量, 1);
  });
});

test('奇遇桥接在操作等待、成功和失败时即时同步，不要求界面轮询或布局代码', async () => {
  environment();
  const value = { view: { updating: false, error: '', data: { 奇遇系统: { _系统币: 30 } } }, settings: {} };
  let gate = deferred();
  let refreshes = 0;
  const remote = {
    snapshot: () => JSON.stringify(value),
    refreshMessages: () => { refreshes++; },
    novelAction: async () => {
      value.view.updating = true;
      try {
        await gate.promise;
        value.view.data.奇遇系统._系统币 -= 8;
      } catch (error) {
        value.view.error = String(error);
        throw error;
      } finally { value.view.updating = false; }
    },
  };
  global.window.parent.__chengwanService = { ready: true, runtime: remote };
  const connection = connectRuntime(remote);
  try {
    const first = connection.runtime.novelAction({ kind: 'buy', id: 'water', operationId: 'one' });
    assert.equal(connection.runtime.view.updating, true);
    gate.resolve();
    await first;
    assert.equal(connection.runtime.view.updating, false);
    assert.equal(connection.runtime.view.data.奇遇系统._系统币, 22);
    let reject;
    gate = { promise: new Promise((resolve, no) => { reject = no; }) };
    const failed = connection.runtime.novelAction({ kind: 'buy', id: 'water', operationId: 'two' });
    reject(Error('本次保存失败'));
    await assert.rejects(failed, /保存失败/);
    assert.equal(connection.runtime.view.updating, false);
    assert.match(connection.runtime.view.error, /保存失败/);
    assert.equal(connection.runtime.view.data.奇遇系统._系统币, 22);
    assert.equal(refreshes, 0);
  } finally { connection.disconnect(); }
});

test('旧存档未含奇遇分组仍可完成正文结算，新任务规则进入独立请求', async () => {
  const legacy = seed(); delete legacy.奇遇系统;
  await withEnv(async e => {
    e.story = () => '玩家继续正常的日常生活。';
    e.update = () => block([]);
    await e.runtime.send('继续散步');
    assert.equal(e.state().奇遇系统._启用, false);
    assert.equal(e.state().奇遇系统._系统币, 0);
    assert.equal(e.calls.length, 2);
    assert.ok(JSON.stringify(e.calls[1].config).includes('玩家尚未开启奇遇系统'));
  }, legacy);
});

test('奇遇任务进展随正文结算，只有主动领取才发币，接取信息进入最终提示', async () => {
  await withEnv(async e => {
    await e.runtime.novelAction({ kind: 'enable', operationId: 'enable' });
    const id = Object.keys(e.state().奇遇系统.任务)[0];
    await e.runtime.novelAction({ kind: 'accept', id, operationId: 'accept' });
    e.story = () => '玩家自主享用一顿早餐，并认真品尝了味道。';
    e.update = () => block([
      { op: 'add', path: '/事件/meal-proof', value: { 事实: '玩家在接取后享用早餐并分享具体感受', 参与者: { player: '用餐者' } } },
      patch('/奇遇系统/任务/' + id + '/进度', 100),
      patch('/奇遇系统/任务/' + id + '/完成依据事件id', ['meal-proof']),
    ]);
    await e.runtime.send('我吃一顿早餐');
    assert.equal(e.state().奇遇系统.任务[id].进度, 100);
    assert.equal(e.state().奇遇系统._系统币, 30);
    assert.ok(JSON.stringify(e.calls[1].config).includes('不能发币'));
    assert.ok(JSON.stringify(e.calls[1].config).includes('进行中'));
    await e.runtime.novelAction({ kind: 'claim', id, operationId: 'claim' });
    assert.equal(e.state().奇遇系统._系统币, 45);
    assert.equal(e.state().奇遇系统._任务记录[id].状态, '已领取');
  });
});

test('旧设置迁移为独立 API，保留连接且允许另一组留空', () => {
  const result = SettingsSchema.parse({ variable: { ...endpoint('v'), mode: 'main' }, phone: endpoint('p') });
  assert.equal(result.variable.mode, 'extra');
  assert.equal(result.variable.key, 'test-v');
  assert.deepEqual(SettingsSchema.parse(result), result);
  assert.doesNotThrow(() => validateSettings({ phone: endpoint('p') }));
});

test('玩家消息保存后立即确认发送，不等待正文和变量更新，后续失败不撤回确认', async () => {
  await withEnv(async e => {
    const story = deferred();
    let acknowledged = 0;
    let completed = false;
    e.story = () => story.promise;
    e.update = async () => {
      throw Error('变量服务暂不可用');
    };
    const result = e.runtime
      .send('测试立即清空输入框', true, undefined, () => {
        assert.equal(e.messages.at(-1).role, 'user');
        assert.equal(e.messages.at(-1).message, '测试立即清空输入框');
        acknowledged++;
      })
      .then(
        () => {
          completed = true;
        },
        error => {
          completed = true;
          return error;
        },
      );
    await until(() => e.calls.some(call => call.kind === 'story'));
    assert.equal(acknowledged, 1);
    assert.equal(completed, false);
    story.resolve('正文已完成');
    assert((await result) instanceof Error);
    assert.equal(acknowledged, 1);
  });
});

test('发送前校验失败时不确认清空草稿', async () => {
  await withEnv(
    async e => {
      let acknowledged = false;
      await assert.rejects(
        e.runtime.send('保留草稿', true, undefined, () => {
          acknowledged = true;
        }),
      );
      assert.equal(acknowledged, false);
      assert(!e.messages.some(message => message.role === 'user'));
    },
    undefined,
    { phone: endpoint('phone') },
  );
});

test('发送确认时前端已显示玩家楼层，保存仍在等待也不依赖轮询', async () => {
  await withEnv(async e => {
    const save = deferred();
    SillyTavern.saveChat = () => save.promise;
    global.window.parent.__chengwanService = { ready: true, runtime: e.runtime };
    const connection = connectRuntime(e.runtime);
    let acknowledged = false;
    const sending = connection.runtime.send('立即出现在阅读区', true, undefined, () => {
      acknowledged = true;
      assert.equal(connection.runtime.view.messages.at(-1).content, '立即出现在阅读区');
    });
    try {
      await until(() => acknowledged);
      assert.equal(e.calls.filter(call => call.kind === 'story').length, 0);
      assert.equal(connection.runtime.view.messages.at(-1).role, 'user');
    } finally {
      save.resolve();
      await sending;
      connection.disconnect();
    }
  });
});

test('世界书读取仍在等待时玩家楼层已显示并确认发送，模型请求继续等待准备完成', async () => {
  await withEnv(async e => {
    const gate = deferred();
    const read = global.getWorldbook;
    let reading = false, acknowledged = 0;
    global.getWorldbook = async (...args) => {
      reading = true;
      await gate.promise;
      return read(...args);
    };
    const sending = e.runtime.send('先显示玩家消息', true, undefined, () => { acknowledged++; });
    try {
      await until(() => reading);
      assert.equal(acknowledged, 1);
      assert.equal(e.runtime.view.messages.at(-1).content, '先显示玩家消息');
      assert.equal(e.calls.length, 0, '模型不得跳过必要的世界书准备');
    } finally {
      gate.resolve();
      await sending;
      global.getWorldbook = read;
    }
  });
});

test('角色调度提交等待或失败不阻塞玩家消息显示，重试不重复插入玩家楼层', async () => {
  await withEnv(async e => {
    const gate = deferred();
    const commit = e.runtime.service.commit.bind(e.runtime.service);
    let preparing = false, acknowledged = 0, fail = true;
    e.runtime.service.commit = async (...args) => {
      if (args[1].startsWith('character_roster')) {
        preparing = true;
        await gate.promise;
        if (fail) throw Error('调度暂不可用');
      }
      return commit(...args);
    };
    const sending = e.runtime.send('等调度但先显示', true, undefined, () => { acknowledged++; }).catch(e => e);
    try {
      await until(() => preparing);
      assert.equal(acknowledged, 1);
      assert.equal(e.runtime.view.messages.at(-1).content, '等调度但先显示');
      assert.equal(e.calls.length, 0, '生成仍须等角色调度完成');
    } finally { gate.resolve(); }
    assert.match(String(await sending), /调度暂不可用/);
    assert.equal(e.vars.澄湾失败请求.append, false);
    fail = false;
    await e.runtime.retry();
    assert.equal(e.messages.filter(m => m.role === 'user').length, 1);
    assert.equal(e.calls.filter(c => c.kind === 'story').length, 1);
  }, undefined, {
    characterAuto: true, characterRoster: { majorLimit: 6, minorLimit: 1, majorRotation: 2, minorRotation: 1 },
    variable: endpoint('variable'), phone: endpoint('phone'),
  });
});

test('删楼在保存结束前刷新可见正文，同一按钮重复点击只删除一次', async () => {
  await withEnv(async e => {
    e.messages.push({ role: 'user', message: '待删除', data: {}, extra: {} });
    e.runtime.refresh();
    global.window.parent.__chengwanService = { ready: true, runtime: e.runtime };
    const connection = connectRuntime(e.runtime);
    // The background entrypoint publishes deep changes through this event.
    const unwatch = require('vue').watch(e.runtime.view, () => e.listeners.get('chengwan:runtime_changed')(), { deep: true });
    const save = deferred();
    let saving = false;
    SillyTavern.saveChat = () => { saving = true; return save.promise; };
    const first = connection.runtime.messageAction('delete', 1);
    const second = connection.runtime.messageAction('delete', 1);
    try {
      assert(connection.runtime.view.queued.some(item => item.kind === 'local'));
      await until(() => saving);
      assert.equal(connection.runtime.view.messages.length, 0);
      assert.equal(e.messages.length, 1);
      assert.equal(e.mutations.filter(item => item.kind === 'delete').length, 1);
    } finally {
      save.resolve();
      await Promise.all([first, second]);
      unwatch();
      connection.disconnect();
    }
  });
});

test('额外 API 自动关闭世界书规则，正文和手机更新都直接收到完整规则与变量', async () => {
  await withEnv(async e => {
    assert(e.rules.every(r => !r.enabled));
    assert.equal(e.ruleWrites, 1);
    assert(e.character.澄湾额外API规则原状态['test-worldbook'].every(r => r.enabled));
    const normal = await livePromptConfig(e.state(), '正文', 'story');
    const storyUpdate = await livePromptConfig(e.state(), '正文结算', 'worker');
    const phoneUpdate = await livePromptConfig(e.state(), '手机操作', 'worker', undefined, { session: 'chat' });
    assert.match(normal.overrides.persona_description, /玩家以本次建档为准/);
    for (const result of [storyUpdate, phoneUpdate]) {
      assert.equal(result.overrides.persona_description, '');
      const content = result.injects.map(p => p.content).join('\n');
      assert.doesNotMatch(content, /以下是当前存档的完整事实资料/);
      const data = JSON.parse(result.injects[0].content);
      assert.deepEqual(data.角色.remote, publicPerson(e.state().角色.remote));
      assert.deepEqual(data.手机.账号, e.state().手机.账号);
      assert.deepEqual(data.手机.联系人, e.state().手机.联系人);
      assert.deepEqual(data.手机.会话.chat.参与账号id, e.state().手机.会话.chat.参与账号id);
      assert(!data.手机.会话.chat._窗口 && !data.角色.remote._管理);
      for (const rule of e.rules) assert(content.includes(rule.content));
    }
    assert.equal(normal.injects.length, 2);
    assert.match(normal.injects[0].content, /只生成剧情正文/);
    assert.match(normal.injects[1].content, /玩家尚未开启奇遇系统/);
    e.rules[0].content = '动态修改后的规则';
    assert.match(JSON.stringify((await livePromptConfig(e.state(), '手机操作', 'worker')).injects), /动态修改后的规则/);
    assert(e.rules.every(r => !r.enabled));
    assert.equal(e.ruleWrites, 1);
  });
});

test('旧存档遗留规则先恢复原状态，再由额外 API 接管开关', async () => {
  const e = environment();
  e.character.澄湾世界书开关 = { 'test-worldbook': e.rules.map(r => ({ uid: r.uid, name: r.name, enabled: true })) };
  e.rules.forEach(r => {
    r.enabled = false;
  });
  await e.runtime.start();
  try {
    assert(e.rules.every(r => !r.enabled));
    assert.deepEqual(e.character.澄湾世界书开关, {});
    await livePromptConfig(e.state(), '继续', 'worker');
    assert(e.rules.every(r => !r.enabled));
    await e.runtime.saveSettings({ variable: {}, phone: {} });
    assert(e.rules.every(r => r.enabled));
    assert.deepEqual(e.character.澄湾额外API规则原状态, {});
  } finally {
    await e.runtime.dispose();
  }
});

test('手动停用世界书规则后，额外 API 仍能读取当前内容并更新手机', async () => {
  const e = environment();
  e.rules.forEach(rule => { rule.enabled = false; });
  await e.runtime.start();
  try {
    assert.equal(e.ruleWrites, 0);
    const config = await livePromptConfig(e.state(), '更新', 'worker');
    for (const rule of e.rules) assert(JSON.stringify(config.injects).includes(rule.content));
    await e.runtime.phoneAction({ kind: 'refresh', id: 'chat' });
    assert.equal(e.calls.filter(call => call.kind === 'update').length, 1);
    await e.runtime.saveSettings({ variable: {}, phone: {} });
    assert(e.rules.every(rule => !rule.enabled));
  } finally {
    await e.runtime.dispose();
  }
});

test('游玩途中手动重新启用规则，下一次额外 API 请求前会再次关闭', async () => {
  await withEnv(async e => {
    assert(e.rules.every(rule => !rule.enabled));
    e.rules[0].enabled = true;
    await e.runtime.phoneAction({ kind: 'refresh', id: 'chat' });
    assert(e.rules.every(rule => !rule.enabled));
    assert.equal(e.ruleWrites, 2);
  });
});

test('后台短暂未就绪后，即使快照没有变化，主界面也恢复按钮状态', () => {
  const e = environment();
  const snapshot = JSON.stringify({ view: { readOnly: false, error: '', busy: false }, settings: {} });
  const remote = { snapshot: () => snapshot };
  const service = { ready: true, runtime: remote };
  global.window.parent.__chengwanService = service;
  const connection = connectRuntime(remote);
  try {
    service.ready = false;
    e.listeners.get('chengwan:runtime_changed')();
    assert.equal(connection.runtime.view.readOnly, true);
    assert.match(connection.runtime.view.error, /尚未就绪/);
    service.ready = true;
    e.listeners.get('chengwan:runtime_changed')();
    assert.equal(connection.runtime.view.readOnly, false);
    assert.equal(connection.runtime.view.error, '');
  } finally {
    connection.disconnect();
  }
});

test('角色管理完成和失败均立即同步前端，不等待下一秒轮询', async () => {
  environment();
  const data = { view: { characterLibrary: { meta: { npc: { enabled: true } } }, error: '' }, settings: {} };
  let refreshes = 0;
  const remote = {
    snapshot: () => JSON.stringify(data),
    refreshMessages: () => { refreshes++; },
    manageCharacters: async command => {
      if (command.fail) { data.view.error = '保存失败'; throw Error('保存失败'); }
      data.view.characterLibrary.meta.npc.enabled = false;
      return { results: [{ id: 'npc', enabled: false }] };
    },
  };
  global.window.parent.__chengwanService = { ready: true, runtime: remote };
  const connection = connectRuntime(remote);
  try {
    assert.equal(connection.runtime.view.characterLibrary.meta.npc.enabled, true);
    await connection.runtime.manageCharacters({});
    assert.equal(connection.runtime.view.characterLibrary.meta.npc.enabled, false);
    await assert.rejects(connection.runtime.manageCharacters({ fail: true }), /保存失败/);
    assert.equal(connection.runtime.view.error, '保存失败');
    assert.equal(refreshes, 0, '命令已经完成读回，无需重复遍历历史消息');
  } finally { connection.disconnect(); }
});

test('流式变化只同步变动字段，不重复复制完整存档或扫描聊天', () => {
  const e = environment();
  const { reactive } = require('vue');
  const view = reactive({ streaming: '', data: { marker: 'large-state' }, messages: [] });
  const settings = reactive({ theme: 'warm' });
  let snapshots = 0;
  let scans = 0;
  const remote = {
    view,
    settings,
    snapshot: () => { snapshots++; return JSON.stringify({ view, settings }); },
    refreshMessages: () => { scans++; },
  };
  global.window.parent.__chengwanService = { ready: true, runtime: remote };
  const connection = connectRuntime(remote);
  try {
    const originalData = connection.runtime.view.data;
    view.streaming = '新正文';
    e.listeners.get('chengwan:runtime_changed')();
    assert.equal(connection.runtime.view.streaming, '新正文');
    assert.strictEqual(connection.runtime.view.data, originalData);
    assert.equal(snapshots, 1);
    assert.equal(scans, 0);
    view.data = { marker: 'new-state' };
    e.listeners.get('chengwan:runtime_changed')();
    assert.equal(connection.runtime.view.data.marker, 'new-state');
  } finally { connection.disconnect(); }
});

test('正文完成才请求变量 API，先显示正文，忽略主模型夹带补丁，只提交一次', async () => {
  await withEnv(async e => {
    const story = deferred(),
      update = deferred();
    e.story = () => story.promise;
    e.update = () => update.promise;
    const sending = e.runtime.send('继续剧情');
    await until(() => e.calls.length === 1);
    assert.equal(e.calls[0].kind, 'story');
    for (const rule of e.rules) assert(!JSON.stringify(e.calls[0].config).includes(rule.content));
    assert.equal(e.parses, 0);
    story.resolve('完整正文' + block([patch('/玩家/年龄', 99)]));
    await until(() => e.calls.length === 2);
    assert.equal(e.calls[1].config.custom_api.model, 'variable');
    assert.deepEqual(e.calls[1].config.injects, []);
    assert(!e.calls[1].config.ordered_prompts.includes('chat_history'));
    assert(!e.calls[1].config.ordered_prompts.includes('persona_description'));
    for (const rule of e.rules)
      assert(e.calls[1].config.ordered_prompts.some(p => typeof p === 'object' && p.content === rule.content));
    assert.equal(e.messages.at(-1).message, '完整正文');
    assert.equal(e.messages.at(-1).extra.cw_update_pending, true);
    assert.equal(e.state().玩家.年龄, null);
    update.resolve(block([patch('/玩家/年龄', 25)]));
    await sending;
    assert.equal(e.state().玩家.年龄, 25);
    assert.equal(e.messages.length, 3);
    assert.equal(e.parses, 1);
    assert.equal(e.messages.at(-1).message, '完整正文');
    assert.equal(e.runtime.view.messages.at(-1).variableUpdate.state, 'saved');
    assert.ok(e.runtime.view.messages.at(-1).variableUpdate.changes.some(row => row.path === '/玩家/年龄'));
    assert.equal(e.messages.at(-1).extra.cw_story_settlements['0'].version, e.state()._系统.数据版本);
    assert(e.mutations.every(m => m.refresh === 'affected'));
    await turn();
    assert.equal(e.calls.length, 2);
  });
});

test('MVU 把旧变量复制到待结算楼层且嵌套 extra 时，仍只以已提交楼层为基线', async () => {
  const e = environment();
  e.copyMvuOnReply = true;
  const update = deferred();
  e.update = () => update.promise;
  await e.runtime.start();
  try {
    const sending = e.runtime.send('继续');
    await until(() => e.calls.some(c => c.kind === 'update'));
    assert.equal(e.messages.at(-1).swipe_info[0].extra.cw_update_pending, true);
    assert.equal(e.runtime.view.messages.at(-1).isUpdatePending, true);
    assert.equal(activeContext().floor, 0);
    update.resolve(block([patch('/玩家/年龄', 25)]));
    await sending;
    assert.equal(activeContext().floor, 2);
    assert.equal(e.state().玩家.年龄, 25);
    assert.equal(e.calls.filter(c => c.kind === 'update').length, 1);
    assert.equal(e.messages.at(-1).swipe_info[0].cw_update_pending, undefined);
  } finally {
    await e.runtime.dispose();
  }
});

test('聊天恢复记录丢失时，正文凭原请求归属恢复同一提交并只重试变量', async () => {
  const e = environment();
  await e.runtime.start();
  e.update = async () => { throw Error('变量服务失败'); };
  await assert.rejects(e.runtime.send('继续'), /变量服务失败/);
  const id = e.vars.澄湾待更新正文.id;
  await e.runtime.dispose();
  delete e.vars.澄湾待更新正文;
  e.update = async () => block([patch('/玩家/年龄', 25)]);
  e.runtime = createRuntime();
  await e.runtime.start();
  try {
    assert.equal(e.vars.澄湾待更新正文?.replyFloor, 2);
    assert.equal(e.vars.澄湾待更新正文.id, id);
    assert.equal(activeContext().floor, 0);
    await e.runtime.retry();
    assert.equal(e.messages.length, 3);
    assert.equal(e.calls.filter(c => c.kind === 'story').length, 1);
    assert.equal(e.calls.filter(c => c.kind === 'update').length, 2);
    assert.equal(e.state().玩家.年龄, 25);
    assert.equal(e.vars.澄湾待更新正文, null);
    assert.equal(e.runtime.view.messages.at(-1).variableUpdate.state, 'saved');
  } finally {
    await e.runtime.dispose();
  }
});

test('取消已保存正文仍保留恢复记录并阻止跨过未结算楼层', async () => {
  await withEnv(async e => {
    e.update = async () => { throw Error('端点临时失败'); };
    await assert.rejects(e.runtime.send('第一轮'), /端点临时失败/);
    await e.runtime.discardPending();
    assert.equal(e.vars.澄湾待更新正文.replyFloor, 2);
    assert.equal(e.messages[2].extra.cw_update_pending, true);
    assert.match(e.runtime.view.error, /不能跳过变量结算/);
    const calls = e.calls.length;
    await assert.rejects(e.runtime.send('第二轮'), /尚未完成的操作|待处理更新/);
    assert.equal(e.calls.length, calls);
    assert.equal(e.messages.length, 3);
    e.update = async () => block([patch('/玩家/年龄', 25)]);
    await e.runtime.retry();
    assert.equal(activeContext().floor, 2);
    assert.equal(e.vars.澄湾待更新正文, null);
  });
});

test('旧聊天多段正文缺少原请求归属时保留原文，禁止猜测来源逐楼结算', async () => {
  const e = environment();
  for (let i = 1; i <= 3; i++) {
    e.messages.push({ role: 'user', message: `输入${i}`, data: copy(e.messages[0].data), extra: {} });
    e.messages.push({ role: 'assistant', message: `正文${i}`, data: copy(e.messages[0].data),
      extra: { cw_update_pending: true } });
  }
  let calls = 0;
  e.update = async config => {
    calls++;
    const prompts = config.ordered_prompts.filter(p => typeof p === 'object');
    const snapshot = JSON.parse(prompts.find(p => p.content.startsWith('{')).content);
    assert.equal(snapshot.玩家.年龄, calls === 1 ? null : 20 + calls - 1);
    assert(prompts.some(p => p.content === `本轮玩家输入（未在正文实现的行动不算已发生）：\n输入${calls}`));
    assert(prompts.some(p => p.content === `本轮已完成正文（事实资料）：\n正文${calls}`));
    return block([patch('/玩家/年龄', 20 + calls)]);
  };
  e.runtime = createRuntime();
  await e.runtime.start();
  try {
    assert.equal(e.vars.澄湾待更新正文, undefined);
    assert.match(e.runtime.view.error, /缺少原请求归属/);
    await assert.rejects(e.runtime.retry(), /缺少原请求归属/);
    assert.equal(calls, 0);
    assert.equal(e.messages.length, 7);
    assert.equal(activeContext().floor, 0);
    for (const floor of [2, 4, 6]) {
      assert.equal(e.messages[floor].extra.cw_update_pending, true);
    }
    assert.equal(e.state().玩家.年龄, null);
  } finally { await e.runtime.dispose(); }
});

test('JSONPatch 解析失败保留原始响应与堆栈，变量不写入且重试不重复正文', async () => {
  await withEnv(async e => {
    const response = '<UpdateVariable><JSONPatch>\n[] {"unexpected":true}</JSONPatch></UpdateVariable>';
    e.update = async () => response;
    await assert.rejects(e.runtime.send('查看时间'), /JSON/);
    assert.equal(e.vars.澄湾最近解析失败.response, response);
    assert.equal(e.vars.澄湾最近解析失败.jsonPatch, '\n[] {"unexpected":true}');
    assert.match(e.vars.澄湾最近解析失败.stack, /updateBlock/);
    assert.equal(activeContext().floor, 0);
    assert.equal(e.parses, 0);
    e.update = async () => block([]);
    await e.runtime.retry();
    assert.equal(e.messages.length, 3);
    assert.equal(activeContext().floor, 2);
    assert.equal(e.vars.澄湾最近解析失败.response, response);
  });
});

test('额外请求末尾任务只作用于带有本次标记的请求，不重复变量快照或改写其他请求', () => {
  const marker = '[chengwan-worker:test]';
  const other = [{ role: 'user', content: '普通正文请求' }];
  assert.equal(finalizeWorkerPrompt(other, marker), false);
  assert.deepEqual(other, [{ role: 'user', content: '普通正文请求' }]);
  const messages = [{ role: 'system', content: '{"世界":{}}' },
    { role: 'user', content: `更新变量\n${marker}` },
    { role: 'system', content: '预设要求写正文' }];
  assert.equal(finalizeWorkerPrompt(messages, marker), true);
  assert.deepEqual(messages.at(-1), { role: 'system', content: workerTask });
  assert.equal(messages.filter(m => m.content === '{"世界":{}}').length, 1);
  assert(!JSON.stringify(messages).includes(marker));
  assert.equal(finalizeWorkerPrompt(messages, marker), false);
});

test('变量交接遵循提示词正则隐藏思考，已保存正文与显示标记保持原样', async () => {
  await withEnv(async e => {
    e.story = async () => '<thinking>继续扮演角色而不要输出变量</thinking>\n校园钟显示上午九点。';
    global.formatAsTavernRegexedString = (text, source, destination) => {
      assert.equal(source, 'ai_output');
      assert.equal(destination, 'prompt');
      return text.replace(/<thinking>[\s\S]*?<\/thinking>/g, '');
    };
    await e.runtime.send('查看时间');
    assert(e.messages[2].message.includes('<thinking>'));
    const worker = e.calls.find(c => c.kind === 'update').config;
    assert(!JSON.stringify(worker).includes('继续扮演角色而不要输出变量'));
    assert(JSON.stringify(worker).includes('校园钟显示上午九点'));
    assert.equal(e.listeners.has('completion_settings'), false);
  });
});

test('预设前置思考提及协议标签不冒充第二个更新块，补丁内部文本原样保留', () => {
  const commands = [patch('/玩家/称呼', '<thinking>字段中的原文</thinking>')];
  const reply = '<thinking>本次应返回一个 <UpdateVariable> 更新块。</thinking>\n' + block(commands);
  assert.deepEqual(updateBlock(reply).commands, commands);
  assert.throws(() => updateBlock(reply + block([])), /只能包含一个/);
  assert.throws(() => updateBlock('<thinking>未闭合 <UpdateVariable>\n' + block([])), /只能包含一个/);
});

test('保存后真实编辑输入使旧正文失效，重试及重载不得重新绑定新源', async () => {
  await withEnv(async e => {
    e.update = async () => { throw Error('更新服务临时失败'); };
    await assert.rejects(e.runtime.send('原输入'), /临时失败/);
    e.messages[1].message = '修正后的输入';
    const calls = e.calls.length;
    await assert.rejects(e.runtime.retry(), /原请求已失效/);
    assert.equal(e.calls.filter(c => c.kind === 'story').length, 1);
    assert.equal(e.messages.length, 3);
    assert.equal(activeContext().floor, 0);
    assert.equal(e.calls.length, calls);
    assert.equal(e.messages[2].extra.cw_update_pending, true);
    await e.runtime.dispose();
    e.runtime = createRuntime();
    await e.runtime.start();
    await assert.rejects(e.runtime.retry(), /原请求已失效/);
    assert.equal(e.calls.length, calls);
  });
});

function transferAdvice(e, original, replacement = '可配置占位句') {
  const userId = e.messages.findLastIndex(message => message.role === 'user');
  const assistantId = userId - 1;
  const assistant = e.messages[assistantId], user = e.messages[userId];
  assistant.message = `<advice>${original}</advice>\n\n${assistant.message}`;
  if (assistant.swipes) assistant.swipes[assistant.swipe_id ?? 0] = assistant.message;
  user.message = replacement;
  if (user.swipes) user.swipes[user.swipe_id ?? 0] = replacement;
  user.extra.extra = { unrelated: '嵌套辅助元数据不能遮蔽外层原文凭据' };
  user.extra.izumi_advice = { version: 1, text: original, assistantId, revision: 1, replacementText: replacement };
}

for (const stage of ['资料选择', '正文', '变量']) for (const event of [false, true]) {
  test(`P0 advice搬运在${stage}阶段${event ? '触发' : '不触发'}更新事件，原输入与提交身份保持一致`, async () => {
    await withEnv(async e => {
      const input = '抬头看看周围';
      let transferred = false;
      const transfer = () => { if (!transferred) { transferAdvice(e, input); transferred = true; if (event) e.listeners.get('edit')?.(); } };
      e.story = async () => { if (stage === '正文') transfer(); return '测试访客抬起了头。'; };
      e.update = async config => {
        if (config.ordered_prompts?.some(p => typeof p === 'object' && p.content.includes('本轮已完成正文'))) {
          if (stage === '变量') transfer();
          assert(JSON.stringify(config).includes(input));
          return block([]);
        }
        if (stage === '资料选择') transfer();
        return JSON.stringify({ 地点: [], 组织: [] });
      };
      const read = global.getChatMessages;
      global.getChatMessages = (range, options) => read(range, options).map(message => {
        if (options?.include_swipes) delete message.message; // Actual helper API shape.
        return message;
      });
      await e.runtime.send(input);
      assert(transferred);
      assert.equal(e.messages[2].message, '测试访客抬起了头。');
      const id = e.messages[2].extra.cw_story_settlements['0'].commitId;
      assert.equal(e.messages[2].extra.cw_story_request, undefined);
      assert(e.state()._系统.提交记录[id]);
      assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
      assert.equal(e.vars.澄湾待更新正文, null);
    }, seed(), { characterAuto: false, informationAuto: true, variable: endpoint('variable'), phone: endpoint('phone') });
  });
}

test('P0 message真实编辑且swipe仍旧时拒绝旧结果，候选单独改文与切换同样拒绝', async () => {
  const { messageSource, assertMessageSource } = require(root + '/运行/request-source.ts');
  await withEnv(async e => {
    e.messages.push({ role: 'user', message: '存档原文', swipes: ['存档原文', '另一候选'], swipe_id: 0, extra: {} });
    const source = messageSource();
    e.messages[1].message = '真正修改的存档';
    assert.throws(() => assertMessageSource(source), /源消息/);
    e.messages[1].message = '存档原文';
    e.messages[1].swipes[0] = '单独修改候选';
    assert.throws(() => assertMessageSource(source), /源消息/);
    e.messages[1].swipe_id = 1;
    assert.throws(() => assertMessageSource(source), /源消息/);
  });
});

test('P0 保存输入之后、资料准备完成之前的真编辑也不能被重新采样掩盖', async () => {
  await withEnv(async e => {
    const save = SillyTavern.saveChat;
    let edited = false;
    SillyTavern.saveChat = async () => {
      if (!edited && e.messages[1]?.role === 'user') {
        edited = true;
        e.messages[1].swipes = [e.messages[1].message];
        e.messages[1].message = '保存过程中真正修改的输入';
      }
      return save();
    };
    await assert.rejects(e.runtime.send('原输入'), /源消息已变化/);
    assert.equal(e.calls.length, 0);
    assert.equal(e.messages.length, 2);
  });
});

test('P0 任意出站提示词替换不改变存档归属，变量仍交接原始玩家输入', async () => {
  await withEnv(async e => {
    e.story = async config => {
      config.user_input = '另一预设的出站占位文本';
      config.injects.push({ role: 'user', content: '仅请求体中的辅助文本', position: 'in_chat', depth: 0 });
      return '根据原输入完成的正文';
    };
    e.update = async config => {
      assert(JSON.stringify(config).includes('原始玩家输入'));
      assert(!JSON.stringify(config).includes('另一预设的出站占位文本'));
      return block([]);
    };
    await e.runtime.send('原始玩家输入');
    assert.equal(e.messages[1].message, '原始玩家输入');
    assert.equal(e.messages[2].message, '根据原输入完成的正文');
  });
});

test('P0 正文创建期间插件还原文本，以首次保存读回封存；重试不可重新采纳后续编辑', async () => {
  await withEnv(async e => {
    const create = global.createChatMessages;
    global.createChatMessages = async (rows, options) => {
      await create(rows, options);
      if (rows[0]?.role === 'assistant') e.messages.at(-1).message = '插件接收处理后的正文';
    };
    e.story = async () => '模型返回的编码正文';
    e.update = async config => {
      assert(JSON.stringify(config).includes('插件接收处理后的正文'));
      assert(!JSON.stringify(config).includes('模型返回的编码正文'));
      throw Error('变量隔离失败');
    };
    await assert.rejects(e.runtime.send('原始玩家输入'), /变量隔离失败/);
    const id = e.vars.澄湾待更新正文.id;
    assert.equal(e.vars.澄湾待更新正文.text, '插件接收处理后的正文');
    await e.runtime.dispose();
    delete e.vars.澄湾待更新正文;
    e.runtime = createRuntime();
    await e.runtime.start();
    assert.equal(e.vars.澄湾待更新正文.id, id);
    e.messages[2].message = '玩家后来编辑的正文';
    const calls = e.calls.length;
    await assert.rejects(e.runtime.retry(), /原请求已失效/);
    assert.equal(e.calls.length, calls);
  });
});

test('P0 已存在的message与swipe不一致时以存档原文归属，候选补同步可继续', async () => {
  const { messageSource, assertMessageSource } = require(root + '/运行/request-source.ts');
  await withEnv(async e => {
    e.messages.push({ role: 'user', message: '当前存档原文', swipes: ['旧候选缓存'], swipe_id: 0, extra: {} });
    const source = messageSource();
    assert.equal(source.at(-1).text, '当前存档原文');
    assert.equal(source.at(-1).candidate, '旧候选缓存');
    e.messages[1].swipes[0] = '当前存档原文';
    assert.doesNotThrow(() => assertMessageSource(source));
  });
});

test('P0 advice缺凭据、错误搬运目标、改写原始输入及夹带剧情修改均拒绝', async () => {
  const { messageSource, assertMessageSource } = require(root + '/运行/request-source.ts');
  for (const mutation of ['缺凭据', '错误目标', '改写输入', '改写剧情']) await withEnv(async e => {
    e.messages.push({ role: 'user', message: '原始输入', extra: {} });
    const source = messageSource();
    transferAdvice(e, '原始输入');
    if (mutation === '缺凭据') delete e.messages[1].extra.izumi_advice;
    if (mutation === '错误目标') e.messages[1].extra.izumi_advice.assistantId = 99;
    if (mutation === '改写输入') e.messages[1].extra.izumi_advice.text = '另一个输入';
    if (mutation === '改写剧情') e.messages[0].message += '\n修改既有剧情';
    assert.throws(() => assertMessageSource(source), /源消息/, mutation);
  });
});

test('P0 搬运后变量失败与恢复记录丢失，重载沿用原输入及提交ID只重试变量', async () => {
  await withEnv(async e => {
    e.story = async () => { transferAdvice(e, '抬头'); return '抬起了头。'; };
    e.update = async () => { throw Error('隔离变量失败'); };
    await assert.rejects(e.runtime.send('抬头'), /隔离变量失败/);
    const id = e.vars.澄湾待更新正文.id;
    await e.runtime.dispose();
    delete e.vars.澄湾待更新正文;
    e.runtime = createRuntime();
    await e.runtime.start();
    assert.equal(e.vars.澄湾待更新正文.id, id);
    e.update = async config => { assert(JSON.stringify(config).includes('本轮玩家输入（未在正文实现的行动不算已发生）：\\n抬头')); return block([]); };
    await e.runtime.retry();
    assert.equal(e.calls.filter(c => c.kind === 'story').length, 1);
    assert(e.state()._系统.提交记录[id]);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
  });
});

test('上一楼的独立 advice 建议被替换或移动时不丢弃正在生成的正文', async () => {
  await withEnv(async e => {
    e.messages[0].message = '已有剧情\n\n<summary>已结算</summary>\n\n<advice>旧建议</advice>';
    e.story = async () => {
      e.messages[0].message = '已有剧情\n\n<advice>新建议</advice>\n\n<summary>已结算</summary>';
      e.listeners.get('edit')?.();
      return '本轮完整正文';
    };
    await e.runtime.send('按我的行动继续');
    assert.equal(e.messages[2].message, '本轮完整正文');
    assert.equal(e.runtime.view.error, '');
    assert.equal(e.calls.filter(c => c.kind === 'story').length, 1);
  });
});

test('advice 变化之外的正文编辑仍使生成结果失效', async () => {
  await withEnv(async e => {
    e.messages[0].message = '已有剧情\n\n<advice>旧建议</advice>';
    e.story = async () => {
      e.messages[0].message = '被改写的剧情\n\n<advice>新建议</advice>';
      return '不得提交的正文';
    };
    await assert.rejects(e.runtime.send('按我的行动继续'), /源消息已变化/);
    assert.equal(e.messages.length, 2);
  });
});

test('重试再次失败时输入区显示本次具体原因', async () => {
  await withEnv(async e => {
    e.update = async () => { throw Error('首次失败'); };
    await assert.rejects(e.runtime.send('继续'));
    e.update = async () => { throw Error('再次请求的具体失败'); };
    await assert.rejects(e.runtime.retry(), /再次请求的具体失败/);
    assert.match(e.runtime.view.error, /再次请求的具体失败/);
    assert.equal(e.vars.澄湾待更新正文.replyFloor, 2);
    const calls = e.calls.length;
    await e.runtime.messageAction('delete', 2);
    assert.equal(e.messages.length, 2);
    assert.equal(e.vars.澄湾待更新正文, null);
    assert.equal(e.runtime.view.error, '');
    assert.equal(activeContext().floor, 0);
    assert.equal(e.calls.length, calls);
  });
});

test('删楼后重新发送使用保留楼层状态，旧排队操作不会再次提交', async () => {
  await withEnv(async e => {
    e.update = async () => block([patch('/玩家/年龄', 25)]);
    await e.runtime.send('第一轮');
    assert.equal(e.messages.length, 3);
    await e.runtime.messageAction('delete', 1);
    assert.equal(e.messages.length, 1);
    assert.equal(e.runtime.view.messages.length, 0);
    await e.runtime.send('重新开始');
    assert.equal(e.messages.length, 3);
    assert.equal(e.calls.filter(c => c.kind === 'story').length, 2);
    assert.equal(e.calls.filter(c => c.kind === 'update').length, 2);
    assert.equal(e.messages.at(-1).message, '已经完成的正文');
    assert.equal(e.runtime.view.messages.at(-1).variableUpdate.state, 'saved');
    assert(e.mutations.every(m => m.refresh === 'affected'));
  });
});

test('正文界面只保留最新十楼，历史楼层和首个可见结算状态仍完整', async () => {
  await withEnv(async e => {
    for (let i = 0; i < 6; i++) await e.runtime.send(`第 ${i + 1} 轮`);
    assert.equal(e.messages.length, 13);
    assert.equal(e.runtime.view.messages.length, 10);
    assert.equal(e.runtime.view.messages[0].id, 3);
    assert.equal(e.runtime.view.messages.at(-1).id, 12);
    assert.equal(e.runtime.view.messages.find(m => m.id === 4)?.variableUpdate.state, 'saved');
    assert.equal(activeContext().floor, 12);
  });
});

test('原生继续从最新已结算助手楼层建立新楼，正文和变量仍各请求一次', async () => {
  await withEnv(async e => {
    await e.runtime.send('第一轮');
    await e.runtime.messageAction('continue', 2);
    assert.equal(e.messages.length, 4);
    assert.equal(e.messages[3].role, 'assistant');
    assert.equal(activeContext().floor, 3);
    assert.equal(e.calls.filter(c => c.kind === 'story').length, 2);
    assert.equal(e.calls.filter(c => c.kind === 'update').length, 2);
    assert.match(e.calls.filter(c => c.kind === 'story')[1].config.user_input, /接续上一段/);
  });
});

test('原生重生成保留玩家楼和元数据，以前一已提交楼为基线重做一次', async () => {
  await withEnv(async e => {
    e.messages[0].name = '原生开局元数据';
    await e.runtime.send('第一轮');
    e.messages[1].extra.custom_marker = '保留玩家楼元数据';
    e.story = async () => '重生成的完整正文';
    await e.runtime.messageAction('regenerate', 2);
    assert.equal(e.messages.length, 3);
    assert.equal(e.messages[0].name, '原生开局元数据');
    assert.equal(e.messages[1].extra.custom_marker, '保留玩家楼元数据');
    assert.equal(e.messages[1].message, '第一轮');
    assert.equal(e.messages[2].message, '重生成的完整正文');
    assert.equal(e.runtime.view.messages.at(-1).variableUpdate.state, 'saved');
    assert.equal(e.calls.filter(c => c.kind === 'story').length, 2);
    assert.equal(e.calls.filter(c => c.kind === 'update').length, 2);
    assert.equal(activeContext().floor, 2);
  });
});

test('原生编辑最新助手正文后，重试按前一已提交楼层重新结算同一楼', async () => {
  await withEnv(async e => {
    await e.runtime.send('第一轮');
    e.messages[2].message = '编辑后的正文';
    e.listeners.get('edited')(2);
    await until(() => e.vars.澄湾待更新正文?.replyFloor === 2);
    assert.equal(activeContext().floor, 0);
    e.update = async () => block([patch('/玩家/年龄', 29)]);
    await e.runtime.retry();
    assert.equal(e.messages.length, 3);
    assert.equal(e.messages[2].message, '编辑后的正文');
    assert.equal(activeContext().floor, 2);
    assert.equal(e.state().玩家.年龄, 29);
    assert.equal(e.calls.filter(c => c.kind === 'update').length, 2);
  });
});

test('编辑既有候选分支只重结算选中候选，保留候选编号', async () => {
  await withEnv(async e => {
    await e.runtime.send('第一轮');
    const assistant = e.messages[2];
    assistant.swipe_id = 1;
    assistant.swipes = [assistant.message, '另一个候选的编辑正文'];
    assistant.swipes_data = [copy(assistant.data), copy(assistant.data)];
    assistant.message = assistant.swipes[1];
    e.listeners.get('edited')(2);
    await until(() => e.vars.澄湾待更新正文?.replySwipe === 1);
    e.update = async () => block([patch('/玩家/年龄', 31)]);
    await e.runtime.retry();
    assert.equal(e.messages.length, 3);
    assert.equal(e.messages[2].swipes[0], '已经完成的正文');
    assert.equal(e.messages[2].swipes[1], '另一个候选的编辑正文');
    assert.equal(e.messages[2].swipes_data[1].stat_data._系统.候选回复id, '1');
    assert.equal(activeContext().swipe, 1);
    assert.equal(e.state().玩家.年龄, 31);
    assert.equal(e.runtime.view.messages.at(-1).variableUpdate.state, 'saved');
    assistant.swipe_id = 0;
    assistant.message = assistant.swipes[0];
    e.runtime.refreshMessages();
    assert.equal(e.runtime.view.messages.at(-1).variableUpdate.state, 'saved');
    assert.equal(e.runtime.view.messages.at(-1).variableUpdate.changes.some(row => row.after === '31'), false);
  });
});

test('重载时删除过的楼层不再恢复旧变量请求', async () => {
  const e = environment();
  e.vars.澄湾待更新正文 = {
    id: 'old-round',
    context: { chat: e.chat, floor: 2, swipe: 0, branch: `${e.chat}:2:0`, version: 1, fingerprint: 'old' },
    source: [{ id: 1, role: 'user', swipe: 0, text: '已删除的输入' }],
    text: '已删除楼层的正文',
    replyFloor: 2,
    envelope: { stat_data: seed() },
  };
  e.runtime = createRuntime();
  await e.runtime.start();
  try {
    assert.equal(e.vars.澄湾待更新正文, null);
    assert.match(e.runtime.view.error, /旧请求已清理/);
    await e.runtime.send('重新开始');
    assert.equal(e.calls.filter(c => c.kind === 'update').length, 1);
    assert.equal(e.runtime.view.messages.at(-1).variableUpdate.state, 'saved');
  } finally {
    await e.runtime.dispose();
  }
});

test('酒馆原生删楼事件清掉旧队列，随后可以重新发送', async () => {
  await withEnv(async e => {
    await e.runtime.send('第一轮');
    e.messages.splice(1);
    e.listeners.get('delete')?.();
    await until(() => e.vars.澄湾排队操作?.length === 0);
    await e.runtime.send('重新开始');
    assert.equal(e.messages.length, 3);
    assert.equal(e.calls.filter(c => c.kind === 'update').length, 2);
  });
});

test('正文含脚本和协议标签时保留原文，并把完整正文交给变量 API', async () => {
  await withEnv(async e => {
    const story =
      '街角的对话已经发生。\n```html\n<script>const marker = "<UpdateVariable>";</script>\n```\n之后两人继续交谈。';
    e.story = async () => story;
    e.update = async () => block([patch('/玩家/当前状态/体力值', 79)]);
    await e.runtime.send('继续交谈');
    assert.equal(e.calls.length, 2);
    assert.equal(stripProtocol(e.messages.at(-1).message), story);
    const config = e.calls[1].config;
    assert.doesNotMatch(config.user_input, /街角的对话/);
    const workerPrompts = config.ordered_prompts.filter(p => typeof p === 'object');
    const storyPrompt = workerPrompts.find(p => p.content?.startsWith('本轮已完成正文'));
    const playerPrompt = workerPrompts.find(p => p.content?.startsWith('本轮玩家输入'));
    assert(storyPrompt, '变量 API 应收到独立正文资料');
    assert.equal(playerPrompt.content.split('\n').at(-1), '继续交谈');
    assert.equal(storyPrompt.content.split('\n').slice(1).join('\n'), story);
    assert.match(storyPrompt.content, /<UpdateVariable>/);
    const suppliedPrompts = workerPrompts.map(p => p.content);
    assert.equal(suppliedPrompts.filter(content => content.includes('以下是当前存档的完整事实资料')).length, 0);
    assert.deepEqual(JSON.parse(workerPrompts[0].content).角色.remote, publicPerson(e.state().角色.remote));
    assert.equal(suppliedPrompts.filter(content => content.startsWith('本轮已完成正文')).length, 1);
  });
});

test('遗留变量正则全部停用，完整剧情与代码示例仍可读取', () => {
  const config = require('yaml').parse(fs.readFileSync(root + '/index.本地监听.yaml', 'utf8'));
  const rules = config.扩展字段.正则;
  assert.deepEqual(rules.map(rule => rule.正则名称), ['[瓦洛兰·不发送]完整变量更新', '[瓦洛兰·折叠]变量更新中', '[瓦洛兰·折叠]完整变量更新']);
  assert.ok(rules.every(rule => !rule.启用));
  const complete = '<UpdateVariable><Analysis>time</Analysis><JSONPatch>[]</JSONPatch></UpdateVariable>';
  assert.equal(stripProtocol('正文完整。\n' + complete), '正文完整。');
  assert.equal(stripProtocol('正文\n```html\n' + complete + '\n```'), '正文\n```html\n' + complete + '\n```');
  assert.match(stripProtocol('正文\n<ThirdPartyStatus>状态</ThirdPartyStatus>'), /ThirdPartyStatus/);
  assert.match(storedNarrative('台词里的 <UpdateVariable>尚未闭合，后文必须可见'), /后文必须可见/);
});

test('正文前端把完整代码块交给酒馆显示正则', () => {
  const original = global.formatAsDisplayedMessage;
  try {
    global.formatAsDisplayedMessage = text => text;
    const source =
      '剧情\n```html\n<script>const marker = "<UpdateVariable>";</script>\n```\n<UpdateVariable><JSONPatch>[]</JSONPatch></UpdateVariable>';
    const { html } = displayedMessage(source, 2);
    assert.match(html, /<script>/);
    assert.match(html, /<UpdateVariable><JSONPatch>\[\]<\/JSONPatch><\/UpdateVariable>/);
  } finally {
    global.formatAsDisplayedMessage = original;
  }
});

test('正文前端把外置状态栏占位符交给酒馆显示正则', () => {
  const original = global.formatAsDisplayedMessage;
  try {
    let received;
    global.formatAsDisplayedMessage = text => {
      received = text;
      return '<div class="external-status">状态栏</div>';
    };
    const source = '剧情\n<StatusPlaceHolderImpl/>';
    const { html } = displayedMessage(source, 2);
    assert.equal(received, source);
    assert.match(html, /external-status/);
  } finally {
    global.formatAsDisplayedMessage = original;
  }
});

test('楼层保存保留状态栏标记，变量交接只使用正文', () => {
  const raw = '正文\n<StatusPlaceHolderImpl/>\n' + block([]);
  assert.equal(storedNarrative(raw), '正文\n<StatusPlaceHolderImpl/>');
  assert.equal(stripProtocol(raw), '正文');
});

test('角色导入不能报告成功后再由 Schema 删除字段', () => {
  const result = parseAndValidateCharacterJson({ 姓名: '测试角色', 性别: '男', 层级: '主要', 性特征: {} });
  assert.equal(result.success, false);
  assert.match(result.error, /Schema 删除.*性特征/);
});

test('外置脚本直接改写已保存正文后，渲染事件和定时核对都能更新前端且不再次生成', async () => {
  await withEnv(async e => {
    e.messages.push({ role: 'user', message: '生成图片提示词', data: copy(e.messages[0].data), extra: {} });
    e.messages.push({ role: 'assistant', message: '原正文', data: copy(e.messages[0].data), extra: {} });
    e.runtime.refreshMessages();
    assert.equal(e.runtime.view.messages.at(-1).content, '原正文');

    e.messages[2].message = '原正文\n<image>新生成的图片提示词</image>';
    e.listeners.get('character_rendered')(2);
    assert.equal(e.runtime.view.messages.at(-1).content, e.messages[2].message);

    e.messages[2].message += '\n另一个脚本直接写入的内容';
    e.runtime.refreshMessages();
    assert.equal(e.runtime.view.messages.at(-1).content, e.messages[2].message);
    assert.equal(e.calls.length, 0);
    assert.equal(e.writes, 0);
  });
});

test('携带预设的正文变量 API 同样收到独立正文资料', async () => {
  await withEnv(
    async e => {
      e.story = async () => '雨停后，玩家走进店里。';
      e.update = async () => block([patch('/玩家/当前状态/体力值', 79)]);
      await e.runtime.send('进店');
      const call = e.calls.find(c => c.kind === 'preset-update');
      assert(call);
      assert.deepEqual(call.config.injects, []);
      assert.equal(call.config.overrides.chat_history.with_depth_entries, false);
      const storyPrompt = call.config.overrides.chat_history.prompts.find(p => p.content?.startsWith('本轮已完成正文'));
      assert.equal(storyPrompt.content.split('\n').at(-1), '雨停后，玩家走进店里。');
    },
    seed(),
    { variable: { ...endpoint('variable'), sendPreset: true }, phone: endpoint('phone') },
  );
});

test('主模型只返回变量补丁时不把空正文交给变量 API', async () => {
  await withEnv(async e => {
    e.story = async () => block([]);
    await assert.rejects(e.runtime.send('继续'), /没有返回剧情正文/);
    assert.equal(e.calls.filter(c => c.config.custom_api?.model === 'variable').length, 0);
  });
});

test('手机单次请求同时更新回复、时间、天气、玩家、非参与人物、组织，不调用正文变量 API', async () => {
  await withEnv(async e => {
    e.update = async () =>
      block([
        patch('/世界/当前时间', time(10)),
        patch('/世界/天气/天气状况', '阴'),
        patch('/玩家/当前状态/体力值', 79),
        patch('/角色/remote/当前状态', '完成午间工作'),
        { op: 'add', path: '/组织/library', value: { 名称: '图书馆' } },
        {
          op: 'add',
          path: '/手机/原文/消息/reply',
          value: {
            会话id: 'chat',
            发送账号id: 'npc',
            故事时间: time(10),
            内容块: [{ 类型: '文字', id: 'reply-text', 正文: '好的' }],
          },
        },
      ]);
    await e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '聊天十分钟' });
    assert.equal(e.calls.length, 1);
    assert.equal(e.calls[0].config.custom_api.model, 'phone');
    assert(!e.calls[0].config.ordered_prompts.includes('chat_history'));
    assert.match(e.calls[0].config.user_input, /聊天十分钟/);
    assert.deepEqual(JSON.parse(e.calls[0].config.ordered_prompts.find(p => typeof p === 'object').content).角色.remote, publicPerson(seed().角色.remote));
    assert.equal(e.parses, 1);
    assert.equal(e.state().世界.当前时间.分, 10);
    assert.equal(e.state().世界.天气.天气状况, '阴');
    assert.equal(e.state().玩家.当前状态.体力值, 79);
    assert.equal(e.state().角色.remote.当前状态, '完成午间工作');
    assert.equal(e.state().组织.library.名称, '图书馆');
    assert.equal(Object.keys(e.state().手机.原文.消息).length, 2);
    assert.equal(e.messages.length, 1);
    await turn();
    assert.equal(e.calls.length, 1);
  });
});

test('手机遗漏世界时钟但生成未来回复时不保存；重试完整同步后消息只发送一次', async () => {
  await withEnv(async e => {
    const original = copy(e.state());
    const reply = { op: 'add', path: '/手机/原文/消息/reply', value: {
      会话id: 'chat', 发送账号id: 'npc', 故事时间: time(1), 内容块: [{ 类型: '文字', id: 'reply', 正文: '收到' }],
    } };
    e.update = async config => {
      assert.match(config.user_input, /不能只更新手机记录的故事时间/);
      return block([reply]);
    };
    await assert.rejects(e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '你好' }), /时间晚于世界时间/);
    assert.deepEqual(e.state(), original);
    e.update = async () => block([patch('/世界/当前时间', time(1)), reply]);
    await e.runtime.retry();
    assert.equal(e.state().世界.当前时间.分, 1);
    const sent = Object.values(e.state().手机.原文.消息).filter(m => m.发送账号id === 'me');
    assert.equal(sent.length, 1); assert.equal(Object.keys(e.state().手机.原文.消息).length, 2);
    await e.runtime.dispose(); e.runtime = createRuntime(); await e.runtime.start();
    assert.equal(e.runtime.view.data.世界.当前时间.分, 1);
  });
});

test('手机可独立使用，正文变量端点为空不阻塞手机操作', async () => {
  await withEnv(
    async e => {
      await e.runtime.phoneAction({ kind: 'refresh', id: 'chat' });
      assert.equal(e.calls.length, 1);
      assert.equal(e.calls[0].config.custom_api.model, 'phone');
    },
    seed(),
    { phone: endpoint('phone') },
  );
});

test('手机最终请求只带近期与摘要，旧帖操作带回原帖，结算保留全部历史', async () => {
  const initial = seed();
  for (let i = 0; i < 40; i++) initial.手机.原文.消息['past' + i] = Schema.parse({ 手机: { 原文: { 消息: { m: {
    会话id: 'chat', 发送账号id: 'npc', _已投递账号id: ['me'], _发送状态: '已投递', _顺序: i,
    内容块: [{ 类型: '文字', id: 'b' + i, 正文: i < 20 ? '已归档原文标记' : '近期消息' }],
  } } } } }).手机.原文.消息.m;
  initial.手机.原文.帖子.oldPost = Schema.parse({ 手机: { 原文: { 帖子: { p: {
    发布账号id: 'npc', 平台: '朋友圈', 可见范围: '公开',
    内容块: [{ 类型: '文字', id: 'post', 正文: '旧帖本次操作上下文' }],
  } } } } }).手机.原文.帖子.p;
  const oldIds = Array.from({ length: 20 }, (_, i) => 'past' + i);
  initial.手机.会话.chat._窗口._近期id = Array.from({ length: 20 }, (_, i) => 'past' + (i + 20));
  initial.手机.会话.chat._窗口._细摘要id = ['summary'];
  initial.手机.会话.chat._窗口._已归档覆盖id = oldIds;
  initial.手机.摘要.summary = Schema.parse({ 手机: { 摘要: { s: {
    来源类型: '会话', 来源id: 'chat', 内容: '前二十条交流已总结', 覆盖记录id: [...oldIds, 'oldPost'],
  } } } }).手机.摘要.s;
  await withEnv(async e => {
    e.update = async () => block([]);
    await e.runtime.phoneAction({ kind: 'like', id: 'oldPost' });
    assert.equal(e.calls.length, 1);
    const view = JSON.parse(e.calls[0].config.ordered_prompts.find(p => typeof p === 'object').content);
    assert.equal(Object.keys(view.手机.原文.消息).length, 20);
    assert(!JSON.stringify(view).includes('已归档原文标记'));
    assert.equal(view.手机.原文.帖子.oldPost.内容块[0].正文, '旧帖本次操作上下文');
    assert.equal(view.手机.摘要.summary.内容, '前二十条交流已总结');
    assert(!view._系统 && !view.角色.npc._管理);
    assert.equal(Object.keys(e.state().手机.原文.消息).length, 40);
    for (const id of oldIds) assert.deepEqual(e.state().手机.原文.消息[id], initial.手机.原文.消息[id]);
    assert.deepEqual(e.state().手机.原文.帖子.oldPost, initial.手机.原文.帖子.oldPost);
  }, initial);
});

test('手机端点未配置不得回退至正文端点或主模型', async () => {
  await withEnv(
    async e => {
      await assert.rejects(e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '你好' }), /手机/);
      assert.equal(e.calls.length, 0);
      assert.equal(Object.keys(e.state().手机.原文.消息).length, 0);
    },
    seed(),
    { variable: endpoint('variable') },
  );
});

test('加载、保存设置、本地管理、查看与待办重新排队不调用模型', async () => {
  const state = seed();
  state._系统.任务 = Schema.parse({
    _系统: { 任务: { job: { 类别: '生活更新', 目标id: ['npc'], 目标版本: { npc: 0 }, 状态: '失败' } } },
  })._系统.任务;
  await withEnv(async e => {
    await e.runtime.saveSettings(copy(e.runtime.settings));
    await e.runtime.commit(s => {
      s._系统.生成密度 = '少量';
    });
    e.runtime.refresh();
    await e.runtime.runBackground(true);
    await turn();
    assert.equal(e.calls.length, 0);
    assert.equal(e.state()._系统.任务.job.状态, '排队');
    e.update = async () => lifeCheckedBlock(e.state());
    await e.runtime.phoneAction({ kind: 'refresh', id: 'chat' });
    assert.equal(e.calls.length, 1);
    assert.equal(e.state()._系统.任务.job.状态, '已提交');
  }, state);
});

test('正文变量失败保留正文与旧变量；重试只补变量且不新增楼层', async () => {
  await withEnv(async e => {
    e.update = async () => {
      throw Error('模拟服务不可用');
    };
    await assert.rejects(e.runtime.send('剧情'), /模拟服务不可用/);
    assert.equal(e.messages.length, 3);
    assert(e.messages.at(-1).extra.cw_update_pending);
    assert.equal(e.runtime.view.messages.at(-1).variableUpdate.state, 'failed');
    assert.equal(e.state().世界.当前时间.分, 0);
    e.update = async () => block([patch('/世界/当前时间', time(5))]);
    await e.runtime.retry();
    assert.equal(e.calls.filter(c => c.kind === 'story').length, 1);
    assert.equal(e.calls.filter(c => c.kind === 'update').length, 2);
    assert.equal(e.messages.length, 3);
    assert.equal(e.state().世界.当前时间.分, 5);
    assert.equal(e.messages.at(-1).extra.cw_update_pending, undefined);
    assert.equal(e.runtime.view.messages.at(-1).variableUpdate.state, 'saved');
  });
});

test('手机失败不部分写回，重试不重复玩家消息', async () => {
  await withEnv(async e => {
    e.update = async () => '不完整更新';
    await assert.rejects(e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '你好' }));
    assert.equal(Object.keys(e.state().手机.原文.消息).length, 0);
    e.update = async () => block([patch('/世界/当前时间', time(1))]);
    await e.runtime.retry();
    assert.equal(Object.keys(e.state().手机.原文.消息).length, 1);
    assert.equal(e.calls.length, 2);
    assert.equal(e.state().世界.当前时间.分, 1);
  });
});

test('多人建群邀约通过真实手机事务一次请求，失败重试不重复建群或投递', async () => {
  const initial = seed();
  initial.手机.账号.remote = copy(initial.手机.账号.npc);
  initial.手机.账号.remote.人物id = 'remote';
  initial.手机.联系人.remote = { ...copy(initial.手机.联系人.a), 对方账号id: 'remote' };
  await withEnv(async e => {
    e.update = async () => { throw Error('模拟邀约请求失败'); };
    await assert.rejects(e.runtime.phoneAction({ kind: 'invite', platform: '邻信', targets: ['npc', 'remote'],
      groupName: '学院同好群', text: '一起聊聊吗？' }), /模拟邀约请求失败/);
    assert.equal(Object.keys(e.state().手机.群).length, 0);
    assert.equal(Object.keys(e.state().手机.原文.消息).length, 0);
    assert.equal(e.calls.filter(c => c.kind === 'update').length, 1);
    e.update = async () => block([]);
    await e.runtime.retry();
    const groups = Object.entries(e.state().手机.群);
    assert.equal(groups.length, 1);
    assert.equal(groups[0][1].名称, '学院同好群');
    assert.deepEqual(Object.keys(groups[0][1].成员), ['me']);
    const messages = Object.values(e.state().手机.原文.消息);
    assert.equal(messages.length, 2);
    assert(messages.every(m => JSON.stringify(m.内容块).includes(groups[0][0])));
    assert.equal(e.calls.filter(c => c.kind === 'update').length, 2);
  }, initial);
});

test('两条 API 都拒绝改写脚本只读字段', async () => {
  for (const channel of ['story', 'phone'])
    await withEnv(async e => {
      e.update = async () => block([patch('/_系统/数据版本', 999)]);
      await assert.rejects(
        channel === 'story' ? e.runtime.send('剧情') : e.runtime.phoneAction({ kind: 'refresh', id: 'chat' }),
        /脚本管理字段/,
      );
      assert.equal(e.state()._系统.数据版本, 0);
    });
});

test('手机调用期间切换聊天，不把候选写入新聊天', async () => {
  await withEnv(async e => {
    const response = deferred();
    e.update = () => response.promise;
    const pending = e.runtime.phoneAction({ kind: 'refresh', id: 'chat' });
    const result = assert.rejects(pending);
    await until(() => e.calls.length === 1);
    e.chat = 'another-chat';
    response.resolve(block([patch('/世界/当前时间', time(15))]));
    await result;
    assert.equal(e.messages[0].data.stat_data.世界.当前时间.分, 0);
  });
});

test('Google 映射和携带预设仍使用手机独立端点与同一规则', async () => {
  await withEnv(
    async e => {
      await e.runtime.phoneAction({ kind: 'refresh', id: 'chat' });
      assert.equal(e.calls.length, 1);
      const call = e.calls[0];
      assert.equal(call.kind, 'preset-update');
      assert.equal(call.config.custom_api.source, 'makersuite');
      assert.equal(call.config.custom_api.model, 'phone');
      assert.equal(call.config.should_stream, false);
      assert.deepEqual(call.config.injects, []);
      assert.equal(call.config.overrides.chat_history.with_depth_entries, false);
      assert.deepEqual(JSON.parse(call.config.overrides.chat_history.prompts[0].content).角色.remote, publicPerson(e.state().角色.remote));
      assert(e.rules.every(r => !r.enabled));
    },
    seed(),
    { phone: { ...endpoint('phone'), source: 'google', sendPreset: true } },
  );
});

test('手机提交后的变量成为下一次正文和正文变量 API 的共同基线', async () => {
  await withEnv(async e => {
    e.update = async config =>
      config.custom_api.model === 'phone'
        ? block([patch('/世界/当前时间', time(12))])
        : block([patch('/玩家/当前状态/体力值', 75)]);
    await e.runtime.phoneAction({ kind: 'refresh', id: 'chat' });
    await e.runtime.send('继续剧情');
    assert.deepEqual(
      e.calls.map(c => c.config.custom_api?.model ?? 'main'),
      ['phone', 'main', 'variable'],
    );
    assert.doesNotMatch(JSON.stringify(e.calls[1].config.injects), /以下是当前存档的完整事实资料/);
    const data = JSON.parse(e.calls[2].config.ordered_prompts.find(p => typeof p === 'object').content);
    assert.equal(data.世界.当前时间.分, 12);
    assert.equal(e.state().世界.当前时间.分, 12);
    assert.equal(e.state().玩家.当前状态.体力值, 75);
  });
});

function openingRosterPayload() {
  const characters = ['主要', '次要'].flatMap((层级, group) => Array.from({ length: group ? 51 : 120 }, (_, index) => {
    const id = `${group ? 'n' : 'm'}${String(index).padStart(2, '0')}`;
    return { id, 姓名: '开局人物_' + id, 层级, 简介: `PROFILE_ONLY_${id}_END`,
      当前地点id: id === 'm01' ? 'intro' : 'remote',
      生活: { 住处id: id === 'm00' ? 'intro' : 'remote', 常去地点id: id === 'n00' ? ['intro'] : ['remote'] }, __imported: true };
  }));
  return { submissionId: 'opening-profile-171', player: { 姓名: '开局调度玩家' }, characters,
    details: { 地点: {
      intro: { 名称: '开场广场', 片区id: 'residential', 地图位置: { x: 480, y: 380, 精度: '地点' } },
      remote: { 名称: '远方城镇', 片区id: 'riverside', 地图位置: { x: 510, y: 235, 精度: '地点' } },
    },
      玩家: { 当前状态: { 当前地点id: 'intro' } }, 初始关系: {
        m119: { relation: '朋友', basis: '玩家明确要求的旧识', relationEdited: true, basisEdited: true },
        m118: { relation: '模板旧识', basis: '未经选择的模板默认', relationEdited: false, basisEdited: false },
      } } };
}
const openingRosterSettings = (characterAuto = true) => ({ variable: endpoint('variable'), phone: endpoint('phone'), characterAuto,
  characterRoster: { majorLimit: 2, minorLimit: 1, majorRotation: 1, minorRotation: 1 } });

test('开局调度：建档171人后只发送地点相关和明确联系的3人，待机档案与来源不进入最终请求', async () => {
  await withEnv(async e => {
    const payload = openingRosterPayload();
    const saved = await e.runtime.createProfile(payload);
    assert.deepEqual(saved, { active: 3, waiting: 168 });
    assert.equal(e.calls.length, 0, '本地选人不调用模型');
    assert.deepEqual(Object.keys(e.state().角色), ['m01', 'm119', 'n00']);
    const opening = Object.values(e.state()._系统.任务).find(t => t.类别 === '建档' && t.状态 === '排队');
    assert.deepEqual(new Set(opening.目标id), new Set(['m01', 'm119', 'n00']));
    const revisionId = e.state()._系统.角色库版本;
    assert.deepEqual(await e.runtime.createProfile(payload), saved, '同一提交可重入而不重建角色');
    assert.equal(e.state()._系统.角色库版本, revisionId);
    const captured = [];
    const capture = config => {
      const injected = config.ordered_prompts?.filter(p => typeof p === 'object') ?? config.overrides?.chat_history?.prompts ?? config.injects ?? [];
      const messages = [...injected.map(p => ({ role: p.role, content: p.content })),
        { role: 'system', content: `<status_current_variable>${JSON.stringify(e.state())}</status_current_variable>` },
        { role: 'user', content: config.user_input }];
      e.listeners.get('completion_settings')({ messages });
      const text = JSON.stringify(messages), library = LibrarySchema.parse(e.vars.澄湾角色库);
      const revision = library.revisions[e.state()._系统.角色库版本];
      for (const id of Object.keys(revision.disabled)) assert(!text.includes(`PROFILE_ONLY_${id}_END`), id);
      for (const id of Object.keys(e.state().角色)) assert(text.includes(`PROFILE_ONLY_${id}_END`), id);
      assert(!text.includes('snapshots')); assert(!text.includes('queues')); assert(!text.includes('澄湾角色库'));
      assert.equal((text.match(/<status_current_variable>/g) ?? []).length, config.custom_api ? 0 : 1);
      captured.push({ model: config.custom_api?.model ?? 'main', active: Object.keys(e.state().角色), length: text.length });
    };
    e.story = async config => { capture(config); return '玩家独自观察开场广场。'; };
    e.update = async config => {
      capture(config);
      return block(e.state().角色.m01?.年龄 === null ? [patch('/角色/m01/年龄', 30)] : []);
    };
    await e.runtime.startOpening();
    assert.deepEqual(e.calls.map(c => c.config.custom_api?.model ?? 'main'), ['main', 'variable']);
    const library = e.vars.澄湾角色库, automatic = library.revisions[e.state()._系统.角色库版本].automatic;
    assert.equal(Object.keys(library.snapshots).length, 168);
    for (const id of ['m01', 'm119', 'n00']) assert.equal(e.state()._系统.任务[automatic.checks[id]].状态, '已提交');
    assert.equal(Object.keys(e.runtime.view.characterLibrary.characters).length, 171);
    assert.equal(Object.keys(e.state()._系统.来源档案).length, 3);
    await e.runtime.send('继续观察环境');
    assert(e.state().角色.m00); assert(e.state().角色.n01);
    assert.equal(e.calls.length, 4, '下一轮沿用现有调度，只增加正文和变量请求');
    console.info('[开局角色调度证据：本地171人最终请求构造]', JSON.stringify({ imported: 171, openingActive: 3, waiting: 168, captured }));
  }, Schema.parse({}), openingRosterSettings());
});

test('开局调度：前端桥接在建档保存期间锁定，保存后即时显示3人启用和168人待机', async () => {
  await withEnv(async e => {
    window.parent.__chengwanService = { ready: true, runtime: e.runtime };
    const frontend = connectRuntime(e.runtime), persist = deferred();
    const unwatch = require('vue').watch(e.runtime.view, () => e.listeners.get('chengwan:runtime_changed')?.(), { deep: true });
    let saving = false;
    SillyTavern.saveChat = () => { saving = true; return persist.promise; };
    const operation = frontend.runtime.createProfile(openingRosterPayload());
    try {
      assert(frontend.runtime.view.queued.some(item => item.kind === 'local'));
      await until(() => saving);
      assert.equal(frontend.runtime.view.updating, true);
      persist.resolve();
      assert.deepEqual(await operation, { active: 3, waiting: 168 });
      assert.equal(frontend.runtime.view.updating, false);
      assert.equal(frontend.runtime.view.data._系统.建档完成, true);
      assert.equal(Object.keys(frontend.runtime.view.data.角色).length, 3);
      assert.equal(Object.keys(frontend.runtime.view.characterLibrary.characters).length, 171);
      assert.equal(e.calls.length, 0);
    } finally {
      persist.resolve();
      await operation;
      unwatch(); frontend.disconnect();
    }
  }, Schema.parse({}), openingRosterSettings());
});

test('开局调度：变量失败保留原名单和正文，重试只发变量，不重复选人或增加快照', async () => {
  await withEnv(async e => {
    await e.runtime.createProfile(openingRosterPayload());
    const library = copy(e.vars.澄湾角色库), revision = e.state()._系统.角色库版本;
    e.update = async () => block([patch('/角色/m01/年龄', 30), { op: 'remove', path: '/角色/n00' }]);
    await assert.rejects(e.runtime.startOpening(), /角色|开局/);
    assert.equal(e.state().角色.m01.年龄, null); assert(e.state().角色.n00);
    const narrative = e.messages[2].message;
    e.update = async () => block([patch('/角色/m01/年龄', 30)]);
    await e.runtime.retry();
    assert.deepEqual(e.calls.map(c => c.config.custom_api?.model ?? 'main'), ['main', 'variable', 'variable']);
    assert.equal(e.messages.length, 3); assert.equal(e.messages[2].message, narrative);
    assert.equal(e.state().角色.m01.年龄, 30);
    assert.equal(e.state()._系统.角色库版本, revision);
    assert.deepEqual(e.vars.澄湾角色库, library);
  }, Schema.parse({}), openingRosterSettings());
});

test('开局调度：旧版已建档未开场的171人同样筛选；关闭自动轮转也不发送全部档案', async () => {
  const initial = createProfile(Schema.parse({}), openingRosterPayload());
  assert.equal(Object.keys(initial.角色).length, 171);
  await withEnv(async e => {
    e.story = async () => {
      assert.deepEqual(Object.keys(e.state().角色), ['m01', 'm119', 'n00']);
      return '观察开场地点';
    };
    e.update = async () => block([patch('/角色/m01/年龄', 30)]);
    await e.runtime.startOpening();
    assert.equal(Object.keys(e.state().角色).length, 3);
    assert.equal(Object.keys(e.vars.澄湾角色库.snapshots).length, 168);
    assert.equal(e.calls.length, 2);
  }, initial, openingRosterSettings(false));
});

test('开局调度：建档保存失败回滚，快照独立保留，恢复后不再复制或发送171人', async () => {
  await withEnv(async e => {
    const original = copy(e.state()), payload = openingRosterPayload();
    SillyTavern.saveChat = async () => { if (e.messages[0].data.stat_data._系统.建档完成) throw Error('开局建档保存失败'); };
    await assert.rejects(e.runtime.createProfile(payload), /开局建档保存失败/);
    assert.deepEqual(e.state(), original); assert.equal(e.calls.length, 0);
    assert.equal(Object.keys(e.vars.澄湾角色库.snapshots).length, 168);
    assert(e.vars.澄湾待确认提交.rollbackOnFailure);
    SillyTavern.saveChat = async () => {};
    await e.runtime.retry();
    assert.deepEqual(await e.runtime.createProfile(payload), { active: 3, waiting: 168 });
    assert.equal(Object.keys(e.vars.澄湾角色库.snapshots).length, 168);
    assert.equal(e.vars.澄湾待确认提交, null);
    e.update = async () => block([patch('/角色/m01/年龄', 30)]);
    await e.runtime.startOpening();
    assert.equal(e.calls.length, 2);
    assert.equal(Object.keys(e.state().角色).length, 3);
  }, Schema.parse({}), openingRosterSettings());
});

test('开局调度：旧版开场名单保存失败后先恢复名单，再发送一次正文和变量', async () => {
  await withEnv(async e => {
    const original = copy(e.state());
    SillyTavern.saveChat = async () => { if (!e.messages[0].data.stat_data.角色.m118) throw Error('开场名单保存失败'); };
    await assert.rejects(e.runtime.startOpening(), /开场名单保存失败/);
    assert.deepEqual(e.state(), original); assert.equal(e.calls.length, 0);
    assert.equal(Object.keys(e.vars.澄湾角色库.snapshots).length, 168);
    SillyTavern.saveChat = async () => {};
    e.update = async () => block([patch('/角色/m01/年龄', 30)]);
    await e.runtime.retry();
    assert.equal(Object.keys(e.vars.澄湾角色库.snapshots).length, 168);
    assert.equal(e.vars.澄湾待确认提交, null);
    assert.deepEqual(e.calls.map(c => c.config.custom_api?.model ?? 'main'), ['main', 'variable']);
    assert.equal(e.messages.length, 3);
  }, createProfile(Schema.parse({}), openingRosterPayload()), openingRosterSettings());
});

test('开局仍是一段正文加一次整批变量请求，失败不部分补全角色', async () => {
  const { createProfile } = require(root + '/运行/creation.ts');
  const initial = createProfile(Schema.parse({}), {
    player: { 姓名: '开场玩家' },
    characters: ['a', 'b', 'c'].map(id => ({ id, 姓名: id, 层级: '次要', 当前地点id: 'intro', __imported: true })),
    details: { 地点: { intro: { 名称: '开场广场', 片区id: 'residential', 地图位置: { x: 480, y: 380, 精度: '地点' } } }, 玩家: { 当前状态: { 当前地点id: 'intro' } } },
  });
  await withEnv(async e => {
    e.update = async () => block(['a', 'b', 'c'].map(id => patch(`/角色/${id}/年龄`, 28)));
    await e.runtime.startOpening();
    assert.deepEqual(
      e.calls.map(c => c.config.custom_api?.model ?? 'main'),
      ['main', 'variable'],
    );
    assert.equal(e.parses, 1);
    for (const id of ['a', 'b', 'c']) assert.equal(e.state().角色[id].年龄, 28);
    assert(Object.values(e.state()._系统.任务).every(t => t.状态 === '已提交'));
  }, initial);
  await withEnv(async e => {
    e.update = async () => block([{ op: 'remove', path: '/角色/c' }, patch('/角色/a/年龄', 28)]);
    await assert.rejects(e.runtime.startOpening());
    assert.equal(e.state().角色.a.年龄, null);
    assert(e.state().角色.c);
    assert.equal(e.messages.length, 3);
  }, initial);
});

test('开局修订已填写显著特征并持久化，失败后仅重试变量而不重发正文', async () => {
  const { createProfile } = require(root + '/运行/creation.ts');
  const initial = createProfile(Schema.parse({}), { player: { 姓名: '开场玩家', 年龄: 28, 显著特征: '无' }, characters: [] });
  assert.equal(initial.玩家.外貌.显著特征, '无');
  await withEnv(async e => {
    const revised = [patch('/玩家/外貌/显著特征', '左眉有一道浅疤'), patch('/玩家/年龄', 29)];
    e.update = async () => block([...revised, patch('/玩家/id', 'invalid_player')]);
    await assert.rejects(e.runtime.startOpening(), /不能更改玩家 ID/);
    assert.equal(e.state().玩家.外貌.显著特征, '无');
    assert.equal(e.state().玩家.年龄, 28);
    assert.equal(e.messages.length, 3);
    const narrative = e.messages[2].message;
    e.update = async () => block(revised);
    await e.runtime.retry();
    assert.deepEqual(e.calls.map(c => c.config.custom_api?.model ?? 'main'), ['main', 'variable', 'variable']);
    assert.equal(e.messages.length, 3);
    assert.equal(e.messages[2].message, narrative);
    assert.equal(e.state().玩家.外貌.显著特征, '左眉有一道浅疤');
    assert.equal(e.state().玩家.年龄, 29);
    assert.equal(e.messages[2].data.stat_data.玩家.外貌.显著特征, '左眉有一道浅疤');
    assert(Object.values(e.state()._系统.任务).filter(t => t.类别 === '建档').every(t => t.状态 === '已提交'));
    const request = JSON.stringify(e.calls[2].config);
    assert.match(request, /已填写内容也可按依据修订/);
    assert.doesNotMatch(request, /绝对不得覆盖|绝不改动玩家已填写|不改写玩家已填写/);
  }, initial);
});

test('手机更新可在同一次请求处理摘要待办，保留原消息且不追加变量请求', async () => {
  const initial = seed();
  initial.手机.原文.消息 = Schema.parse({
    手机: {
      原文: {
        消息: {
          old: { 会话id: 'chat', 发送账号id: 'npc', 内容块: [{ 类型: '文字', id: 'old-text', 正文: '历史消息' }] },
        },
      },
    },
  }).手机.原文.消息;
  initial.手机.会话.chat._窗口._近期id = ['old'];
  initial._系统.任务 = Schema.parse({
    _系统: {
      任务: {
        archive: {
          类别: '摘要',
          触发来源: '会话:chat',
          覆盖记录id: ['old'],
          状态: '排队',
          提交id: 'archive-commit',
        },
      },
    },
  })._系统.任务;
  await withEnv(async e => {
    e.update = async () =>
      block([
        patch('/世界/当前时间', time(2)),
        {
          op: 'add',
          path: '/手机/摘要/summary',
          value: { 层级: '细摘要', 内容: '双方此前确认的事实。', 覆盖记录id: ['old'] },
        },
      ]);
    await e.runtime.phoneAction({ kind: 'refresh', id: 'chat' });
    assert.equal(e.calls.length, 1);
    assert.equal(e.state()._系统.任务.archive.状态, '已提交');
    assert.deepEqual(e.state().手机.会话.chat._窗口._细摘要id, ['summary']);
    assert(e.state().手机.原文.消息.old);
    assert.equal(e.state().世界.当前时间.分, 2);
  }, initial);
});

test('规则缺失时拒绝手机请求，不用离线导出的规则悄悄替代', async () => {
  await withEnv(async e => {
    e.rules = e.rules.slice(1);
    await assert.rejects(e.runtime.phoneAction({ kind: 'refresh', id: 'chat' }), /变量规则缺失/);
    assert.equal(e.calls.length, 0);
  });
});

test('停止后到达的正文不触发变量 API；停止手机也不写回', async () => {
  for (const channel of ['story', 'phone'])
    await withEnv(async e => {
      const reply = deferred();
      e.story = () => reply.promise;
      e.update = () => reply.promise;
      const operation =
        channel === 'story' ? e.runtime.send('剧情') : e.runtime.phoneAction({ kind: 'refresh', id: 'chat' });
      const rejected = assert.rejects(operation);
      await until(() => e.calls.length === 1);
      e.runtime.stop();
      reply.resolve(channel === 'story' ? '迟到正文' : block([patch('/世界/当前时间', time(15))]));
      await rejected;
      assert.equal(e.calls.length, 1);
      assert.equal(e.messages[0].data.stat_data.世界.当前时间.分, 0);
    });
});

test('停止中的流式片段不写成助手楼，已保存玩家楼可从失败记录重试', async () => {
  await withEnv(async e => {
    const first = deferred();
    e.story = () => first.promise;
    const sending = e.runtime.send('玩家行动');
    await until(() => e.calls.length === 1);
    e.listeners.get('stream')('临时流式片段', e.calls[0].config.generation_id);
    assert.equal(e.runtime.view.streaming, '临时流式片段');
    e.runtime.stop();
    first.resolve('迟到正文');
    await assert.rejects(sending, /生成已停止/);
    assert.equal(e.messages.length, 2);
    assert.equal(e.messages[1].role, 'user');
    assert.equal(e.runtime.view.streaming, '');
    assert(e.vars.澄湾失败请求);
    e.story = async () => '重试后完成的正文';
    await e.runtime.retry();
    assert.equal(e.messages.length, 3);
    assert.equal(e.messages[2].message, '重试后完成的正文');
    assert.equal(e.calls.filter(c => c.kind === 'update').length, 1);
  });
});

test('消耗可复用同一事件，但不能用无关事件或旧记录冒充本次依据', () => {
  const { validateUse } = require(root + '/运行/settlement.ts');
  const before = Schema.parse({
    玩家: { 物品栏: { water: { 类别: '消耗品', 数量: 2 } } },
    事件: { meal: { 事实: '午餐进行中', 关联记录id: ['water'] } },
  });
  const candidate = copy(before);
  candidate.玩家.物品栏.water.数量 = 1;
  assert.throws(() => validateUse(before, candidate, { itemId: 'water', amount: 1 }), /关联本物品/);
  candidate.事件.meal.事实 = '午餐期间喝了一瓶水';
  assert.doesNotThrow(() => validateUse(before, candidate, { itemId: 'water', amount: 1 }));
  candidate.事件.meal.关联记录id = [];
  assert.throws(() => validateUse(before, candidate, { itemId: 'water', amount: 1 }), /关联本物品/);
  candidate.事件.meal.关联记录id = ['water'];
  assert.throws(() => validateUse(before, candidate, { itemId: 'water', amount: 2 }), /消耗数量/);
});

test('收入支出退款使用单一余额，内部转账仅保留旧历史', () => {
  const { validateSettlement } = require(root + '/运行/settlement.ts');
  const before = Schema.parse({ 玩家: { 资金: { 账户: { cash: { 余额分: 1000 }, bank: { 余额分: 0 } } } } });
  for (const [类型, 付款账户id, 收款账户id, cash, bank] of [
    ['支出', 'cash', null, 900, 0],
    ['收入', null, 'cash', 1100, 0],
    ['退款', null, 'cash', 1100, 0],
    ['内部转账', 'cash', 'bank', 900, 100],
  ]) {
    const after = Schema.parse({
      玩家: {
        资金: {
          账户: { cash: { 余额分: cash }, bank: { 余额分: bank } },
          交易: {
            tx: { 类型, 付款账户id, 收款账户id, 对方id: 'shop', 事件id: 'e', 金额分: 100, 状态: '已完成' },
          },
        },
      },
      事件: { e: { 事实: '本次已结算' } },
    });
    if (类型 === '内部转账') assert.throws(() => validateSettlement(before, after), /不再建立内部转账/);
    else assert.doesNotThrow(() => validateSettlement(before, after));
  }
});

test('天气检查使用真实公历跨度，跨日、到期和首次未知都检查，无变化不改生效时间', () => {
  const { elapsedMinutes, weatherCheckDue, finalizeWorld } = require(root + '/运行/world.ts');
  const t = (年, 月, 日, 时, 分 = 0) => ({ 年, 月, 日, 时, 分 });
  assert.equal(elapsedMinutes(t(2024, 2, 29, 23, 59), t(2024, 3, 1, 0)), 1);
  assert.equal(elapsedMinutes(t(2026, 12, 31, 23, 59), t(2027, 1, 1, 0)), 1);
  const before = Schema.parse({
    世界: {
      当前时间: t(2026, 9, 22, 8),
      天气: {
        天气状况: '阴',
        生效时间: t(2026, 9, 22, 7),
        _上次检查时间: t(2026, 9, 22, 8),
      },
    },
  });
  assert.equal(weatherCheckDue(before, t(2026, 9, 22, 10, 59)), false);
  assert.equal(weatherCheckDue(before, t(2026, 9, 22, 11)), true);
  assert.equal(weatherCheckDue(before, t(2026, 9, 23, 0)), true);
  const after = copy(before);
  after.世界.当前时间 = t(2026, 9, 22, 11);
  after.世界.天气.生效时间 = after.世界.当前时间;
  const result = finalizeWorld(before, after);
  assert.deepEqual(result.世界.天气._上次检查时间, after.世界.当前时间);
  assert.deepEqual(result.世界.天气.生效时间, before.世界.天气.生效时间);
  assert.equal(weatherCheckDue(result), false);
  assert.equal(weatherCheckDue(Schema.parse({ 世界: { 当前时间: time(0) } })), true);
  assert.equal(elapsedMinutes(null, time(0)), null);
});

test('建档只建立已知时间锚点；未知天气由现有变量请求补全，未知故事时间不被程序补造', async () => {
  const { createProfile } = require(root + '/运行/creation.ts');
  const initial = createProfile(Schema.parse({}), {
    player: { 姓名: '测试' },
    characters: [],
    details: { 世界: { 当前时间: time(0) } },
  });
  assert.equal(initial.世界.天气.天气状况, null);
  assert.deepEqual(initial.世界.天气._上次检查时间, time(0));
  await withEnv(async e => {
    e.story = async () => '窗外阴天，微风，约二十二度。';
    e.update = async config => {
      assert.match(JSON.stringify(config), /开局或首次涉及场景/);
      return block([
        patch('/世界/天气/天气状况', '阴'),
        patch('/世界/天气/气温', 22),
        patch('/世界/天气/风况', '微风'),
        patch('/世界/天气/适用区域', '澄湾市'),
        patch('/世界/当前场景/环境状态', '窗外阴天'),
      ]);
    };
    await e.runtime.send('看看窗外');
    assert.equal(e.state().世界.天气.气温, 22);
    assert.deepEqual(e.state().世界.天气.生效时间, time(0));
    assert.deepEqual(e.state().世界.当前场景._上次更新场景时间, time(0));
    assert.equal(e.calls.filter(c => c.kind === 'update').length, 1);
    assert.equal(e.state().玩家.年龄, null);
    assert.equal(e.state().玩家.资金.余额分, null);
  }, initial);
  const { finalizeWorld } = require(root + '/运行/world.ts');
  const unknown = Schema.parse({});
  const candidate = copy(unknown);
  candidate.世界.天气.天气状况 = '多云';
  const result = finalizeWorld(unknown, candidate);
  assert.equal(result.世界.当前时间, null);
  assert.equal(result.世界.天气.生效时间, null);
  assert.equal(result.世界.天气._上次检查时间, null);
});

test('实际host容忍场景锚点误写和整体替换省略字段，仍由脚本记录真实更新时间', async () => {
  const initial = seed();
  initial.世界.当前场景._上次更新场景时间 = time(0);
  initial.世界.天气._上次检查时间 = time(0);
  initial.世界.天气.天气状况 = '阴';
  await withEnv(async e => {
    const parse = Mvu.parseMessage;
    Mvu.parseMessage = async (text, before) => {
      const commands = updateBlock(text).commands;
      assert(!commands.some(command => /\/_上次/.test(command.path)));
      const scene = commands.find(command => command.path === '/世界/当前场景');
      if (scene) assert.deepEqual(scene.value._上次更新场景时间, before.stat_data.世界.当前场景._上次更新场景时间);
      return parse(text, before);
    };
    e.update = async () => block([
      patch('/世界/当前时间', time(5)),
      patch('/世界/当前场景', { 环境状态: '窗边亮起了灯' }),
      patch('/世界/当前场景/_上次更新场景时间', '错误格式'),
      patch('/世界/天气/_上次检查时间', { 年: 9999 }),
    ]);
    await e.runtime.send('点亮窗边的灯');
    assert.equal(e.state().世界.当前场景.环境状态, '窗边亮起了灯');
    assert.deepEqual(e.state().世界.当前场景._上次更新场景时间, time(5));
    assert.deepEqual(e.state().世界.天气._上次检查时间, time(0));
    assert.equal(e.calls.filter(call => call.kind === 'update').length, 1);
    e.update = async () => block([
      patch('/世界/当前时间', time(10)),
      patch('/世界/当前场景/_上次更新场景时间', time(10)),
    ]);
    await e.runtime.send('停留片刻');
    assert.deepEqual(e.state().世界.当前场景._上次更新场景时间, time(5));
  }, initial);
});

test('场景锚点兼容不会放宽其他脚本字段保护，失败结算不写入存档', async () => {
  await withEnv(async e => {
    const before = copy(e.state());
    e.update = async () => block([
      patch('/世界/当前场景/_上次更新场景时间', time(50)),
      patch('/_系统/数据版本', 999),
    ]);
    await assert.rejects(e.runtime.send('观察周围'), /模型尝试修改脚本管理字段/);
    assert.deepEqual(e.state(), before);
  });
});

test('手机结算同样容忍时间锚点误写，不增加额外模型请求', async () => {
  await withEnv(async e => {
    e.update = async () => block([
      patch('/世界/当前场景/环境状态', '雨声从窗外传来'),
      patch('/世界/当前场景/_上次更新场景时间', '错误格式'),
      patch('/世界/天气/_上次检查时间/年', 9999),
    ]);
    await e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '外面开始下雨了' });
    assert.equal(e.state().世界.当前场景.环境状态, '雨声从窗外传来');
    assert.deepEqual(e.state().世界.当前场景._上次更新场景时间, time(0));
    assert.equal(e.calls.filter(call => call.kind === 'update').length, 1);
  });
});

test('天气失败不提前记检查成功，成功重试后才记录锚点', async () => {
  const initial = seed();
  initial.世界.天气.天气状况 = '阴';
  initial.世界.天气._上次检查时间 = { ...time(0), 时: 6 };
  await withEnv(async e => {
    e.update = async () => {
      throw Error('检查失败');
    };
    await assert.rejects(e.runtime.phoneAction({ kind: 'refresh', id: 'chat' }), /检查失败/);
    assert.equal(e.state().世界.天气._上次检查时间.时, 6);
    e.update = async () => block([]);
    await e.runtime.retry();
    assert.deepEqual(e.state().世界.天气._上次检查时间, time(0));
    assert.equal(e.state().世界.天气.生效时间, null);
  }, initial);
});

test('后台主要NPC五轮后自动排队，下一次交互更新生活与记录，覆盖到实际结束且不泄露玩家认知', async () => {
  const initial = seed();
  initial.角色.remote = Schema.parse({
    角色: {
      remote: {
        层级: '主要',
        姓名: '远处人物',
        身份: '教师',
        当前状态: '备课',
        _更新循环: { 上次更新变量时间: time(0) },
      },
    },
  }).角色.remote;
  await withEnv(async e => {
    let round = 0;
    e.update = async config => {
      round++;
      const commands = [patch('/世界/当前时间', time(round))];
      if (round === 6) {
        assert.match(JSON.stringify(config), /覆盖起点/);
        assert.match(JSON.stringify(config), /最近经历/);
        commands.push(
          patch('/角色/remote/当前状态', '完成备课，整理教案'),
          { op: 'insert', path: '/角色/remote/生活/目标/lesson', value: { 内容: '完成教案', 进展: '已完成' } },
          {
            op: 'insert',
            path: '/角色/remote/经历/最近经历/prep',
            value: { 日期说明: '2026年09月22日', 日期精度: '日', 经历: '独自完成备课' },
          },
        );
      }
      return round === 6
        ? lifeCheckedBlock(e.state(), commands, { remote: '已记录独自完成备课、目标进展与最近经历' })
        : block(commands);
    };
    for (let i = 0; i < 5; i++) await e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '交流' });
    const taskId = Object.keys(e.state()._系统.任务).find(id => e.state()._系统.任务[id].类别 === '生活更新');
    assert(taskId);
    assert.equal(e.state()._系统.任务[taskId].状态, '排队');
    await e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '继续' });
    const person = e.state().角色.remote;
    assert.equal(person.身份, '教师');
    assert.equal(person.当前状态, '完成备课，整理教案');
    assert.equal(person.生活.目标.lesson.进展, '已完成');
    assert.equal(person.经历.最近经历.prep.经历, '独自完成备课');
    assert.deepEqual(person._更新循环.上次更新变量时间, time(6));
    assert.equal(person._更新循环.当前计数, 1);
    assert.equal(e.state()._系统.任务[taskId].状态, '已提交');
    assert.deepEqual(e.state().玩家.已知信息, initial.玩家.已知信息);
    assert.equal(e.calls.length, 6);
  }, initial);
});

test('生活检查缺回执仍保存本轮事实，下次玩家手机交互自动补检且不重复生活经历', async () => {
  const initial = seed();
  initial.角色.remote = Schema.parse({
    角色: { remote: {
      层级: '主要', 姓名: '远处教师', 当前状态: '备课',
      _更新循环: { 当前计数: 5, 上次更新变量时间: time(0), 待处理任务id: 'life_remote' },
    } },
  }).角色.remote;
  initial._系统.任务 = Schema.parse({ _系统: { 任务: { life_remote: {
    类别: '生活更新', 目标id: ['remote'], 目标版本: { remote: 0 }, 计数截止点: { remote: 5 },
    起始时间: time(0), 截止时间: time(0), 状态: '排队',
  } } } })._系统.任务;
  await withEnv(async e => {
    e.story = async () => '玩家在窗边喝水。';
    e.update = async () => block([
      patch('/世界/当前时间', time(5)),
      patch('/玩家/当前状态/身体状态', '喝水后口渴缓解'),
      patch('/角色/remote/当前状态', '独自完成备课，正在整理讲义'),
      { op: 'insert', path: '/角色/remote/经历/最近经历/prep', value: {
        日期说明: '2026年09月22日', 日期精度: '日', 经历: '独自完成备课，整理了明日讲义',
      } },
    ]);
    await e.runtime.send('喝一些水，稍作休息');
    assert.equal(e.calls.length, 2);
    assert.equal(e.state().玩家.当前状态.身体状态, '喝水后口渴缓解');
    assert.equal(e.state().角色.remote.当前状态, '独自完成备课，正在整理讲义');
    assert.equal(e.state()._系统.任务.life_remote.状态, '失败');
    assert.equal(e.state().角色.remote._更新循环.当前计数, 6);
    assert.deepEqual(e.state().角色.remote._更新循环.上次更新变量时间, time(0));
    assert.equal(e.state().角色.remote._更新循环.待处理任务id, 'life_remote');
    const facts = copy(e.state().角色.remote.经历.最近经历);
    e.runtime.refresh();
    await turn();
    assert.equal(e.calls.length, 2, '失败后空闲不立即循环请求');
    e.update = async config => {
      assert.match(JSON.stringify(config), /上次检查未完成/);
      assert.match(JSON.stringify(config), /已写入的事实不要重复演绎/);
      return lifeCheckedBlock(e.state(), [patch('/世界/当前时间', time(6))]);
    };
    await e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '问候一句' });
    assert.deepEqual(e.calls.map(call => call.config.custom_api?.model ?? 'main'), ['main', 'variable', 'phone']);
    assert.equal(e.state()._系统.任务.life_remote.状态, '已提交');
    assert.equal(e.state()._系统.任务.life_remote.错误, null);
    assert.equal(e.state().角色.remote._更新循环.当前计数, 2);
    assert.deepEqual(e.state().角色.remote._更新循环.上次更新变量时间, time(6));
    assert.equal(e.state().角色.remote._更新循环.待处理任务id, null);
    assert.deepEqual(e.state().角色.remote.经历.最近经历, facts);
    assert.equal(e.state().玩家.当前状态.身体状态, '喝水后口渴缓解');
    assert.deepEqual(e.state().玩家.已知信息, initial.玩家.已知信息);
  }, initial);
});

test('生活检查跨日推进锚点后，昨日不足十条的经历仍会排队归档，不夹带今日记录', () => {
  const { planTasks } = require(root + '/运行/tasks.ts');
  const { finalizeArchive } = require(root + '/运行/archive.ts');
  const initial = Schema.parse({
    世界: { 当前时间: time(0) },
    角色: {
      npc: {
        层级: '主要',
        _更新循环: { 上次更新变量时间: time(0) },
        经历: {
          最近经历: {
            yesterday: { 日期说明: '2026年09月21日', 日期精度: '日', 经历: '昨日下班' },
            today: { 日期说明: '2026年09月22日', 日期精度: '日', 经历: '今日早餐' },
          },
        },
      },
    },
  });
  const planned = planTasks(initial);
  const taskId = Object.keys(planned._系统.任务).find(id => planned._系统.任务[id].类别 === '摘要');
  assert(taskId);
  assert.deepEqual(planned._系统.任务[taskId].覆盖记录id, ['yesterday']);
  const candidate = copy(planned);
  candidate.角色.npc.经历.生活摘要.summary = Schema.parse({
    角色: {
      npc: {
        层级: '主要',
        经历: {
          生活摘要: {
            summary: {
              经历: '昨日下班的生活记录',
              起始日期说明: '2026年09月21日',
              结束日期说明: '2026年09月21日',
              覆盖记录id: ['yesterday'],
            },
          },
        },
      },
    },
  }).角色.npc.经历.生活摘要.summary;
  const result = finalizeArchive(planned, candidate, taskId);
  assert(result.角色.npc.经历.最近经历.today);
  assert(!result.角色.npc.经历.最近经历.yesterday);
  assert(result.角色.npc.经历._待归档经历.yesterday);
});

test('审查修复：正文已写入后保存失败，立即重试只补保存且不重复请求', async () => {
  await withEnv(async e => {
    let failed = false;
    SillyTavern.saveChat = async () => {
      if (!failed && e.messages[2]?.data?.stat_data?._系统?.楼层id === 2) {
        failed = true;
        throw Error('模拟楼层写入后的保存失败');
      }
    };
    await assert.rejects(e.runtime.send('保存失败检查'), /保存失败/);
    assert(e.vars.澄湾待更新正文);
    assert(e.vars.澄湾待确认提交);
    const saved = copy(e.messages[2].data);
    await e.runtime.retry();
    assert.equal(e.calls.length, 2);
    assert.equal(e.messages.length, 3);
    assert.deepEqual(e.messages[2].data, saved);
    assert.equal(e.vars.澄湾待更新正文, null);
    assert.equal(e.vars.澄湾待确认提交, null);
    assert.equal(e.runtime.view.error, '');
    assert.deepEqual(e.vars.澄湾排队操作, []);
  });
});

test('审查修复：正文写入后的失败记录重载仍可恢复，取消也只确认保存', async () => {
  for (const action of ['retry', 'discardPending']) {
    await withEnv(async e => {
      let failed = false;
      SillyTavern.saveChat = async () => {
        if (!failed && e.messages[2]?.data?.stat_data?._系统?.楼层id === 2) {
          failed = true;
          throw Error('模拟保存失败');
        }
      };
      await assert.rejects(e.runtime.send('重载恢复检查'), /保存失败/);
      const id = e.vars.澄湾待更新正文.id;
      const saved = copy(e.messages[2].data);
      await e.runtime.dispose();
      e.runtime = createRuntime();
      await e.runtime.start();
      assert.equal(e.vars.澄湾待更新正文.id, id);
      await e.runtime[action]();
      assert.equal(e.calls.length, 2);
      assert.deepEqual(e.messages[2].data, saved);
      assert.equal(e.messages.length, 3);
      assert.equal(e.vars.澄湾待更新正文, null);
      assert.equal(e.vars.澄湾待确认提交, null);
    });
  }
});

test('审查修复：孤立正文恢复原操作与用量，拒绝多扣及缺事件后允许正确提交', async () => {
  const initial = seed();
  initial.玩家.物品栏.water = Schema.parse({ 玩家: { 物品栏: { water: { 类别: '消耗品', 数量: 3 } } } }).玩家.物品栏.water;
  await withEnv(async e => {
    e.story = async () => '喝了一瓶矿泉水。';
    e.update = async () => { throw Error('模拟变量网络失败'); };
    await assert.rejects(e.runtime.send('喝一瓶水', true, { itemId: 'water', amount: 1 }), /网络失败/);
    const id = e.vars.澄湾待更新正文.id;
    await e.runtime.dispose();
    delete e.vars.澄湾待更新正文;
    e.runtime = createRuntime();
    await e.runtime.start();
    assert.equal(e.vars.澄湾待更新正文.id, id);
    assert.deepEqual(e.vars.澄湾待更新正文.intent, { itemId: 'water', amount: 1 });
    e.update = async () => block([patch('/玩家/物品栏/water/数量', 1)]);
    await assert.rejects(e.runtime.retry(), /消耗数量/);
    assert.equal(e.state().玩家.物品栏.water.数量, 3);
    e.update = async () => block([patch('/玩家/物品栏/water/数量', 2)]);
    await assert.rejects(e.runtime.retry(), /物品消耗缺少关联/);
    assert.equal(e.state().玩家.物品栏.water.数量, 3);
    e.update = async () => block([
      patch('/玩家/物品栏/water/数量', 2),
      { op: 'add', path: '/事件/drink', value: { 事实: '喝了一瓶矿泉水', 关联记录id: ['water'] } },
    ]);
    await e.runtime.retry();
    assert.equal(e.state().玩家.物品栏.water.数量, 2);
    assert.equal(e.state().事件.drink.事实, '喝了一瓶矿泉水');
    assert(e.state()._系统.提交记录[id]);
    assert.deepEqual(e.vars.澄湾排队操作, []);
    assert.equal(e.calls.filter(call => call.kind === 'story').length, 1);
  }, initial);
});

test('审查修复：孤立继续正文不重复继承上一已结算轮的物品用量', async () => {
  const initial = seed();
  initial.玩家.物品栏.water = Schema.parse({ 玩家: { 物品栏: { water: { 类别: '消耗品', 数量: 4 } } } }).玩家.物品栏.water;
  await withEnv(async e => {
    e.story = async () => '先喝了一瓶水。';
    e.update = async () => block([
      patch('/玩家/物品栏/water/数量', 3),
      { op: 'add', path: '/事件/drink1', value: { 事实: '喝了一瓶水', 关联记录id: ['water'] } },
    ]);
    await e.runtime.send('喝一瓶水', true, { itemId: 'water', amount: 1 });
    e.story = async () => '接下来的活动又消耗了两瓶水。';
    e.update = async () => { throw Error('模拟继续变量失败'); };
    await assert.rejects(e.runtime.messageAction('continue', 2), /变量失败/);
    await e.runtime.dispose();
    delete e.vars.澄湾待更新正文;
    e.runtime = createRuntime();
    await e.runtime.start();
    assert.equal(e.vars.澄湾待更新正文.replyFloor, 3);
    assert.equal(e.vars.澄湾待更新正文.intent, undefined);
    e.update = async () => block([
      patch('/玩家/物品栏/water/数量', 1),
      { op: 'add', path: '/事件/drink2', value: { 事实: '后续活动消耗两瓶水', 关联记录id: ['water'] } },
    ]);
    await e.runtime.retry();
    assert.equal(e.state().玩家.物品栏.water.数量, 1);
    assert.equal(e.messages.length, 4);
  }, initial);
});

test('审查修复：未提交初始状态和已结算合法候选可用，错编号候选阻断后续请求', async () => {
  await withEnv(async e => {
    assert.equal(activeContext().floor, 0);
    e.update = async () => block([patch('/玩家/年龄', 23)]);
    await e.runtime.send('建立合法候选');
    const assistant = e.messages[2];
    assistant.swipes = [assistant.message, '第二个已有候选'];
    assistant.swipes_data = [copy(assistant.data), copy(assistant.data)];
    assistant.swipe_id = 1;
    assistant.message = assistant.swipes[1];
    assistant.data = copy(assistant.swipes_data[1]);
    e.listeners.get('swipe')(2);
    await turn(); await turn();
    assert.throws(activeContext, /所选候选的变量属于其他候选/);
    await assert.rejects(e.runtime.send('错候选后继续'), /所选候选的变量属于其他候选/);
    await assert.rejects(e.runtime.phoneAction({ kind: 'refresh', platform: '邻信', text: 'chats' }), /所选候选的变量属于其他候选/);
    assert.equal(e.calls.length, 2);
    assert.equal(e.messages.length, 3);
    assistant.data.stat_data._系统.候选回复id = '1';
    assistant.data.stat_data._系统.分支id = `${e.chat}:2:1`;
    assistant.swipes_data[1] = copy(assistant.data);
    e.listeners.get('swipe')(2);
    await turn(); await turn();
    assert.equal(activeContext().swipe, 1);
    e.update = async () => block([]);
    await e.runtime.send('合法候选后继续');
    assert.equal(activeContext().floor, 4);
    assert.equal(e.messages[4].extra.cw_story_settlements['0'].baseSwipe, 1);
  });
});

test('审查修复：在错编号候选重载仍保留服务，切回合法候选后可继续', async () => {
  const { taskPresentation } = require(root + '/界面/桌面端/utils/task-presentation.ts');
  await withEnv(async e => {
    await e.runtime.send('第一轮');
    const assistant = e.messages[2];
    assistant.swipes = [assistant.message, '复制状态的旧候选'];
    assistant.swipes_data = [copy(assistant.data), copy(assistant.data)];
    assistant.swipe_id = 1;
    assistant.message = assistant.swipes[1];
    await e.runtime.dispose();
    e.runtime = createRuntime();
    await e.runtime.start();
    assert.equal(e.runtime.view.readOnly, false);
    assert.match(e.runtime.view.error, /所选候选的变量属于其他候选/);
    assert.equal(taskPresentation(e.runtime.view).locked, true);
    await assert.rejects(e.runtime.send('错误候选'), /所选候选/);
    assert.equal(e.calls.length, 2);
    assistant.swipe_id = 0;
    assistant.message = assistant.swipes[0];
    assistant.data = copy(assistant.swipes_data[0]);
    e.listeners.get('swipe')(2);
    await turn(); await turn();
    assert.equal(e.runtime.view.error, '');
    assert.equal(taskPresentation(e.runtime.view).locked, false);
    await e.runtime.send('切回正确候选后继续');
    assert.equal(activeContext().floor, 4);
    assert.equal(e.calls.length, 4);
  });
});

test('审查修复：候选恢复只清对应错误，不清同文案的普通请求错误', async () => {
  const { taskPresentation } = require(root + '/界面/桌面端/utils/task-presentation.ts');
  await withEnv(async e => {
    const message = '所选候选的变量属于其他候选，请返回已结算候选或重新生成';
    e.update = async () => { throw Error(message); };
    await assert.rejects(e.runtime.send('请求错误保留检查'), new RegExp(message));
    e.runtime.refresh();
    assert.equal(e.runtime.view.error, 'Error: ' + message);
    assert.equal(taskPresentation(e.runtime.view).locked, true);
    assert(e.vars.澄湾待更新正文);
  });
});

function librarySeed() {
  const s = seed();
  s.角色.npc = Schema.parse({ 角色: { npc: {
    层级: '主要', 姓名: '联系人', 简介: '关闭前最新资料-SNAPSHOT_ONLY', 当前地点id: 'cafe',
    关系网: { player: { 姓名: '测试玩家', 关系: '老友', 信任度: 78 } },
    经历: { 最近经历: { latest: { 经历: '刚刚共同完成的事-SNAPSHOT_ONLY' } } },
    _管理: { 来源档案id: 'src', 升格: true, 版本: 7 },
    _更新循环: { 当前计数: 8, 待处理任务id: 'oldTask' },
  } } }).角色.npc;
  s._系统.来源档案 = Schema.parse({ _系统: { 来源档案: {
    src: { 人物id: 'npc', 原始快照JSON: '来源快照-SOURCE_ONLY' },
  } } })._系统.来源档案;
  s._系统.任务 = Schema.parse({ _系统: { 任务: { oldTask: {
    类别: '自然融入', 目标id: ['npc'], 目标版本: { npc: 7 }, 候选结果JSON: '迟到整份候选-PAYLOAD_ONLY',
  } } } })._系统.任务;
  s.手机.账号.npc.简介 = '账号完整资料-ACCOUNT_ONLY';
  s.手机.原文.帖子 = Schema.parse({ 手机: { 原文: { 帖子: { post: {
    发布账号id: 'npc', 内容块: [{ id: 'block', 类型: '文字', 正文: '保留本人已发表内容' }], 可见范围: '公开',
  } } } } }).手机.原文.帖子;
  s.角色.remote.关系网.npc = copy(s.角色.npc.关系网.player);
  s.约定 = Schema.parse({ 约定: { meet: { 参与者: { npc: {}, player: {} } } } }).约定;
  s.世界.当前场景.在场人物 = ['npc', 'remote'];
  return s;
}

test('旧角色包与停用快照可移除籍贯并保留身份、负信任和原始来源', async () => {
  const source = { id: 'legacy', 层级: '次要', 姓名: '旧人物', 身份: '教师', 籍贯: '旧字段',
    关系网: { player: { 信任度: -45 } } };
  const before = JSON.stringify(source);
  const imported = parseAndValidateCharacterJson(source);
  assert.equal(imported.success, true, imported.error);
  assert(!Object.hasOwn(imported.mappedCharacter, '籍贯'));
  assert.equal(imported.mappedCharacter.身份, '教师');
  assert.equal(imported.mappedCharacter.关系网.player.信任度, -45);
  assert.equal(JSON.stringify(source), before);
  await withEnv(async e => {
    await e.runtime.manageCharacters({ kind: 'enabled', ids: ['npc'], enabled: false });
    const [snapshotKey, snapshot] = Object.entries(e.vars.澄湾角色库.snapshots).find(([, row]) => row.id === 'npc');
    snapshot.pack.角色.籍贯 = '旧字段';
    delete snapshot.pack.角色.种族;
    delete snapshot.pack.角色.当前形态;
    const preserved = JSON.stringify(snapshot.pack);
    await e.runtime.manageCharacters({ kind: 'enabled', ids: ['npc'], enabled: true });
    assert(!Object.hasOwn(e.state().角色.npc, '籍贯'));
    assert.equal(e.state().角色.npc.种族, null);
    assert.equal(e.state().角色.npc.当前形态, null);
    assert.equal(JSON.stringify(e.vars.澄湾角色库.snapshots[snapshotKey].pack), preserved);
    assert.equal(e.calls.length, 0);
  }, librarySeed());
});

test('角色库：关闭完整快照、共享历史、原ID恢复与新运行版本', async () => {
  await withEnv(async e => {
    const before = copy(e.state());
    await e.runtime.manageCharacters({ kind: 'enabled', ids: ['npc'], enabled: false });
    const closed = e.state(), library = e.vars.澄湾角色库;
    assert(!closed.角色.npc);
    assert(!JSON.stringify(closed).includes('SNAPSHOT_ONLY'));
    assert(!JSON.stringify(closed).includes('SOURCE_ONLY'));
    assert(!JSON.stringify(closed).includes('PAYLOAD_ONLY'));
    assert(!JSON.stringify(closed).includes('ACCOUNT_ONLY'));
    assert(JSON.stringify(library).includes('SNAPSHOT_ONLY'));
    assert.deepEqual(closed.手机.原文, before.手机.原文);
    assert.deepEqual(closed.角色.remote, before.角色.remote);
    assert.deepEqual(closed.约定, before.约定);
    assert.equal(closed._系统.任务.oldTask.状态, '失效');
    assert(!pendingUpdateTasks(closed).includes('oldTask'));
    assert(!JSON.stringify(withUpdateTasks({ injects: [] }, closed, ['oldTask'])).includes('SOURCE_ONLY'));
    assert.equal(e.runtime.view.characterLibrary.meta.npc.enabled, false);
    assert.equal(e.runtime.exportManagedCharacter('npc').角色.简介, before.角色.npc.简介);
    await e.runtime.manageCharacters({ kind: 'enabled', ids: ['npc'], enabled: true });
    const restored = e.state().角色.npc;
    assert.deepEqual(restored.关系网, before.角色.npc.关系网);
    assert.deepEqual(restored.经历, before.角色.npc.经历);
    assert.equal(restored.当前地点id, 'cafe');
    assert.equal(restored._管理.版本, 9);
    assert.equal(restored._管理.来源档案id, null);
    assert.equal(restored._管理.升格, false);
    assert.equal(restored._更新循环.待处理任务id, null);
    assert.deepEqual(e.state().手机, before.手机);
    assert.equal(e.state()._系统.任务.oldTask.状态, '失效');
    assert.equal(Object.keys(e.state().角色).length, 2);
    assert.equal(e.calls.length, 0);
  }, librarySeed());
});

test('角色库：分类排序、筛选排序、升格、删除分类和重载保持独立', async () => {
  await withEnv(async e => {
    const original = copy(e.state().角色);
    const categoryId = (await e.runtime.manageCharacters({ kind: 'create', name: '好友' })).created.id;
    await e.runtime.manageCharacters({ kind: 'move', id: 'npc', categoryId });
    await e.runtime.manageCharacters({ kind: 'move', id: 'remote', categoryId, index: 0 });
    await e.runtime.manageCharacters({ kind: 'rename', categoryId, name: '城中好友' });
    await e.runtime.manageCharacters({ kind: 'categories', ids: [categoryId, 'uncategorized'] });
    await e.runtime.manageCharacters({ kind: 'order', categoryId, ids: ['npc', 'remote'] });
    assert.deepEqual(e.state().角色, original);
    const meta = copy(e.runtime.view.characterLibrary.meta);
    await e.runtime.commit(s => { s.角色.npc.层级 = '主要'; });
    assert.deepEqual(e.runtime.view.characterLibrary.meta, meta);
    await e.runtime.dispose(); e.runtime = createRuntime(); await e.runtime.start();
    assert.equal(e.runtime.view.characterLibrary.categories[0].name, '城中好友');
    assert.deepEqual(e.runtime.view.characterLibrary.meta, meta);
    await e.runtime.manageCharacters({ kind: 'enabled', ids: ['npc'], enabled: false, categoryId });
    await e.runtime.manageCharacters({ kind: 'delete', categoryId });
    assert.equal(e.runtime.view.characterLibrary.meta.npc.enabled, false);
    assert.equal(e.runtime.view.characterLibrary.meta.npc.categoryId, 'uncategorized');
    assert.equal(e.runtime.view.characterLibrary.meta.remote.enabled, true);
  });
});

test('角色库：快照保存失败不删除，活动保存失败回滚，重载后重试整批确认', async () => {
  await withEnv(async e => {
    const original = copy(e.state());
    SillyTavern.saveChat = async () => { throw Error('快照磁盘保存失败'); };
    await assert.rejects(e.runtime.manageCharacters({ kind: 'enabled', ids: ['npc', 'remote'], enabled: false }), /快照磁盘/);
    assert.deepEqual(e.state(), original);
    assert(e.state().角色.npc);
    assert.equal(e.runtime.view.characterLibrary.meta.npc.enabled, true);
    SillyTavern.saveChat = async () => { if (!e.messages[0].data.stat_data.角色.npc) throw Error('活动变量保存失败'); };
    await assert.rejects(e.runtime.manageCharacters({ kind: 'enabled', ids: ['npc', 'remote'], enabled: false }), /活动变量/);
    assert.deepEqual(e.state(), original);
    assert(e.vars.澄湾待确认提交.rollbackOnFailure);
    assert.equal(e.runtime.view.managementPending, true);
    await e.runtime.dispose(); e.runtime = createRuntime(); await e.runtime.start();
    SillyTavern.saveChat = async () => {};
    await e.runtime.retry();
    assert.equal(Object.keys(e.runtime.view.data.角色).length, 0);
    assert.equal(e.runtime.view.characterLibrary.meta.npc.enabled, false);
    assert.equal(e.vars.澄湾待确认提交, null);
    assert.equal(e.calls.length, 0);
  });
});

test('角色库：恢复失败保留快照和关闭状态，批量中一人失败不部分恢复', async () => {
  await withEnv(async e => {
    await e.runtime.manageCharacters({ kind: 'enabled', ids: ['npc', 'remote'], enabled: false });
    const original = copy(e.state());
    const pointer = e.state()._系统.角色库版本;
    const snapshot = e.vars.澄湾角色库.revisions[pointer].disabled.remote;
    e.vars.澄湾角色库.snapshots[snapshot].pack.角色.简介 = { invalid: true };
    await assert.rejects(e.runtime.manageCharacters({ kind: 'enabled', ids: ['npc', 'remote'], enabled: true }));
    assert.deepEqual(e.state(), original);
    assert(e.vars.澄湾角色库.snapshots[snapshot]);
  });
});

test('角色库：重复点击与生成期间启停受控拒绝，迟到结果不覆盖新分支', async () => {
  await withEnv(async e => {
    const first = e.runtime.manageCharacters({ kind: 'enabled', ids: ['npc'], enabled: false });
    assert.throws(() => e.runtime.manageCharacters({ kind: 'enabled', ids: ['npc'], enabled: false }), /正在生成/);
    await first;
    const count = Object.keys(e.vars.澄湾角色库.snapshots).length;
    await e.runtime.manageCharacters({ kind: 'enabled', ids: ['npc'], enabled: false });
    assert.equal(Object.keys(e.vars.澄湾角色库.snapshots).length, count);
    const delayed = deferred(); e.story = () => delayed.promise;
    const sending = e.runtime.send('等待测试'); await until(() => e.calls.length === 1);
    assert.throws(() => e.runtime.manageCharacters({ kind: 'enabled', ids: ['npc'], enabled: true }), /正在生成/);
    e.runtime.stop(); delayed.resolve('迟到回复'); await assert.rejects(sending);
    assert(!e.state().角色.npc);
  });
});

test('角色库：回退、候选和复制分支只恢复对应版本，缺失快照不跨分支兜底', () => {
  const original = librarySeed(); original._系统.存档id = 'save';
  const a = prepareLibraryCommand(original, undefined, { kind: 'enabled', ids: ['npc'], enabled: false });
  const alternate = copy(original); alternate.角色.npc.简介 = '另一候选的资料';
  const b = prepareLibraryCommand(alternate, a.library, { kind: 'enabled', ids: ['npc'], enabled: false });
  const restoreA = prepareLibraryCommand(a.state, b.library, { kind: 'enabled', ids: ['npc'], enabled: true });
  const restoreB = prepareLibraryCommand(b.state, b.library, { kind: 'enabled', ids: ['npc'], enabled: true });
  assert.equal(restoreA.state.角色.npc.简介, original.角色.npc.简介);
  assert.equal(restoreB.state.角色.npc.简介, '另一候选的资料');
  assert.equal(libraryView(original, b.library).meta.npc.enabled, true);
  const branched = copy(a.state); branched._系统.分支id = 'copied-chat:0:0';
  assert.equal(prepareLibraryCommand(branched, b.library, { kind: 'enabled', ids: ['npc'], enabled: true }).state.角色.npc.简介, original.角色.npc.简介);
  assert.throws(() => libraryView(a.state, LibrarySchema.parse({})), /版本缺失/);
});

test('角色库：模型重建、同名换ID、账号资料、手机新活动和约定自动结算被拒绝', () => {
  const before = prepareLibraryCommand(librarySeed(), undefined, { kind: 'enabled', ids: ['npc'], enabled: false }).state;
  for (const mutate of [
    s => { s.角色.npc = librarySeed().角色.npc; },
    s => { s.角色.alias = Schema.parse({ 角色: { alias: { 姓名: '联系人', 层级: '次要' } } }).角色.alias; },
    s => { s.手机.账号.npc.简介 = '恢复新资料'; },
    s => { s.手机.原文.帖子.new = copy(s.手机.原文.帖子.post); },
    s => { delete s.手机.原文.帖子.post; },
    s => { delete s.角色.remote.关系网.npc; },
    s => { s.世界.当前场景.在场人物.push('npc'); },
    s => { delete s.约定.meet; },
  ]) {
    const after = copy(before); mutate(after); assert.throws(() => validateModel(before, after));
  }
});

function automaticRosterSeed() {
  const state = seed();
  state.角色 = Schema.parse({ 角色: Object.fromEntries(['主要', '次要'].flatMap((tier, group) =>
    Array.from({ length: group ? 20 : 30 }, (_, i) => {
      const id = `${group ? 'n' : 'm'}${String(i).padStart(2, '0')}`;
      return [id, { 姓名: '轮换人物_' + id, 层级: tier, 简介: 'ROSTER_PRIVATE_' + id }];
    }))) }).角色;
  state.手机.账号.npc.人物id = 'n19';
  state.手机.账号.npc.简介 = 'PHONE_PROFILE_n19';
  return state;
}
const automaticSettings = () => ({ characterAuto: true, variable: endpoint('variable'), phone: endpoint('phone') });

test('自动调度：自定义6+3预算与3+2每轮轮换传入宿主，正文、变量及手机最终请求保持隔离', async () => {
  const options = { majorLimit: 6, minorLimit: 3, majorRotation: 3, minorRotation: 2 };
  await withEnv(async e => {
    const rosters = [];
    const capture = config => {
      const people = e.state().角色;
      assert.equal(Object.values(people).filter(p => p.层级 === '主要').length, 6);
      assert.equal(Object.values(people).filter(p => p.层级 === '次要').length, 3);
      const extra = !!config.custom_api;
      const injected = config.ordered_prompts?.filter(p => typeof p === 'object') ?? config.overrides?.chat_history?.prompts ?? config.injects ?? [];
      const messages = [...injected.map(p => ({ role: p.role, content: p.content })),
        { role: 'system', content: `<status_current_variable>${JSON.stringify(e.state())}</status_current_variable>` },
        { role: 'user', content: config.user_input }];
      e.listeners.get('completion_settings')({ messages });
      const text = JSON.stringify(messages);
      const revision = e.vars.澄湾角色库.revisions[e.state()._系统.角色库版本];
      for (const id of Object.keys(revision.disabled)) assert(!text.includes('ROSTER_PRIVATE_' + id), id);
      assert(!text.includes('characterRoster')); assert(!text.includes('majorRotation'));
      assert(!text.includes('rotationIds')); assert(!text.includes('snapshots'));
      assert.equal((text.match(/<status_current_variable>/g) ?? []).length, extra ? 0 : 1);
      assert.equal(text.split('玩家暂时关闭的人物（只供历史身份识别）').length - 1, 1, '关闭名单在实际最终请求里不重复注入');
      if (!extra) rosters.push(Object.keys(people));
    };
    e.story = async config => { capture(config); return '本轮只是观察环境。'; };
    e.update = async config => { capture(config); return lifeCheckedBlock(e.state()); };
    await e.runtime.send('观察环境');
    await e.runtime.send('继续观察环境');
    assert.equal(rosters[1].filter(id => id.startsWith('m') && !rosters[0].includes(id)).length, 3);
    assert.equal(rosters[1].filter(id => id.startsWith('n') && !rosters[0].includes(id)).length, 2);
    await e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '联系一下' });
    assert(e.state().角色.n19);
    assert.equal(e.calls.length, 5, '没有额外选人 API');
  }, automaticRosterSeed(), { ...automaticSettings(), characterRoster: options });
});

test('自动调度：正文、变量和手机最终请求均为6+3，关闭完整档案与队列不泄漏', async () => {
  await withEnv(async e => {
    const final = [];
    const capture = config => {
      const extra = !!config.custom_api;
      const injected = config.ordered_prompts?.filter(p => typeof p === 'object') ?? config.overrides?.chat_history?.prompts ?? config.injects ?? [];
      const messages = [...injected.map(p => ({ role: p.role, content: p.content })),
        { role: 'system', content: `<status_current_variable>${JSON.stringify(e.state())}</status_current_variable>` },
        { role: 'user', content: config.user_input }];
      e.listeners.get('completion_settings')({ messages });
      const text = JSON.stringify(messages), people = Object.values(e.state().角色);
      assert.equal(people.filter(p => p.层级 === '主要').length, 6);
      assert.equal(people.filter(p => p.层级 === '次要').length, 3);
      const library = LibrarySchema.parse(e.vars.澄湾角色库);
      const revision = library.revisions[e.state()._系统.角色库版本];
      for (const id of Object.keys(revision.disabled)) assert(!text.includes('ROSTER_PRIVATE_' + id), id);
      for (const id of Object.keys(e.state().角色)) assert(text.includes('ROSTER_PRIVATE_' + id), id);
      assert(!text.includes('manualOff')); assert(!text.includes('snapshots')); assert(!text.includes('澄湾角色库'));
      assert.equal((text.match(/<status_current_variable>/g) ?? []).length, extra ? 0 : 1);
      final.push(extra ? config.custom_api.model : 'story');
    };
    e.story = async config => { capture(config); return '玩家观察了当前环境，未与远处人物互动。'; };
    e.update = async config => { capture(config); return lifeCheckedBlock(e.state()); };
    await e.runtime.send('观察环境');
    const roster = e.vars.澄湾角色库.revisions[e.state()._系统.角色库版本].automatic;
    assert.equal(Object.keys(roster.checks).length, 9);
    assert(Object.values(roster.checks).every(id => e.state()._系统.任务[id].状态 === '已提交'));
    assert(!e.state().角色.n19);
    await e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '你好' });
    assert(e.state().角色.n19);
    assert.deepEqual(final, ['story', 'variable', 'phone']);
    assert.equal(Object.keys(e.runtime.view.characterLibrary.characters).length, 50);
  }, automaticRosterSeed(), automaticSettings());
});

test('自动调度：正文失败重试不重复轮换或复制快照，检查成功后才获得轮换机会', async () => {
  await withEnv(async e => {
    e.story = async () => { throw Error('正文暂时失败'); };
    await assert.rejects(e.runtime.send('观察环境'), /正文暂时失败/);
    const library = e.vars.澄湾角色库;
    const snapshotCount = Object.keys(library.snapshots).length;
    const roster = copy(library.revisions[e.state()._系统.角色库版本].automatic);
    assert(Object.values(roster.rotation).every(id => e.state()._系统.任务[id].状态 === '排队'));
    e.story = async () => '本轮没有特殊事件。'; e.update = async () => lifeCheckedBlock(e.state());
    await e.runtime.retry();
    assert.equal(Object.keys(e.vars.澄湾角色库.snapshots).length, snapshotCount);
    assert(Object.values(roster.rotation).every(id => e.state()._系统.任务[id].状态 === '已提交'));
    assert.deepEqual(e.calls.map(c => c.config.custom_api?.model ?? 'main'), ['main', 'main', 'variable']);
    assert.equal(e.messages.length, 3);
  }, automaticRosterSeed(), automaticSettings());
});

test('自动调度：活动名单保存失败回滚，快照仍可恢复，重试后再发模型请求', async () => {
  await withEnv(async e => {
    const original = copy(e.state());
    SillyTavern.saveChat = async () => { if (!e.messages[0].data.stat_data.角色.m29) throw Error('自动名单保存失败'); };
    await assert.rejects(e.runtime.send('观察环境'), /自动名单保存失败/);
    assert.deepEqual(e.state(), original);
    assert.equal(e.calls.length, 0);
    assert(e.vars.澄湾待确认提交.rollbackOnFailure);
    SillyTavern.saveChat = async () => {};
    await e.runtime.retry();
    assert.equal(Object.values(e.state().角色).filter(p => p.层级 === '主要').length, 6);
    assert.equal(Object.values(e.state().角色).filter(p => p.层级 === '次要').length, 3);
    assert.equal(e.vars.澄湾待确认提交, null);
    assert.equal(e.calls.length, 2);
    assert.deepEqual(e.messages.filter(m => m.role === 'user').map(m => m.message), ['观察环境']);
  }, automaticRosterSeed(), automaticSettings());
});

test('自动调度：手机操作前名单保存失败，重试先恢复名单且只发送一次手机消息', async () => {
  await withEnv(async e => {
    const original = copy(e.state());
    SillyTavern.saveChat = async () => { if (!e.messages[0].data.stat_data.角色.m29) throw Error('自动名单保存失败'); };
    await assert.rejects(e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '轮换后的问候' }), /自动名单保存失败/);
    assert.deepEqual(e.state(), original);
    assert.equal(e.calls.length, 0);
    assert(e.vars.澄湾待确认提交.rollbackOnFailure);
    SillyTavern.saveChat = async () => {};
    await e.runtime.retry();
    assert.equal(e.calls.length, 1);
    assert.equal(e.calls[0].config.custom_api.model, 'phone');
    assert(e.state().角色.n19, '联系人在请求前开启');
    assert.equal(e.vars.澄湾待确认提交, null);
    const sent = Object.values(e.state().手机.原文.消息).filter(m => JSON.stringify(m.内容块).includes('轮换后的问候'));
    assert.equal(sent.length, 1);
    assert.equal(e.messages.length, 1, '手机互动不新增正文楼层');
  }, automaticRosterSeed(), automaticSettings());
});

test('角色库：100人仅10人开启，正文/变量/手机最终构造均无关闭快照及来源载荷', async () => {
  const s = seed(); s.角色 = {};
  for (let i = 0; i < 100; i++) {
    s.角色['npc' + i] = Schema.parse({ 角色: { a: { 层级: '主要', 姓名: '测试' + i, 简介: `PROFILE_${i}_SECRET ` + '专属资料'.repeat(100), _管理: { 来源档案id: 'source' + i } } } }).角色.a;
    s._系统.来源档案['source' + i] = Schema.parse({ _系统: { 来源档案: { a: { 人物id: 'npc' + i, 原始快照JSON: 'SOURCE_' + i + '_SECRET' } } } })._系统.来源档案.a;
  }
  await withEnv(async e => {
    const beforeBytes = JSON.stringify(e.state().角色).length;
    await e.runtime.manageCharacters({ kind: 'enabled', ids: Array.from({ length: 90 }, (_, i) => 'npc' + (i + 10)), enabled: false });
    const afterBytes = JSON.stringify(e.state().角色).length;
    assert.equal(Object.keys(e.state().角色).length, 10);
    assert.equal(Object.keys(e.runtime.view.characterLibrary.characters).length, 100);
    const final = [];
    const capture = config => {
      const extra = !!config.custom_api;
      const injected = config.ordered_prompts?.filter(p => typeof p === 'object') ?? config.overrides?.chat_history?.prompts ?? config.injects ?? [];
      const messages = [...injected.map(p => ({ role: p.role, content: p.content })),
        { role: 'system', content: `<status_current_variable>${JSON.stringify(e.state())}</status_current_variable>` },
        { role: 'user', content: config.user_input }];
      e.listeners.get('completion_settings')({ messages });
      const text = JSON.stringify(messages);
      assert(!text.includes('澄湾角色库'));
      assert(!text.includes('角色库版本'));
      for (let i = 10; i < 100; i++) {
        assert(!text.includes('PROFILE_' + i + '_SECRET'));
        assert(!text.includes('SOURCE_' + i + '_SECRET'));
      }
      for (let i = 0; i < 10; i++) assert(text.includes('PROFILE_' + i + '_SECRET'));
      assert.equal((text.match(/<status_current_variable>/g) ?? []).length, extra ? 0 : 1);
      assert(!text.includes('[chengwan-'));
      final.push({ channel: extra ? config.custom_api.model : 'story', characters: text.length });
    };
    e.story = async config => { capture(config); return '只观察当前环境'; };
    e.update = async config => { capture(config); return block([]); };
    await e.runtime.send('观察周围');
    await e.runtime.phoneAction({ kind: 'refresh', platform: '邻信' });
    assert.deepEqual(final.map(f => f.channel), ['story', 'variable', 'phone']);
    console.info('[角色库上下文证据：本地最终请求构造]', JSON.stringify({ beforeProfiles: 100, afterProfiles: 10, beforeBytes, afterBytes, final }));
  }, s);
});

// 报告中的原请求已取消，原始补丁不可恢复；按同一失败路径构造脱敏模型回显。
const incidentReplyId = 'phone_2a3f789e-4b21-4d10-85f2-901a88c42b10';
const incidentText = '十点见，我先整理借阅登记。到时候一起看看工坊旧日志。';
function incidentPhonePatch(draft) {
  const sent = Object.values(draft.手机.原文.消息).find(message => message.发送账号id === 'me');
  return block([{ op: 'add', path: '/手机/原文/消息/' + incidentReplyId, value: {
    会话id: 'chat', 发送账号id: 'npc', 发送者称呼: '联系人', 故事时间: time(1),
    内容块: [{ 类型: '文字', id: 'incident-reply-block', 正文: '好的，十点见。' }],
    回复目标消息id: Object.keys(draft.手机.原文.消息).find(id => draft.手机.原文.消息[id] === sent),
    _顺序: sent._顺序 + 1, _发送状态: '已投递', _已投递账号id: ['me'],
  } }, patch('/世界/当前时间', time(1))]);
}

test('20261003邻信失败：新回复回显只读序号，脚本重算而只提交一次', async () => {
  await withEnv(async e => {
    e.update = async () => {
      const draft = e.vars.澄湾待更新手机.draft;
      const rawReply = incidentPhonePatch(draft);
      const unsafe = copy(draft);
      unsafe.手机.原文.消息[incidentReplyId] = copy(updateBlock(rawReply).commands[0].value);
      assert.throws(() => validateModel(draft, unsafe), new RegExp('新记录包含非默认脚本管理字段：/手机/原文/消息/' + incidentReplyId + '/_顺序'));
      console.info('[20261003脱敏构造复现]', JSON.stringify({
        source: '构造而非原历史模型响应', action: { kind: 'send', id: 'chat', text: incidentText },
        patch: updateBlock(rawReply).commands, draft: draft.手机.原文.消息, candidate: unsafe.手机.原文.消息,
      }));
      return rawReply;
    };
    await e.runtime.phoneAction({ kind: 'send', id: 'chat', text: incidentText });
    const s = e.state();
    assert.equal(Object.values(s.手机.原文.消息).filter(m => m.发送账号id === 'me').length, 1);
    assert.equal(s.手机.原文.消息[incidentReplyId]._顺序, 2);
    assert.deepEqual(s.手机.原文.消息[incidentReplyId]._已投递账号id, ['me']);
    assert.equal(Object.keys(s.手机._通知).length, 1);
    assert.equal(Object.keys(s._系统.已计轮事件).length, 1);
    assert.equal(e.calls.length, 1);
    assert.equal(e.vars.澄湾待更新手机, null);
  });
});

test('20261003手机保存前失败：恢复同一候选，不重跑模型或重复派生投递', async () => {
  await withEnv(async e => {
    e.update = async () => block([{ op: 'add', path: '/手机/原文/消息/reply', value: {
      会话id: 'chat', 发送账号id: 'npc', 故事时间: time(0),
      内容块: [{ 类型: '文字', id: 'save-reply', 正文: '收到' }],
    } }]);
    const originalJournal = e.runtime.service.host.journal;
    let fail = true;
    e.runtime.service.host.journal = async value => {
      if (value && fail) { fail = false; throw Error('模拟手机提交前日志保存失败'); }
      return originalJournal(value);
    };
    await assert.rejects(e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '恢复同一结果' }), /日志保存失败/);
    assert.equal(e.runtime.view.busy, false);
    assert(e.vars.澄湾待更新手机.candidate, '已校验候选应留在恢复记录');
    const candidate = copy(e.vars.澄湾待更新手机.candidate);
    e.update = async () => { throw Error('不得重复调用手机模型'); };
    await e.runtime.retry();
    assert.equal(e.calls.length, 1);
    assert.deepEqual(e.state().手机, candidate.手机);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
    assert.equal(e.runtime.view.updating, false);
  });
});

test('20261003手机停止：日志保存期间停止，迟到提交不写入楼层', async () => {
  await withEnv(async e => {
    const journal = deferred(), originalJournal = e.runtime.service.host.journal;
    let reached = false;
    e.runtime.service.host.journal = async value => {
      if (value) { reached = true; await journal.promise; }
      return originalJournal(value);
    };
    const original = copy(e.state());
    const sending = e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '停止检查' });
    await until(() => reached);
    e.runtime.stop();
    assert.equal(e.runtime.view.busy, true, '等待旧请求退出前保持锁定');
    journal.resolve();
    await assert.rejects(sending, /取消|停止/);
    assert.deepEqual(e.messages[0].data.stat_data, original);
    assert.equal(e.runtime.view.busy, false);
    assert.equal(e.vars.澄湾待更新手机, null);
    assert.equal(e.vars.澄湾待确认提交, null);
  });
});

test('20261003手机停止：首次恢复记录保存期间停止，不保留可误重试的操作', async () => {
  await withEnv(async e => {
    const firstSave = deferred(), originalSave = global.SillyTavern.saveChat;
    let reached = false;
    global.SillyTavern.saveChat = async () => {
      if (!reached && e.vars.澄湾待更新手机) { reached = true; await firstSave.promise; }
      return originalSave();
    };
    const before = copy(e.state());
    const sending = e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '初始保存时停止' });
    await until(() => reached);
    e.runtime.stop();
    assert.equal(e.runtime.view.busy, true);
    firstSave.resolve();
    await assert.rejects(sending, /取消|变化/);
    assert.deepEqual(e.state(), before);
    assert.equal(e.calls.length, 0);
    assert.equal(e.vars.澄湾待更新手机, null);
    assert.equal(e.runtime.view.phoneRequest, null);
    assert.equal(e.runtime.view.busy, false);
  });
});

test('20261003手机原回复保存失败：重试保留同一响应，不重新请求模型', async () => {
  await withEnv(async e => {
    let failed = false;
    const originalSave = global.SillyTavern.saveChat;
    global.SillyTavern.saveChat = async () => {
      const p = e.vars.澄湾待更新手机;
      if (!failed && p?.reply && !p.candidate) { failed = true; throw Error('原回复保存失败'); }
      return originalSave();
    };
    e.update = async () => block([patch('/世界/当前时间', time(1))]);
    await assert.rejects(e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '保留原回复' }), /原回复保存失败/);
    assert(e.vars.澄湾待更新手机.reply);
    assert.equal(e.runtime.view.phoneRequest.status, 'failed');
    await e.runtime.retry();
    assert.equal(e.calls.length, 1);
    assert.equal(Object.keys(e.state().手机.原文.消息).length, 1);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
    assert.equal(e.runtime.view.phoneRequest, null);
  });
});

test('20261003模型更换玩家消息ID不能重复本次操作，旧原文也不能被改写', async () => {
  for (const scenario of ['新ID重发', '改旧原文']) await withEnv(async e => {
    e.update = async () => {
      const draft = e.vars.澄湾待更新手机.draft;
      const [id, sent] = Object.entries(draft.手机.原文.消息)[0];
      return scenario === '新ID重发' ? block([{ op: 'add', path: '/手机/原文/消息/duplicate', value: sent }])
        : block([patch('/手机/原文/消息/' + id + '/内容块/0/正文', '模型篡改原文')]);
    };
    await assert.rejects(e.runtime.phoneAction({ kind: 'send', id: 'chat', text: incidentText }), /重复|原文/);
    assert.equal(Object.keys(e.messages[0].data.stat_data.手机.原文.消息).length, 0);
  });
});

test('20261003兼容范围：原有/未知私有字段、独立私有路径及系统余额仍被拒绝', async () => {
  for (const attack of ['旧序号', '旧投递', '未知字段', '私有子路径', '系统版本', '精粹', 'move私有目标', 'move私有源']) await withEnv(async e => {
    e.update = async () => {
      const draft = e.vars.澄湾待更新手机.draft, id = Object.keys(draft.手机.原文.消息)[0];
      const commands = updateBlock(incidentPhonePatch(draft)).commands;
      if (attack === '旧序号') commands.push(patch('/手机/原文/消息/' + id + '/_顺序', 999));
      if (attack === '旧投递') commands.push(patch('/手机/原文/消息/' + id + '/_已投递账号id', ['intruder']));
      if (attack === '未知字段') commands[0].value._假授权 = '越权字段不得被Schema抹去';
      if (attack === '私有子路径') commands.push(patch('/手机/原文/消息/' + incidentReplyId + '/_顺序', 999));
      if (attack === '系统版本') commands.push(patch('/_系统/数据版本', 999));
      if (attack === '精粹') commands.push(patch('/奇遇系统/_系统币', 999));
      if (attack === 'move私有目标') commands.push({ op: 'move', from: '/玩家/姓名', to: '/手机/原文/消息/' + incidentReplyId + '/_假授权' });
      if (attack === 'move私有源') commands.push({ op: 'move', from: '/_系统/数据版本', to: '/玩家/年龄' });
      return block(commands);
    };
    await assert.rejects(e.runtime.phoneAction({ kind: 'send', id: 'chat', text: incidentText }), /脚本管理字段/);
    assert.equal(e.parses, 0, '原始越权字段须在MVU可剥离未知键之前拒绝');
    assert.equal(Object.keys(e.messages[0].data.stat_data.手机.原文.消息).length, 0);
    assert.equal(e.runtime.view.phoneRequest.status, 'failed');
    assert.equal(e.runtime.view.busy, false);
  });
});

test('20261003投递兼容不授予发送权限，帖子评论序号也仅由脚本维护', async () => {
  await withEnv(async e => {
    e.update = async () => {
      const commands = updateBlock(incidentPhonePatch(e.vars.澄湾待更新手机.draft)).commands;
      commands[0].value.发送账号id = 'intruder';
      commands[0].value._已投递账号id = ['me'];
      return block(commands);
    };
    await assert.rejects(e.runtime.phoneAction({ kind: 'send', id: 'chat', text: incidentText }), /会话权限/);
    assert.equal(Object.keys(e.messages[0].data.stat_data.手机.原文.消息).length, 0);
  });
  await withEnv(async e => {
    e.update = async () => block([
      { op: 'add', path: '/手机/原文/帖子/post', value: { 发布账号id: 'npc', 平台: '朋友圈',
        故事时间: time(0), _顺序: 999, 内容块: [{ 类型: '文字', id: 'post-block', 正文: '测试动态' }] } },
      { op: 'add', path: '/手机/原文/评论/comment', value: { 帖子id: 'post', 评论账号id: 'me',
        故事时间: time(0), _顺序: 1000, 内容块: [{ 类型: '文字', id: 'comment-block', 正文: '测试评论' }] } },
    ]);
    await e.runtime.phoneAction({ kind: 'refresh' });
    assert.equal(e.state().手机.原文.帖子.post._顺序, 1);
    assert.equal(e.state().手机.原文.评论.comment._顺序, 2);
    assert.deepEqual(e.state().手机.原文.帖子.post.受众账号id, ['me']);
  });
});

test('20261003手机候选在保存失败后重载仍恢复同一结果', async () => {
  await withEnv(async e => {
    e.update = async () => block([patch('/世界/当前时间', time(1))]);
    e.runtime.service.host.write = async () => { throw Error('模拟手机写入前失败'); };
    await assert.rejects(e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '重载候选' }), /写入前失败/);
    const candidate = copy(e.vars.澄湾待更新手机.candidate);
    await e.runtime.dispose();
    e.runtime = createRuntime(); await e.runtime.start();
    assert.equal(e.runtime.view.phoneRequest.status, 'failed');
    e.update = async () => { throw Error('重载恢复不得调用模型'); };
    await e.runtime.retry();
    assert.equal(e.calls.length, 1);
    assert.deepEqual(e.state().手机, candidate.手机);
    assert.equal(e.vars.澄湾待更新手机, null);
    assert.equal(e.vars.澄湾待确认提交, null);
    assert.equal(e.runtime.view.phoneRequest, null);
  });
});

test('20261003手机写入后保存失败，取消待处理仅确认原提交', async () => {
  await withEnv(async e => {
    let fail = true;
    SillyTavern.saveChat = async () => {
      if (fail && Object.values(e.messages[0].data.stat_data._系统.提交记录).some(v => v.数据版本 > 0))
        throw Error('模拟手机写入后保存失败');
    };
    await assert.rejects(e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '确认原提交' }), /保存失败/);
    const original = copy(e.messages[0].data.stat_data);
    fail = false; e.update = async () => { throw Error('不得重复生成'); };
    await e.runtime.discardPending();
    assert.equal(e.calls.length, 1);
    assert.deepEqual(e.state(), original);
    assert.equal(e.vars.澄湾待更新手机, null);
    assert.equal(e.vars.澄湾待确认提交, null);
  });
});

test('20261003正文变量完成但日志失败，重试恢复同一候选且正文不重复', async () => {
  await withEnv(async e => {
    const journal = e.runtime.service.host.journal; let fail = true;
    e.runtime.service.host.journal = async value => {
      if (value?.replyFloor !== undefined && fail) { fail = false; throw Error('正文候选日志失败'); }
      return journal(value);
    };
    await assert.rejects(e.runtime.send('同一正文候选'), /日志失败/);
    const prepared = copy(e.vars.澄湾待更新正文.prepared), text = e.messages[2].message;
    e.update = async () => { throw Error('变量结果已完成，不应重跑模型'); };
    await e.runtime.retry();
    assert.equal(e.calls.length, 2);
    assert.equal(e.messages.length, 3); assert.equal(e.messages[2].message, text);
    assert.deepEqual(e.state(), prepared.envelope.stat_data);
  });
});

test('20261003手机重复点击、候选切换、聊天切换及卸载隔离迟到结果', async () => {
  for (const change of ['重复点击', 'swipe', 'chat', 'dispose']) await withEnv(async e => {
    const delayed = deferred(); e.update = async () => delayed.promise;
    const action = { kind: 'send', id: 'chat', text: '并发隔离测试' };
    const before = copy(e.state()), sending = e.runtime.phoneAction(action);
    const outcome = sending.then(() => null, error => error);
    await until(() => e.calls.length === 1);
    let duplicate;
    if (change === '重复点击') duplicate = e.runtime.phoneAction(action);
    if (change === 'swipe') e.listeners.get('swipe')();
    if (change === 'chat') { e.chat = 'another-isolated-chat'; e.listeners.get('chat')(); }
    if (change === 'dispose') await e.runtime.dispose();
    delayed.resolve(block([]));
    const error = await outcome;
    if (change === '重复点击') {
      assert.equal(error, null); await duplicate;
      assert.equal(Object.keys(e.state().手机.原文.消息).length, 1);
    } else {
      assert(error); assert.deepEqual(e.messages[0].data.stat_data, before);
    }
    assert.equal(e.calls.length, 1);
    assert.equal(e.runtime.view.busy, false); assert.equal(e.runtime.view.updating, false);
  });
});

test('20261003接口归属：A失败后查看B，连续重试保留A原提交身份', async () => {
  const initial = seed();
  initial.手机.会话.chatB = copy(initial.手机.会话.chat);
  await withEnv(async e => {
    let round = 0;
    const response = deferred();
    e.update = async () => {
      if (++round < 3) throw Error('手机网络失败');
      return response.promise;
    };
    await assert.rejects(e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '会话A原稿' }), /手机网络失败/);
    const first = copy(e.runtime.view.phoneRequest);
    assert.equal(first.kind, 'send');
    assert.equal(first.targetId, 'chat');
    assert.equal(first.chatId, e.chat);
    assert.equal(first.floor, 0);
    assert.equal(first.swipe, 0);
    assert.equal(first.status, 'failed');
    assert.deepEqual(Object.keys(first).sort(), ['id', 'kind', 'targetId', 'platform', 'chatId', 'floor', 'swipe', 'status'].sort());
    // Viewing another phone conversation is local frontend state, not a new Tavern scope or Runtime operation.
    const displayedSession = 'chatB';
    assert.notEqual(first.targetId, displayedSession);
    await assert.rejects(e.runtime.retry(), /手机网络失败/);
    assert.equal(e.runtime.view.phoneRequest.id, first.id);
    const retry = e.runtime.retry();
    await until(() => round === 3);
    assert.equal(e.runtime.view.operation, 'recovery');
    assert.equal(e.runtime.view.phoneRequest.status, 'sending');
    assert.equal(e.runtime.view.phoneRequest.targetId, 'chat');
    assert.equal(e.runtime.view.busy, true);
    const repeatedRetry = e.runtime.retry();
    response.resolve(block([patch('/世界/当前时间', time(1))]));
    const [result, repeatedResult] = await Promise.all([retry, repeatedRetry]);
    assert.deepEqual(result, { ...first, type: 'phone', status: 'confirmed' });
    assert.deepEqual(repeatedResult, result);
    assert.equal(e.calls.length, 3);
    assert.equal(Object.keys(e.state().手机.原文.消息).length, 1);
    assert.equal(Object.values(e.state().手机.原文.消息)[0].会话id, 'chat');
    assert.equal(Object.keys(e.state()._系统.提交记录).filter(id => id === first.id).length, 1);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
    assert.equal(e.runtime.view.phoneRequest, null);
  }, initial);
});

test('20261003接口成功：重复点击共享一个确认结果，非手机恢复没有手机结果', async () => {
  await withEnv(async e => {
    const response = deferred();
    e.update = async () => response.promise;
    const action = { kind: 'send', id: 'chat', text: '共享结果' };
    const first = e.runtime.phoneAction(action);
    await until(() => e.calls.length === 1);
    const identity = copy(e.runtime.view.phoneRequest);
    const duplicate = e.runtime.phoneAction(action);
    response.resolve(block([patch('/世界/当前时间', time(1))]));
    const results = await Promise.all([first, duplicate]);
    assert.deepEqual(results[0], { ...identity, type: 'phone', status: 'confirmed' });
    assert.deepEqual(results[0], results[1]);
    assert.equal(e.calls.length, 1);
    assert.equal(e.writes, 1);
    e.update = async () => { throw Error('正文变量失败'); };
    await assert.rejects(e.runtime.send('保留已有正文'), /正文变量失败/);
    e.update = async () => block([]);
    assert.equal(await e.runtime.retry(), undefined, '恢复正文不能被当成手机成功');
  });
});

test('20261003接口恢复：日志/持久保存失败与旧恢复记录均返回同ID确认结果', async () => {
  for (const phase of ['日志', '持久保存']) await withEnv(async e => {
    let fail = true;
    const originalJournal = e.runtime.service.host.journal, originalPersist = e.runtime.service.host.persist;
    if (phase === '日志') e.runtime.service.host.journal = async value => {
      if (value && fail) { fail = false; throw Error('提交日志失败'); }
      return originalJournal(value);
    };
    else e.runtime.service.host.persist = async () => {
      if (fail) { fail = false; throw Error('持久保存未确认'); }
      return originalPersist();
    };
    e.update = async () => block([patch('/世界/当前时间', time(1))]);
    await assert.rejects(e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '同一请求恢复' }), /失败|未确认/);
    const before = copy(e.runtime.view.phoneRequest), saved = copy(e.vars.澄湾待更新手机);
    assert(saved.candidate);
    assert.equal(before.status, 'failed');
    assert.equal(Object.hasOwn(saved, 'targetId'), false, '新增路由事实由旧action/context推导，不新增持久回执');
    await e.runtime.dispose();
    e.runtime = createRuntime();
    await e.runtime.start();
    assert.deepEqual(e.runtime.view.phoneRequest, before);
    const result = await e.runtime.retry();
    assert.deepEqual(result, { ...before, type: 'phone', status: 'confirmed' });
    assert.equal(e.calls.length, 1);
    assert.equal(Object.keys(e.state().手机.原文.消息).length, 1);
    assert.equal(e.writes, 1);
    assert.equal(e.vars.澄湾待更新手机, null);
    assert.equal(e.vars.澄湾待确认提交, null);
  });
});

test('20261003接口取消：旧操作退出前保持锁，已发出的写入只按原ID确认', async () => {
  for (const phase of ['生成', '持久确认']) await withEnv(async e => {
    const wait = deferred();
    let reached = false, received;
    if (phase === '生成') e.update = async () => { reached = true; return wait.promise; };
    else {
      e.update = async () => block([patch('/世界/当前时间', time(1))]);
      const original = e.runtime.service.host.persist;
      e.runtime.service.host.persist = async () => { reached = true; await wait.promise; return original(); };
    }
    const operation = e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '停止状态验证' });
    void operation.then(result => { received = result; }, () => {});
    await until(() => reached);
    const before = copy(e.runtime.view.phoneRequest);
    e.runtime.stop();
    assert.equal(e.runtime.view.phoneRequest.status, 'stopping');
    assert.equal(e.runtime.view.busy, true);
    await assert.rejects(e.runtime.retry(), /当前操作仍在执行/);
    wait.resolve(block([patch('/世界/当前时间', time(1))]));
    await assert.rejects(operation, /取消|变化/);
    assert.equal(received, undefined);
    assert.equal(e.runtime.view.busy, false);
    assert.equal(e.runtime.view.updating, false);
    if (phase === '生成') {
      assert.equal(e.writes, 0);
      assert.equal(e.runtime.view.phoneRequest, null);
    } else {
      assert.equal(e.writes, 1, '停止不回滚已发出的写入');
      assert.equal(e.runtime.view.phoneRequest.status, 'failed');
      const result = await e.runtime.retry();
      assert.deepEqual(result, { ...before, type: 'phone', status: 'confirmed' });
      assert.equal(e.writes, 1);
      assert.equal(e.calls.length, 1);
    }
  });
});

test('20261003接口隔离：保存确认期间切聊天/候选/卸载，不发出旧上下文成功结果', async () => {
  for (const change of ['聊天', '候选', '卸载']) await withEnv(async e => {
    const wait = deferred(), originalPersist = e.runtime.service.host.persist;
    let reached = false, received;
    e.update = async () => block([patch('/世界/当前时间', time(1))]);
    e.runtime.service.host.persist = async () => { reached = true; await wait.promise; return originalPersist(); };
    const operation = e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '旧上下文结果' });
    void operation.then(result => { received = result; }, () => {});
    await until(() => reached);
    if (change === '聊天') e.chat = 'another-isolated-chat';
    else if (change === '候选') e.messages[0].swipe_id = 1;
    else await e.runtime.dispose();
    wait.resolve();
    await assert.rejects(operation);
    assert.equal(received, undefined);
    assert.equal(e.writes, 1, '已发出的旧候选写入不回滚、不迁移到新上下文');
  });
});

test('20261003接口隔离：完成恢复记录清理后上下文变化也不能返回旧成功结果', async () => {
  await withEnv(async e => {
    const original = global.replaceVariables;
    let changed = false, received;
    global.replaceVariables = async (value, options) => {
      await original(value, options);
      if (!changed && options.type === 'chat' && value.澄湾排队操作?.length === 0 &&
          Object.keys(e.state()._系统.已计轮事件).length === 1) {
        changed = true;
        e.chat = 'another-isolated-chat';
      }
    };
    e.update = async () => block([patch('/世界/当前时间', time(1))]);
    const operation = e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '结果返回前切换' });
    void operation.then(result => { received = result; }, () => {});
    await assert.rejects(operation, /失效|上下文|活动写入/);
    assert.equal(changed, true);
    assert.equal(received, undefined);
    assert.equal(e.writes, 1);
  });
});

test('20261003 F10：队列恢复已写入手机提交，持续保存失败不得confirmed，恢复后同ID仅确认一次', async () => {
  await withEnv(async e => {
    const originalPersist = e.runtime.service.host.persist;
    let persistCalls = 0, fail = true;
    e.runtime.service.host.persist = async () => {
      persistCalls++;
      if (fail) throw Error('队列恢复持久保存未确认');
      return originalPersist();
    };
    e.update = async () => block([patch('/世界/当前时间', time(1))]);
    await assert.rejects(e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '队列恢复同一提交' }), /保存未确认/);
    const identity = copy(e.runtime.view.phoneRequest), committed = copy(e.state());
    const id = identity.id;
    await assert.rejects(e.runtime.resumeQueued(id), /保存未确认/);
    assert.equal(persistCalls, 2, '队列恢复必须重新请求保存确认');
    assert.equal(e.runtime.view.phoneRequest.status, 'failed');
    assert(e.vars.澄湾待更新手机);
    assert(e.vars.澄湾待确认提交);
    assert(e.runtime.view.recoverable.some(item => item.id === id));
    fail = false;
    const result = await e.runtime.resumeQueued(id);
    assert.deepEqual(result, { ...identity, type: 'phone', status: 'confirmed' });
    assert.equal(persistCalls, 3);
    assert.equal(e.calls.length, 1);
    assert.equal(e.writes, 1);
    assert.deepEqual(e.state(), committed);
    assert.equal(e.vars.澄湾待更新手机, null);
    assert.equal(e.vars.澄湾待确认提交, null);
    assert.equal(e.runtime.view.phoneRequest, null);
    assert.equal(e.runtime.view.recoverable.some(item => item.id === id), false);
  });
});

test('20261003 F10：只有已提交队列记录时也须确认保存，不重新准备或发送操作', async () => {
  await withEnv(async e => {
    let savedIntent;
    e.update = async () => {
      savedIntent = copy(e.vars.澄湾排队操作[0]);
      return block([patch('/世界/当前时间', time(1))]);
    };
    const result = await e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '已完成提交的遗留队列' });
    const committed = copy(e.state());
    // 模拟旧存档保留了队列，但对应手机恢复记录已经清理。
    e.vars.澄湾排队操作 = [savedIntent];
    await e.runtime.dispose();
    e.runtime = createRuntime();
    await e.runtime.start();
    assert.equal(e.vars.澄湾待更新手机, null);
    const originalPersist = e.runtime.service.host.persist;
    let fail = true, persistCalls = 0;
    e.runtime.service.host.persist = async () => {
      persistCalls++;
      if (fail) throw Error('遗留队列保存未确认');
      return originalPersist();
    };
    e.runtime.settings.phone.apiurl = '';
    e.update = async () => { throw Error('已提交队列不能重新请求模型'); };
    await assert.rejects(e.runtime.resumeQueued(savedIntent.id), /保存未确认/);
    assert.equal(e.runtime.view.phoneRequest.id, result.id);
    fail = false;
    assert.deepEqual(await e.runtime.resumeQueued(savedIntent.id), result);
    assert.equal(persistCalls, 2);
    assert.equal(e.calls.length, 1);
    assert.equal(e.writes, 1);
    assert.deepEqual(e.state(), committed);
    assert.equal(e.vars.澄湾待更新手机, null);
    assert.equal(e.runtime.view.recoverable.length, 0);
  });
});

test('20261003 F10：已写入队列的保存确认期间停止或切换上下文，不返回迟到confirmed', async () => {
  for (const change of ['停止', '聊天', '候选', '卸载']) await withEnv(async e => {
    const originalPersist = e.runtime.service.host.persist;
    e.runtime.service.host.persist = async () => { throw Error('首次保存未确认'); };
    e.update = async () => block([patch('/世界/当前时间', time(1))]);
    await assert.rejects(e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '队列恢复期间切换' }), /保存未确认/);
    const identity = copy(e.runtime.view.phoneRequest);
    const wait = deferred();
    let reached = false, received;
    e.runtime.service.host.persist = async () => {
      reached = true;
      await wait.promise;
      return originalPersist();
    };
    const operation = e.runtime.resumeQueued(identity.id);
    void operation.then(result => { received = result; }, () => {});
    await until(() => reached);
    assert.equal(e.runtime.view.busy, true);
    assert.equal(e.runtime.view.phoneRequest.status, 'saving');
    if (change === '停止') {
      e.runtime.stop();
      assert.equal(e.runtime.view.busy, true);
      assert.equal(e.runtime.view.phoneRequest.status, 'stopping');
    } else if (change === '聊天') e.chat = 'another-isolated-chat';
    else if (change === '候选') e.messages[0].swipe_id = 1;
    else await e.runtime.dispose();
    wait.resolve();
    await assert.rejects(operation);
    assert.equal(received, undefined);
    assert.equal(e.calls.length, 1);
    assert.equal(e.writes, 1);
    assert.equal(e.runtime.view.busy, false);
    if (change === '停止') {
      assert.equal(e.runtime.view.phoneRequest.id, identity.id);
      assert.equal(e.runtime.view.phoneRequest.status, 'failed');
      assert.deepEqual(await e.runtime.resumeQueued(identity.id), { ...identity, type: 'phone', status: 'confirmed' });
      assert.equal(e.calls.length, 1);
      assert.equal(e.writes, 1);
    }
  });
});

test('20261003草稿集成：真实Runtime与调度器隔离同目标连续请求，失败重试按原ID清稿', async () => {
  const { useLinxinDrafts } = require(root + '/界面/桌面端/utils/linxin-drafts.ts');
  await withEnv(async e => {
    const drafts = useLinxinDrafts(e.runtime), entry = drafts.session();
    const firstReply = deferred(), secondReply = deferred();
    const original = '草稿入口的第一条';
    entry.replies.chat = original;
    let requests = 0;
    e.update = async () => {
      if (++requests === 1) return firstReply.promise;
      await secondReply.promise;
      throw Error('第二条独立请求失败');
    };
    const first = drafts.send(entry, 'chat', original);
    await until(() => e.calls.length === 1);
    const firstId = e.runtime.view.phoneRequest.id;
    assert.equal(entry.submitted[firstId].original, original);
    // 第二次发送来自其他入口，经过真实 Runtime/Scheduler 排在同一会话后面。
    const second = e.runtime.phoneAction({ kind: 'send', id: 'chat', platform: '邻信', text: '其他入口的第二条' });
    const secondOutcome = second.then(result => ({ result }), error => ({ error }));
    assert.equal(e.runtime.view.queued.length, 1);
    firstReply.resolve(block([patch('/世界/当前时间', time(1))]));
    await first;
    await until(() => e.calls.length === 2);
    const secondId = e.runtime.view.phoneRequest.id;
    assert.notEqual(secondId, firstId);
    assert.equal(entry.replies.chat, '', 'A确认成功后只清理A未编辑的原稿');
    assert.equal(Object.hasOwn(entry.submitted, secondId), false, '同目标B不能继承A的草稿关联');
    assert.equal(Object.keys(entry.submitted).length, 0);
    // 即使玩家再次输入与A相同的新稿，B的恢复成功也不能清掉它。
    entry.replies.chat = original;
    secondReply.resolve();
    assert.match(String((await secondOutcome).error), /独立请求失败/);
    e.update = async () => {
      assert.equal(e.runtime.view.phoneRequest.id, secondId);
      return block([patch('/世界/当前时间', time(2))]);
    };
    await drafts.retry(entry);
    assert.equal(entry.replies.chat, original);
    assert.equal(e.calls.length, 3);
    assert.equal(e.writes, 2);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 2);
    assert.deepEqual(Object.values(e.state().手机.原文.消息).map(message => message.内容块[0].正文),
      [original, '其他入口的第二条']);
  });

  await withEnv(async e => {
    const drafts = useLinxinDrafts(e.runtime), entry = drafts.session();
    const original = '  原请求失败后再确认  ';
    entry.replies.chat = original;
    e.update = async () => { throw Error('首个草稿请求失败'); };
    await assert.rejects(drafts.send(entry, 'chat', original), /草稿请求失败/);
    const id = e.runtime.view.phoneRequest.id;
    assert.equal(entry.submitted[id].identity.id, id);
    assert.equal(entry.replies.chat, original);
    e.update = async () => {
      assert.equal(e.runtime.view.phoneRequest.id, id);
      return block([patch('/世界/当前时间', time(1))]);
    };
    await drafts.retry(entry);
    assert.equal(entry.replies.chat, '');
    assert.equal(Object.hasOwn(entry.submitted, id), false);
    assert.equal(e.calls.length, 2);
    assert.equal(e.writes, 1);
    assert.equal(Object.keys(e.state().手机.原文.消息).length, 1);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
  });
});

test('20261003草稿镜像：真实bridge没有发布中间phoneRequest，同步归属回调仍绑定并安全清稿', async () => {
  const { useLinxinDrafts } = require(root + '/界面/桌面端/utils/linxin-drafts.ts');
  const { watch } = require('vue');
  await withEnv(async e => {
    window.parent.__chengwanService = { ready: true, runtime: e.runtime };
    let identity;
    const originalPhoneAction = e.runtime.phoneAction;
    e.runtime.phoneAction = (action, onRequest) => {
      const pending = originalPhoneAction(action, request => {
        identity = copy(request);
        assert.equal(e.calls.length, 0, '请求身份在入队/生成前同步通知调用者');
        onRequest?.(request);
      });
      assert(identity, 'phoneAction返回Promise前已经提供身份');
      return pending;
    };
    const bridge = connectRuntime(e.runtime);
    const drafts = useLinxinDrafts(bridge.runtime), entry = drafts.session();
    let observedPhoneRequests = 0;
    const stopWatching = watch(() => bridge.runtime.view.phoneRequest, request => {
      if (request) observedPhoneRequests++;
    }, { flush: 'sync' });
    try {
      entry.replies.chat = '  快速成功但镜像没有中间状态  ';
      e.update = async () => block([patch('/世界/当前时间', time(1))]);
      await drafts.send(entry, 'chat', entry.replies.chat);
      assert.equal(observedPhoneRequests, 0, '成功前镜像没有看到任何phoneRequest状态');
      assert.equal(identity.targetId, 'chat');
      assert.equal(identity.chatId, e.chat);
      assert.equal(entry.replies.chat, '');
      assert.equal(Object.keys(entry.submitted).length, 0);
      assert(e.state()._系统.提交记录[identity.id]);
      assert.equal(e.calls.length, 1);
      assert.equal(e.writes, 1);
    } finally {
      stopWatching();
      bridge.disconnect();
    }
  });
});

function sharedDepthRules() {
  const YAML = require('yaml');
  const index = YAML.parse(fs.readFileSync(path.join(root, '世界书/index.yaml'), 'utf8'));
  const uids = [10, 11, 12, 14, 15, 16];
  return index.条目.flatMap(group => group.条目).filter(row => uids.includes(row.uid)).map(row => ({
    uid: row.uid,
    name: row.名称,
    enabled: row.启用,
    strategy: { type: row.激活策略.类型 === '蓝灯' ? 'constant' : 'selective', keys: [] },
    position: { type: row.插入位置.类型 === '指定深度' ? 'at_depth' : 'before_character_definition',
      role: 'system', depth: row.插入位置.深度 ?? 0, order: row.插入位置.顺序 },
    content: fs.readFileSync(path.join(root, '世界书', row.文件), 'utf8'),
  }));
}

test('常驻语义：正文维持原激活，raw及携带预设的正文/手机变量请求均携带六条深度说明一次', async () => {
  for (const sendPreset of [false, true]) await withEnv(async e => {
    const shared = sharedDepthRules();
    assert.equal(shared.length, 6);
    assert.match(shared.find(row => row.uid === 12).content, /破壁阶段/);
    assert.match(shared.find(row => row.uid === 14).content, /null表示未知/);
    e.rules.push(...shared);
    let workers = 0;
    e.story = async config => {
      for (const rule of e.rules)
        assert(!config.injects.some(prompt => prompt.content === rule.content), '正文不能额外重复注入常驻或变量规则');
      assert.equal(config.overrides.chat_history, undefined, '正文保留酒馆原有深度插入');
      return '玩家继续日常交流。';
    };
    e.update = async config => {
      workers++;
      const prompts = sendPreset ? config.overrides.chat_history.prompts
        : config.ordered_prompts.filter(prompt => typeof prompt === 'object');
      if (sendPreset) assert.equal(config.overrides.chat_history.with_depth_entries, false);
      else assert(!config.ordered_prompts.includes('chat_history'));
      const messages = [...copy(prompts), { role: 'user', content: config.user_input }];
      e.listeners.get('completion_settings')({ messages });
      for (const rule of shared)
        assert.equal(messages.filter(message => message.content === rule.content.trim()).length, 1, rule.name);
      assert(!JSON.stringify(messages).includes('[chengwan-'));
      return block([]);
    };
    await e.runtime.send('正常交谈');
    await e.runtime.phoneAction({ kind: 'refresh', id: 'chat' });
    assert.equal(workers, 2);
    assert(shared.every(rule => rule.enabled && rule.position.type === 'at_depth'));
  }, seed(), { variable: { ...endpoint('variable'), sendPreset }, phone: { ...endpoint('phone'), sendPreset } });
});

test('常驻语义：仅补已启用蓝灯深度白名单，深度0变量列表和原生前置内容不额外注入', async () => {
  await withEnv(async e => {
    const shared = sharedDepthRules();
    shared[0].enabled = false;
    shared[1].position.type = 'before_character_definition';
    shared[2].strategy.type = 'selective';
    e.rules.push(...shared,
      { ...copy(shared[3]), uid: 999, name: '变量列表', content: '深度0变量列表不应额外注入',
        position: { ...shared[3].position, depth: 0 } },
      { ...copy(shared[3]), uid: 998, name: '无关的深度条目', content: '非白名单内容不应额外注入' });
    const before = copy(e.rules);
    const config = await livePromptConfig(e.state(), '本轮结算', 'worker');
    const bodies = config.injects.map(prompt => prompt.content);
    for (const rule of shared.slice(0, 3)) assert(!bodies.includes(rule.content), rule.name);
    for (const rule of shared.slice(3)) assert.equal(bodies.filter(body => body === rule.content).length, 1, rule.name);
    for (const rule of e.rules.slice(-2)) assert(!bodies.includes(rule.content));
    assert.deepEqual(e.rules, before, '读取提示词不修改条目开关和位置');
  });
});

test('常驻语义：已启用同名重复和空正文拒绝，停用副本与相同正文不重复注入', async () => {
  await withEnv(async e => {
    const rule = sharedDepthRules()[0];
    e.rules.push(rule, { ...copy(rule), uid: 901, name: ' 规则｜叙事与知情 ' });
    await assert.rejects(livePromptConfig(e.state(), '更新', 'worker'), /已启用常驻规则重复/);
    e.rules.at(-1).enabled = false;
    let config = await livePromptConfig(e.state(), '更新', 'worker');
    assert.equal(config.injects.filter(prompt => prompt.content === rule.content).length, 1);
    rule.content = '   ';
    await assert.rejects(livePromptConfig(e.state(), '更新', 'worker'), /已启用常驻规则为空/);
    rule.content = '相同的共享说明';
    e.rules.push({ ...copy(rule), uid: 902, name: '规则｜关系生态' });
    config = await livePromptConfig(e.state(), '更新', 'worker');
    assert.equal(config.injects.filter(prompt => prompt.content === rule.content).length, 1);
  });
});

test('常驻语义：读取世界书期间切换聊天或绑定世界书，迟到内容不返回也不缓存', async () => {
  for (const change of ['聊天', '世界书']) await withEnv(async e => {
    const rule = sharedDepthRules()[0];
    rule.content = '旧上下文的私有说明';
    e.rules.push(rule);
    const oldBook = global.getCharWorldbookNames, oldRead = global.getWorldbook;
    const waiting = deferred();
    try {
      global.getWorldbook = async () => waiting.promise;
      const pending = livePromptConfig(e.state(), '更新', 'worker');
      if (change === '聊天') e.chat = '另一个聊天';
      else global.getCharWorldbookNames = () => ({ primary: '另一本世界书' });
      waiting.resolve(copy(e.rules));
      await assert.rejects(pending, /聊天或世界书已切换/);
      rule.content = '新上下文的当前说明';
      global.getWorldbook = oldRead;
      const next = await livePromptConfig(e.state(), '更新', 'worker');
      assert(next.injects.some(prompt => prompt.content === rule.content));
      assert(!next.injects.some(prompt => prompt.content === '旧上下文的私有说明'));
      assert.equal(e.calls.length, 0, '失效的提示词读取不请求模型');
    } finally {
      global.getCharWorldbookNames = oldBook;
      global.getWorldbook = oldRead;
    }
  });
});

async function withExpiringWriter(fn) {
  const browserLock = require(root + '/运行/browser-lock.ts');
  const original = browserLock.requestBrowserLock;
  let expired = false;
  browserLock.requestBrowserLock = async (name, options, callback) => {
    let notified = false;
    return callback({ assertHeld() {
      if (!expired || !name.startsWith('澄湾写入:')) return;
      const error = Error('模拟手机后台冻结：写入租约已失效');
      if (!notified) {
        notified = true;
        options.onLost?.(error);
      }
      throw error;
    } });
  };
  try {
    await withEnv(e => fn(e, () => { expired = true; }));
  } finally {
    browserLock.requestBrowserLock = original;
  }
}

function writeSnapshot(e, counts) {
  return {
    calls: { ...counts }, mutations: copy(e.mutations), writes: e.writes,
    messages: copy(e.messages), vars: copy(e.vars), character: copy(e.character), rules: copy(e.rules),
  };
}

function countPersistenceCalls() {
  const counts = { variables: 0, saves: 0 };
  const replace = global.replaceVariables, save = SillyTavern.saveChat;
  global.replaceVariables = (...args) => { counts.variables++; return replace(...args); };
  SillyTavern.saveChat = (...args) => { counts.saves++; return save(...args); };
  return counts;
}

test('HTTP写入保护：正文和手机模型迟到回复遇到失锁或切聊天，不再调用消息及存档写入', async () => {
  for (const channel of ['正文', '手机']) for (const change of ['失锁', '切聊天']) {
    await withExpiringWriter(async (e, expire) => {
      const response = deferred(), counts = countPersistenceCalls();
      if (channel === '正文') e.story = () => response.promise;
      else e.update = () => response.promise;
      const operation = channel === '正文' ? e.runtime.send('等待迟到正文')
        : e.runtime.phoneAction({ kind: 'refresh', id: 'chat' });
      const rejected = assert.rejects(operation);
      await until(() => e.calls.length === 1);
      const before = writeSnapshot(e, counts);
      if (change === '失锁') expire();
      else e.chat = 'different-chat-after-request';
      response.resolve(channel === '正文' ? '旧页面迟到的正文' : block([patch('/世界/当前时间', time(20))]));
      await rejected;
      assert.deepEqual(writeSnapshot(e, counts), before, `${channel}/${change}后不可追加、改写或保存`);
      assert.equal(e.calls.length, 1, '失效页面不能继续请求变量或重试模型');
      if (change === '失锁') assert.equal(e.runtime.view.readOnly, true);
    });
  }
});

test('HTTP写入保护：正文恢复记录保存期间失锁，send catch不能补写助手楼层', async () => {
  await withExpiringWriter(async (e, expire) => {
    const saving = deferred(), counts = countPersistenceCalls();
    const save = SillyTavern.saveChat;
    let waiting = false;
    SillyTavern.saveChat = async (...args) => {
      await save(...args);
      if (!waiting && e.vars.澄湾待更新正文?.text && e.vars.澄湾待更新正文.replyFloor === undefined) {
        waiting = true;
        await saving.promise;
      }
    };
    const operation = e.runtime.send('正文生成后暂停保存');
    const rejected = assert.rejects(operation, /租约已失效/);
    await until(() => waiting);
    assert.equal(e.messages.length, 2, '已保存玩家输入，但尚未创建正文楼层');
    assert.equal(e.vars.澄湾待更新正文.replyFloor, undefined);
    const before = writeSnapshot(e, counts);
    expire();
    saving.resolve();
    await rejected;
    assert.deepEqual(writeSnapshot(e, counts), before, '错误恢复分支不能在失锁后补建助手消息');
    assert.equal(e.calls.length, 1);
    assert.equal(e.runtime.view.readOnly, true);
  });
});

test('HTTP写入保护：正文结算日志保存期间失锁，不能改写已显示正文或落盘候选变量', async () => {
  await withExpiringWriter(async (e, expire) => {
    const saving = deferred(), counts = countPersistenceCalls();
    const save = SillyTavern.saveChat;
    let waiting = false;
    e.update = async () => block([patch('/玩家/年龄', 31)]);
    SillyTavern.saveChat = async (...args) => {
      await save(...args);
      if (!waiting && e.vars.澄湾待确认提交?.replyFloor !== undefined) {
        waiting = true;
        await saving.promise;
      }
    };
    const operation = e.runtime.send('正文结算保存时暂停');
    const rejected = assert.rejects(operation, /租约已失效|生成已停止/);
    await until(() => waiting);
    assert.equal(e.messages.length, 3, '正文已显示，结算候选尚未写入该楼层');
    assert.equal(e.messages.at(-1).extra.cw_update_pending, true);
    assert.equal(e.vars.澄湾待确认提交.candidate.玩家.年龄, 31);
    const before = writeSnapshot(e, counts);
    expire();
    saving.resolve();
    await rejected;
    assert.deepEqual(writeSnapshot(e, counts), before, '失锁后的日志续体不能改正文、MVU或再次保存');
    assert.equal(e.calls.length, 2);
    assert.equal(e.runtime.view.readOnly, true);
  });
});
