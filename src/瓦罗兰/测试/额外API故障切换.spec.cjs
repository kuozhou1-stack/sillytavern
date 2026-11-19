const assert = require('node:assert/strict');
const { test } = require('node:test');
const { withEnv, block, patch, endpoint } = require('./修复宿主.cjs');
const { ApiSettingsSchema, createSettingsController, apiBrowserKey, apiConnection } = require('../运行/settings.ts');
const { ApiProviderError } = require('../运行/generation/provider-error.ts');

const primary = endpoint('primary'), backup = endpoint('backup');
const connections = { ...primary, autoFailover: true, backups: [{ ...backup, name: '第二条' }] };
const settings = (overrides = {}) => ({
  variable: connections, phone: connections, characterAuto: false, ...overrides,
});
const sent = e => e.calls.map(c => [c.stage, c.config.custom_api?.model ?? 'main']);
const limited = () => new ApiProviderError('Too Many Requests');

test('旧配置保持原首选，多个连接按序保存并由新控制器独立读取', async () => {
  await withEnv(async e => {
    const legacy = ApiSettingsSchema.parse(primary);
    assert.equal(legacy.model, primary.model);
    assert.deepEqual(legacy.backups, []);
    assert.equal(legacy.autoFailover, false);
    assert.equal(legacy.vertexThinkingLevel, 'default');
    const third = { ...endpoint('third'), source: 'google' };
    await e.runtime.saveSettings({ phone: { ...connections, backups: [backup, third] } }, 'phone');
    const browser = JSON.parse(e.localFiles.get(apiBrowserKey('phone', 'test-account')));
    assert.deepEqual(browser.backups.map(p => [p.model, p.source]), [['backup', 'openai_compatible'], ['third', 'google']]);
    const reopened = await createSettingsController().load('phone');
    assert.deepEqual(reopened.value.phone, browser);
    const legacyFile = e.sharedFiles.get('/user/files/valoran-v1-api-phone.json');
    legacyFile.value = primary;
    const old = await createSettingsController().load('phone');
    assert.deepEqual(old.value.phone, legacy);
  });
});

test('各条 Vertex 连接分别保留思考强度，资料复用和换线采用当次连接的档位', async () => {
  const vertex = { source: 'vertex', projectId: 'fixture', region: 'global', vertexCredentialId: 'fixture-key',
    model: 'gemini-4-neon', vertexThinkingLevel: 'xhigh' };
  const fallback = { ...vertex, vertexCredentialId: 'another-key', vertexThinkingLevel: 'low' };
  await withEnv(async e => {
    const legacyVertex = { source: 'vertex', projectId: 'fixture', region: 'global', model: vertex.model,
      vertexCredentialId: vertex.vertexCredentialId };
    const legacy = ApiSettingsSchema.parse({ ...legacyVertex, backups: [legacyVertex] });
    assert.deepEqual([legacy.vertexThinkingLevel, legacy.backups[0].vertexThinkingLevel], ['default', 'default']);
    await e.runtime.saveSettings({ variable: { ...vertex, autoFailover: true, backups: [fallback] } }, 'variable');
    const { value } = await createSettingsController().load('variable');
    assert.equal(value.variable.vertexThinkingLevel, 'xhigh');
    assert.equal(value.variable.backups[0].vertexThinkingLevel, 'low');
    e.update = async config => {
      if (config.custom_api.vertex.vertexCredentialId === vertex.vertexCredentialId) throw limited();
      return config.json_schema.name === 'information_selection' ? JSON.stringify({ 地点: [], 组织: [] }) : block([]);
    };
    await e.runtime.send('使用备用服务');
    assert.deepEqual(e.calls.map(({ stage, config }) => [stage, config.custom_api?.vertex.vertexThinkingLevel]), [
      ['information', 'xhigh'], ['information', 'low'], ['story', undefined], ['variables', 'xhigh'], ['variables', 'low'],
    ]);
    const ordinary = apiConnection(ApiSettingsSchema.parse({ ...primary, vertexThinkingLevel: 'xhigh' }));
    assert.deepEqual(ordinary, { ...primary, source: 'openai' });
  }, undefined, settings({ informationAuto: true }));
});

test('资料复用和变量分别从首选开始，失败切到备用，正文与结算只提交一次', async () => {
  await withEnv(async e => {
    e.update = async config => {
      if (config.custom_api.model === 'primary') throw limited();
      if (config.json_schema.name === 'information_selection') return JSON.stringify({ 地点: [], 组织: [] });
      return block([patch('/玩家/称呼', '切换成功')]);
    };
    await e.runtime.send('查看街道');
    assert.deepEqual(sent(e), [['information','primary'], ['information','backup'], ['story','main'],
      ['variables','primary'], ['variables','backup']]);
    assert.equal(e.messages.length, 3);
    assert.equal(e.state().玩家.称呼, '切换成功');
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
  }, undefined, settings({ informationAuto: true }));
});

test('手机与奇遇各自重试同一操作，收到有效回包后立即结束', async () => {
  await withEnv(async e => {
    e.update = async config => {
      if (config.custom_api.model === 'primary') throw limited();
      return e.runtime.view.phase === 'novel'
        ? JSON.stringify({ 商品: [{ 名称: '隔离商品', 价格: 12, 类别: '工具', 描述: '测试', 稀有: false }] })
        : block([]);
    };
    await e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '沿用此条消息' });
    assert.deepEqual(sent(e), [['variables','primary'], ['variables','backup']]);
    assert.equal(Object.values(e.state().手机.原文.消息)
      .filter(m => m.内容块.some(part => part.正文 === '沿用此条消息')).length, 1);
    await e.runtime.novelAction({ kind: 'enable', operationId: 'enable' });
    await e.runtime.novelRefresh('shop');
    assert.deepEqual(sent(e).slice(2), [['novel','primary'], ['novel','backup']]);
    assert.equal(Object.values(e.state().奇遇系统._商店商品).length, 1);
  }, undefined, settings());
});

test('关闭时只请求首选，开启且全部失败时报告最后的连接', async () => {
  for (const enabled of [false, true]) {
    const api = { ...connections, autoFailover: enabled };
    await withEnv(async e => {
      e.update = async () => { throw limited(); };
      await assert.rejects(e.runtime.send('失败请求'), enabled ? /全部 2 个 API.*第二条.*Too Many Requests/ : /Too Many Requests/);
      assert.deepEqual(sent(e), [['story','main'], ['variables','primary'], ...(enabled ? [['variables','backup']] : [])]);
    }, undefined, settings({ variable: api }));
  }
});

test('线路轮换耗尽后才计一次额外重试', async () => {
  await withEnv(async e => {
    let count = 0;
    e.update = async () => { if (++count < 3) throw limited(); return block([]); };
    await e.runtime.send('重试一轮');
    assert.deepEqual(sent(e), [['story','main'], ['variables','primary'], ['variables','backup'], ['variables','primary']]);
  }, undefined, settings({ variable: { ...connections, retries: 1 } }));
});

test('手动停止、源消息变化、请求准备和业务校验错误均不会转发到备用', async () => {
  for (const fault of ['stop', 'source', 'prepare', 'result']) {
    await withEnv(async e => {
      e.update = async () => {
        if (fault === 'stop') { e.runtime.stop(); throw limited(); }
        if (fault === 'source') { e.messages[1].message = '玩家已更改原文'; throw limited(); }
        if (fault === 'prepare') throw Error('模板展开失败');
        return '无有效的 JSON 文档';
      };
      await assert.rejects(e.runtime.send('准备请求'));
      assert.deepEqual(sent(e), [['story','main'], ['variables','primary']], fault);
    }, undefined, settings());
  }
});
