const assert = require('node:assert/strict');
const { test } = require('node:test');
const { environment, createRuntime, copy, Schema, block } = require('./修复宿主.cjs');
const { lifeUpdates } = require('./生活更新夹具.cjs');
const { persistChat } = require('../运行/chat-persistence.ts');
const { preparePromptWorldbook, createPromptRequestContext, registerPromptMacros } = require('../运行/prompt-context.ts');
const queue = '澄湾排队操作';

async function reopen(e) {
  await e.runtime.dispose();
  const [header, ...rows] = copy(e.diskChat);
  e.vars = header.chat_metadata.variables;
  e.messages = rows.map(row => ({
    role: row.is_user ? 'user' : 'assistant', message: row.mes,
    data: row.variables?.[row.swipe_id ?? 0] ?? {}, extra: row.extra ?? {},
    swipe_id: row.swipe_id, swipes: row.swipes, swipe_info: row.swipe_info,
    swipes_data: row.swipes ? row.variables : undefined,
  }));
  e.runtime = createRuntime();
  await e.runtime.start();
}

test('切模式基于更新回调的最新世界书，保留并发文字及位置编辑', async () => {
  const e = environment();
  await e.runtime.start();
  const update = global.updateWorldbookWith;
  try {
    global.updateWorldbookWith = async (...args) => {
      e.rules[0].content = '# {{valoran_variables}}\n用户刚保存的规则\n# {{valoran_variables_end}}\n';
      e.rules[0].position.depth = 3;
      return update(...args);
    };
    await e.runtime.saveSettings({ variable: { ...e.runtime.settings.variable, independent: false } }, 'variable');
    assert(e.rules[0].content.includes('用户刚保存的规则'));
    assert.equal(e.rules[0].position.depth, 3);
    assert(e.rules.every(entry => entry.enabled));
  } finally { global.updateWorldbookWith = update; await e.runtime.dispose(); }
});

test('模式已保存但规则同步失败时，发送先补同步；持续故障零玩家楼零模型请求', async () => {
  const e = environment();
  e.rules[0].content = '应发送的更新规则';
  await e.runtime.start();
  const update = global.updateWorldbookWith;
  try {
    global.updateWorldbookWith = async () => { throw Error('世界书保存故障'); };
    await assert.rejects(e.runtime.saveSettings({ variable: { ...e.runtime.settings.variable, independent: false } }, 'variable'), /世界书保存故障/);
    await assert.rejects(e.runtime.send('暂时不能发送'), /世界书保存故障/);
    assert.equal(e.messages.length, 1);
    assert.equal(e.calls.length, 0);
    global.updateWorldbookWith = update;
    e.story = async () => '恢复后的正文' + block([]);
    await e.runtime.send('重新发送');
    assert(e.calls[0].config.finalMessages.some(m => m.content.includes('应发送的更新规则')));
    assert.equal(e.messages.filter(m => m.role === 'user').length, 1);
  } finally { global.updateWorldbookWith = update; await e.runtime.dispose(); }
});

test('混合坏队列保留原值，关闭提示不能绕过读取错误，修复后重读找回合法待办', async () => {
  const e = environment();
  await e.runtime.start();
  try {
    e.update = async () => { throw Error('离线'); };
    await assert.rejects(e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '尚未发送的手机消息' }), /离线/);
    const good = copy(e.vars[queue][0]);
    e.vars.澄湾待更新手机 = null;
    e.vars[queue] = [good, { ...copy(good), id: 'broken', source: null }];
    e.saveDisk();
    const broken = copy(e.vars[queue]);
    await reopen(e);
    assert.match(e.runtime.view.loadError, /待发送操作记录损坏/);
    await assert.rejects(e.runtime.send('不能覆盖原队列'), /待发送操作记录损坏/);
    await assert.rejects(e.runtime.discardPending(), /待发送操作记录损坏/);
    await assert.rejects(e.runtime.send('取消通知后仍不能覆盖'), /待发送操作记录损坏/);
    assert.deepEqual(e.vars[queue], broken);
    assert.deepEqual(e.diskChat[0].chat_metadata.variables[queue], broken);
    e.vars[queue] = [good];
    e.saveDisk();
    await e.runtime.reload();
    assert.equal(e.runtime.view.loadError, '');
    assert.deepEqual(e.runtime.view.recoverable.map(item => item.id), [good.id]);
  } finally { await e.runtime.dispose(); }
});

test('正文保存期间两次手机入队，合法中间序列可确认并继续完成', async () => {
  const e = environment();
  await e.runtime.start();
  const saved = e.saveDisk, jobs = [];
  let once = true;
  e.saveDisk = () => {
    if (!once || e.messages.length !== 2) return saved();
    once = false;
    jobs.push(e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '手机A' }));
    saved();
    jobs.push(e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '手机B' }));
  };
  try {
    await e.runtime.send('本轮行动');
    await Promise.all(jobs);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 3);
    assert.equal(e.calls.filter(call => call.kind === 'story').length, 1);
    assert.deepEqual(e.vars[queue], []);
  } finally { await e.runtime.dispose(); }
});

test('从未保存过队列时，纯追加的中间版本同样可确认', async () => {
  const e = environment();
  const save = e.saveDisk;
  e.saveDisk = () => {
    e.vars[queue] = [{ id: 'first' }];
    save();
    e.vars[queue].push({ id: 'second' });
  };
  await persistChat();
});

test('暖重读发现坏队列后不允许用旧内存队列覆盖存档', async () => {
  const e = environment();
  await e.runtime.start();
  try {
    e.update = async () => { throw Error('待恢复手机'); };
    await assert.rejects(e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '合法待办' }), /待恢复手机/);
    const good = copy(e.vars[queue][0]);
    e.vars[queue].push({ ...good, id: 'bad', source: null });
    e.saveDisk();
    const original = copy(e.vars[queue]);
    await assert.rejects(e.runtime.reload(), /待发送操作记录损坏/);
    assert.throws(() => e.runtime.resumeQueued(good.id), /待发送操作不存在/);
    await e.runtime.cancelQueued('bad');
    assert.deepEqual(e.vars[queue], original);
    assert.deepEqual(e.diskChat[0].chat_metadata.variables[queue], original);
    e.vars[queue] = [good];
    e.saveDisk();
    await e.runtime.reload();
    assert.equal(e.runtime.view.loadError, '');
  } finally { await e.runtime.dispose(); }
});

for (const scenario of ['修改已有项', '陌生项', '丢失原项', '撤回后复活'])
test('保存确认拒绝非纯追加中间队列：' + scenario, async () => {
  const e = environment();
  const a = { id: 'a', text: '原始任务' }, b = { id: 'b' }, c = { id: 'c' };
  e.vars[queue] = [a];
  const saved = e.saveDisk;
  e.saveDisk = () => {
    e.vars[queue] = scenario === '修改已有项' ? [{ ...a, text: '被替换' }, b]
      : scenario === '陌生项' ? [a, { id: 'unknown' }] : scenario === '丢失原项' ? [b] : [a, b];
    saved();
    e.vars[queue] = scenario === '撤回后复活' ? [a, c] : [a, b, c];
  };
  await assert.rejects(persistChat(), /恢复记录与本次保存不一致/);
});

for (const stage of ['候选确认', '最终收尾'])
test('开局' + stage + '失败后冷开重试仍补回执一次且保留同楼独立回执', async () => {
  const e = environment(Schema.parse({}), {
    informationAuto: false, characterAuto: false, variable: { mode: 'main' }, phone: { mode: 'main' },
  });
  await e.runtime.start();
  try {
    await e.runtime.createProfile({ player: { 姓名: '恢复测试' }, characters: [{ id: 'a', 姓名: '甲', 层级: '主要', __imported: true }], details: {} });
    e.update = async () => block(lifeUpdates(e.state()));
    const read = e.readDisk;
    let hit = false, openingId;
    const independent = { commitId: 'other', taskId: 'independent', floor: 2, targets: [], changed: [] };
    e.readDisk = () => {
      const pending = e.vars.澄湾待更新正文;
      if (pending?.openingTaskId) openingId = pending.id;
      const written = e.diskChat[3]?.variables?.[0]?.stat_data?._系统?.提交记录[openingId];
      if (!hit && written && (stage === '候选确认' ? !!pending : !pending)) {
        hit = true;
        return new Response('', { status: 503 });
      }
      return read();
    };
    await assert.rejects(e.runtime.startOpening(), /503/);
    assert(hit);
    e.vars.澄湾更新回执 = [...(e.vars.澄湾更新回执 ?? []), independent];
    e.saveDisk();
    const calls = e.calls.length;
    await reopen(e);
    await e.runtime.retry();
    await assert.rejects(e.runtime.retry(), /没有待恢复提交/);
    assert.equal(e.calls.length, calls);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
    assert.equal(e.vars.澄湾更新回执.filter(r => r.taskId !== 'independent').length, 1);
    assert(e.vars.澄湾更新回执.some(r => r.commitId === independent.commitId));
    assert.equal(e.vars.澄湾待更新正文, null);
    await reopen(e);
    assert.equal(e.runtime.view.updates.length, 1);
  } finally { await e.runtime.dispose(); }
});

test('后台请求持有专用宏期间，页面宏与并发正文均保留自己的状态及规则', async () => {
  const e = environment();
  await e.runtime.start();
  const registered = [];
  global.registerMacroLike = (regex, replacement) => {
    const entry = { regex, replacement };
    registered.push(entry);
    return { unregister() { registered.splice(registered.indexOf(entry), 1); } };
  };
  const stop = registerPromptMacros(() => e.state());
  try {
    const source = '{{valoran_context}}\n# {{valoran_variables}}更新规则# {{valoran_variables_end}}';
    const hidden = createPromptRequestContext({ purpose: 'knowledge', state: e.state() });
    const draft = copy(e.state()); draft.玩家.姓名 = '本次候选';
    const inline = createPromptRequestContext({ purpose: 'inline', state: draft });
    assert.equal(hidden.expandPrompt(source).trim(), '');
    const native = registered.reduce((text, m) => text.replace(m.regex, (match, ...args) => m.replacement({}, match, ...args)), source);
    assert(native.includes('测试玩家') && native.includes('更新规则'));
    assert(!native.includes('本次候选'));
    assert(inline.expandPrompt(source).includes('本次候选'));
    assert.equal(hidden.expandPrompt(source).trim(), '');
  } finally { stop(); await e.runtime.dispose(); }
});

for (const newline of ['\n', '\r\n']) test('旧规则按已发行完整原句迁移并保留自定义文字/' + JSON.stringify(newline), async () => {
  const e = environment();
  const old = '下列类型描述保存后的字段，不是每轮填写清单。新增认知记实际来源，性质变化须有新依据。';
  e.rules[0].content = ['变量更新规则:', '  通用约定: |-', '    ' + old,
    '    用户额外编辑的文字', '  自定义: "' + old + '"'].join(newline);
  await preparePromptWorldbook(true);
  assert(e.rules[0].content.includes('写入变量的每项正文事实都保留原来的主语'));
  assert(e.rules[0].content.includes('    用户额外编辑的文字'));
  assert(e.rules[0].content.includes('  自定义: "' + old + '"'));
  const migrated = e.rules[0].content, writes = e.ruleWrites;
  await preparePromptWorldbook(true);
  assert.equal(e.rules[0].content, migrated);
  assert.equal(e.ruleWrites, writes);
  e.rules[0].content = '变量更新规则:\n  通用约定: |-\n    用户改过的' + old;
  await preparePromptWorldbook(true);
  assert(e.rules[0].content.includes('用户改过的' + old));
  assert(!e.rules[0].content.includes('写入变量的每项正文事实'));
});

test('已发行正式PNG的UID20规则迁移后与当前维护规则语义一致', async () => {
  const fs = require('node:fs'), path = require('node:path'), yaml = require('yaml');
  const png = fs.readFileSync(path.join(__dirname, '../瓦洛兰-正式版.png'));
  let card;
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset), type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'tEXt') {
      const text = png.subarray(offset + 8, offset + 8 + length).toString('utf8');
      if (text.startsWith('ccv3\0')) card = JSON.parse(Buffer.from(text.slice(5), 'base64').toString('utf8'));
    }
    offset += length + 12;
  }
  assert(card);
  const original = card.data.character_book.entries.find(entry => entry.id === 20);
  assert(original);
  const e = environment();
  e.rules[0].content = original.content;
  await preparePromptWorldbook(true);
  const current = fs.readFileSync(path.join(__dirname, '../世界书/变量/变量更新规则.yaml'), 'utf8');
  assert.deepEqual(yaml.parse(e.rules[0].content), yaml.parse(current));
});
