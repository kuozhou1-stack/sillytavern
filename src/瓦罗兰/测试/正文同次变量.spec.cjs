const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Schema, environment, copy, block, patch, endpoint, createRuntime, deferred, until } = require('./修复宿主.cjs');
const { lifeUpdates } = require('./生活更新夹具.cjs');

const inlineSettings = { characterAuto: false, informationAuto: false, variable: { independent: false } };
const body = '玩家走到门口，停下来观察走廊。';
const reply = (value = 79) => body + '\n\n' + block([patch('/玩家/当前状态/体力值', value)]);

test('同次多段变量块全部由一次手动解析处理，落楼文本没有可再次执行的块', async () => {
  await withInline(async e => {
    e.story = async () => reply() + '\n' + block([patch('/玩家/称呼', '林先生')]);
    await e.runtime.send('走到门口');
    assert.equal(e.messages[2].message, body);
    assert.equal(e.parses, 1);
    assert.equal(e.state().玩家.称呼, '林先生');
    assert.equal(e.state().玩家.当前状态.体力值, 79);
  });
});

test('预设在变量块之后追加IzumiEdit和占位符时，落楼仍只保留正文及预设内容', async () => {
  await withInline(async e => {
    const suffix = '\n<IzumiEdit>保留预设记录</IzumiEdit>\n<StatusPlaceHolderImpl/>';
    e.story = async () => reply() + suffix;
    await e.runtime.send('走到门口');
    assert.equal(e.messages[2].message, body + suffix);
    assert.equal(e.parses, 1);
    assert.equal(e.calls.length, 1);
    assert.equal(e.state().玩家.当前状态.体力值, 79);
  });
});

async function withInline(run, initial, settings = inlineSettings) {
  const e = environment(initial, settings);
  e.rules.find(entry => entry.name === '[mvu_update]变量输出格式').content = require('node:fs').readFileSync(require('node:path').join(__dirname, '../世界书/变量/变量输出格式.yaml'), 'utf8');
  await e.runtime.start();
  try { await run(e); }
  finally { await e.runtime.dispose(); }
}

async function reopen(e, orphan = false) {
  const saved = copy(e.diskChat);
  await e.runtime.dispose();
  e.vars = saved[0].chat_metadata.variables;
  if (orphan) delete e.vars.澄湾待更新正文;
  e.messages = saved.slice(1).map(message => ({
    role: message.is_user ? 'user' : 'assistant', message: message.mes,
    data: copy(message.variables?.[message.swipe_id ?? 0] ?? {}), extra: copy(message.extra ?? {}),
    swipe_id: message.swipe_id, swipes: message.swipes, swipe_info: message.swipe_info,
    swipes_data: message.swipes ? message.variables : undefined,
  }));
  e.runtime = createRuntime();
  await e.runtime.start();
}

test('同次模式无需独立变量连接，一次正文请求和一次解析完成保存，重开后状态一致', async () => {
  await withInline(async e => {
    e.story = async () => reply();
    await e.runtime.send('走到门口');
    assert.deepEqual(e.calls.map(call => call.stage), ['story']);
    assert.equal(e.parses, 1);
    assert.equal(e.calls[0].config.json_schema, undefined);
    assert.match(JSON.stringify(e.calls[0].config), /<UpdateVariable><JSONPatch>/);
    assert.doesNotMatch(JSON.stringify(e.calls[0].config), /本次执行变量更新（后台结算）/);
    assert.equal(e.state().玩家.当前状态.体力值, 79);
    assert.equal(e.messages[2].message, body);
    assert.equal(e.vars.澄湾待更新正文, null);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
    assert.equal(Object.keys(e.messages[2].extra.cw_story_settlements).length, 1);
    const committed = copy(e.state());
    await reopen(e);
    assert.deepEqual(e.state(), committed);
    assert.equal(e.runtime.settings.variable.independent, false);
    assert.deepEqual(e.calls.map(call => call.stage), ['story']);
  });
});

for (const broken of [
  { name: '缺失', value: body },
  { name: '截断', value: body + '\n<UpdateVariable><JSONPatch>[{"op":"replace"' },
  { name: 'JSON错误', value: body + '\n<UpdateVariable><JSONPatch>[bad]</JSONPatch></UpdateVariable>' },
]) for (const orphan of [false, true]) test(`同次${broken.name}保留原回包，冷恢复${orphan ? '楼层记录' : '聊天待办'}后编辑补块只解析`, async () => {
  await withInline(async e => {
    e.story = async () => broken.value;
    await assert.rejects(e.runtime.send('走到门口'));
    assert.match(e.runtime.view.error, /同次|变量|JSON|Unexpected|位置|格式/);
    assert.equal(e.messages[2].message, body);
    const originalId = e.vars.澄湾待更新正文.id;
    assert.equal(e.vars.澄湾待更新正文.reply, broken.value);
    assert.equal(e.vars.澄湾待更新正文.mode, 'main');
    assert.equal(e.messages[2].extra.cw_story_request.reply, broken.value);
    assert.equal(e.runtime.view.messages.find(message => message.id === 2).editContent, broken.value);
    await reopen(e, orphan);
    assert.equal(e.vars.澄湾待更新正文.id, originalId);
    assert.equal(e.vars.澄湾待更新正文.reply, broken.value);
    await assert.rejects(e.runtime.retry());
    assert.equal(e.calls.length, 1);
    await e.runtime.messageAction('edit', 2, reply());
    await e.runtime.retry();
    assert.equal(e.calls.length, 1);
    assert.equal(e.state().玩家.当前状态.体力值, 79);
    assert.equal(e.messages[2].message, body);
    assert.deepEqual(Object.keys(e.state()._系统.已计轮事件), [originalId]);
  });
});

test('缺省旧配置保持独立请求，保存开关并重开后切回仍使用原流程', async () => {
  await withInline(async e => {
    assert.equal(e.runtime.settings.variable.independent, true);
    await e.runtime.send('原有模式');
    assert.deepEqual(e.calls.map(call => call.stage), ['story', 'variables']);
    await e.runtime.saveSettings({ variable: { ...e.runtime.settings.variable, independent: false } }, 'variable');
    await reopen(e);
    assert.equal(e.runtime.settings.variable.independent, false);
    e.story = async () => reply();
    await e.runtime.send('同次模式');
    assert.deepEqual(e.calls.map(call => call.stage), ['story', 'variables', 'story']);
    await e.runtime.saveSettings({ variable: { ...e.runtime.settings.variable, independent: true } }, 'variable');
    await reopen(e);
    e.story = async () => body;
    await e.runtime.send('切回原模式');
    assert.deepEqual(e.calls.map(call => call.stage), ['story', 'variables', 'story', 'story', 'variables']);
  }, undefined, { characterAuto: false, informationAuto: false, variable: endpoint('variable') });
});

for (const independent of [false, true]) test(`已有待办按生成模式恢复，当前开关已切到${independent ? '同次' : '独立'}`, async () => {
  await withInline(async e => {
    e.story = async () => body;
    e.update = async () => { throw Error('固定变量失败'); };
    await assert.rejects(e.runtime.send('保留待办'));
    const originalId = e.vars.澄湾待更新正文.id;
    const originalMode = independent ? 'extra' : 'main';
    await e.runtime.saveSettings({ variable: { ...e.runtime.settings.variable, independent: !independent } }, 'variable');
    await reopen(e);
    assert.equal(e.vars.澄湾待更新正文.mode, originalMode);
    if (!independent) await e.runtime.messageAction('edit', 2, reply());
    e.update = async () => block([patch('/玩家/当前状态/体力值', 79)]);
    await e.runtime.retry();
    assert.deepEqual(e.calls.map(call => call.stage), independent ? ['story', 'variables', 'variables'] : ['story']);
    assert.deepEqual(Object.keys(e.state()._系统.已计轮事件), [originalId]);
  }, undefined, { ...inlineSettings, variable: { ...endpoint('variable'), independent } });
});

test('同次开局把建档任务放入正文请求并一次提交', async () => {
  await withInline(async e => {
    await e.runtime.createProfile({ player: { 姓名: '同次测试玩家' }, characters: [] });
    e.story = async () => '玩家在住处醒来。\n\n' + block(lifeUpdates(e.state()));
    await e.runtime.startOpening();
    assert.deepEqual(e.calls.map(call => call.stage), ['story']);
    assert.equal(e.parses, 1);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
    const tasks = Object.values(e.state()._系统.任务).filter(task => task.类别 === '建档');
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].状态, '已提交');
    assert.match(e.calls[0].config.user_input, /本轮先完成开场正文/);
    assert.doesNotMatch(e.calls[0].config.user_input, /不重复生成正文/);
    assert.equal(Object.keys(e.messages[2].extra.cw_story_settlements).length, 1);
    assert.equal(e.diskChat.at(-1).variables[0].stat_data._系统.任务[tasks[0].id]?.状态 ?? tasks[0].状态, '已提交');
    await reopen(e);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
  }, Schema.parse({}));
});

test('同次已结算正文再次编辑坏块后，可保留同正文修正变量块', async () => {
  await withInline(async e => {
    e.story = async () => reply();
    await e.runtime.send('走到门口');
    await e.runtime.messageAction('edit', 2, body + '\n' + block([{ op: 'replace', path: '/玩家/当前状态/体力值', value: 'bad' }]));
    await assert.rejects(e.runtime.retry());
    await e.runtime.messageAction('edit', 2, reply(70));
    assert(e.vars.澄湾待更新正文);
    await e.runtime.retry();
    assert.equal(e.state().玩家.当前状态.体力值, 70);
    assert.equal(e.calls.length, 1);
  });
});

test('同次流式停止保留已收到片段，拒绝迟到回包，编辑补全后本地提交', async () => {
  await withInline(async e => {
    const gate = deferred();
    e.story = () => gate.promise;
    const sending = e.runtime.send('走到门口');
    const rejected = assert.rejects(sending, /停止/);
    await until(() => e.calls.length === 1);
    const id = e.calls[0].config.generation_id;
    const fragment = body + '\n<UpdateVariable><JSONPatch>[';
    e.listeners.get('stream')(fragment, id);
    e.runtime.stop();
    e.listeners.get('stream')('迟到内容', id);
    gate.resolve('迟到回包');
    await rejected;
    assert.equal(e.messages[2].message, body);
    assert.equal(e.vars.澄湾待更新正文.reply, fragment);
    assert.equal(e.parses, 0);
    await reopen(e);
    await e.runtime.messageAction('edit', 2, reply());
    await e.runtime.retry();
    assert.equal(e.calls.length, 1);
    assert.equal(e.parses, 1);
    assert.equal(e.state().玩家.当前状态.体力值, 79);
  });
});

test('同次变量缺失可从原消息菜单重新生成，无独立变量请求', async () => {
  await withInline(async e => {
    e.story = async () => body;
    await assert.rejects(e.runtime.send('走到门口'), /缺少/);
    e.story = async () => reply();
    await e.runtime.messageAction('ai_reroll', 2);
    assert.deepEqual(e.calls.map(call => call.stage), ['story', 'story']);
    assert.equal(e.messages.length, 3);
    assert.equal(e.state().玩家.当前状态.体力值, 79);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
  });
});

test('同次提交保存确认中断后重开重试，原始结果只计轮一次且不再请求', async () => {
  await withInline(async e => {
    e.story = async () => reply();
    const readDisk = e.readDisk;
    let fail = true;
    e.readDisk = () => fail && e.messages[2]?.data.stat_data?._系统?.楼层id === 2
      ? new Response('固定保存读回中断', { status: 503 }) : readDisk();
    await assert.rejects(e.runtime.send('走到门口'), /保存|503/);
    assert.equal(e.calls.length, 1);
    fail = false;
    await reopen(e);
    await e.runtime.retry();
    assert.equal(e.calls.length, 1);
    assert.equal(e.parses, 1);
    assert.equal(e.state().玩家.当前状态.体力值, 79);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
    assert.equal(Object.keys(e.messages[2].extra.cw_story_settlements).length, 1);
    assert.equal(e.vars.澄湾待更新正文, null);
  });
});

for (const tag of ['thinking', 'think', 'reasoning', 'Analysis']) test(`同次${tag}示例不吞真实正文，保存重开保持正文和正式变量`, async () => {
  await withInline(async e => {
    const thought = `<${tag}>格式示例\n${block([patch('/玩家/称呼', '计划示例')])}\n稍后输出正文。</${tag}>`;
    e.story = async () => thought + '\n' + reply();
    await e.runtime.send('走到门口');
    assert.equal(e.messages[2].message, thought + '\n' + body);
    assert.equal(e.state().玩家.称呼, null);
    assert.equal(e.state().玩家.当前状态.体力值, 79);
    assert.equal(e.vars.澄湾待更新正文, null);
    await reopen(e);
    assert.equal(e.messages[2].message, thought + '\n' + body);
    assert.equal(e.state().玩家.称呼, null);
    assert.equal(e.state().玩家.当前状态.体力值, 79);
  });
});

for (const [label, wrap] of [
  ['思考中引语提及闭标签', sample => '<thinking>Write "the literal </thinking> token" later.\n' + sample + '\n</thinking>'],
  ['对白中引述完整补丁', sample => '她读出 "示例：' + sample + '"，随后放下了纸。'],
  ['预设HTML包装内的引用行', sample => '<section>\n> ' + sample + '\n</section>'],
  ['普通引用', sample => '> ' + sample + '\n'],
  ['首行缩进代码', sample => '    ' + sample + '\n'],
  ['缩进代码', sample => '示例：\n\n    ' + sample + '\n'],
  ['引用长闭围栏', sample => '> ```json\n> ' + sample + '\n> ````'],
  ['列表内围栏', sample => '- 示例\n\n  ```xml\n  ' + sample + '\n  ```'],
  ['围栏', sample => '```xml\n' + sample + '\n```'],
  ['行内', sample => '`' + sample + '`'],
  ['双反引号跨行', sample => '``先写一个 ` 字符\n' + sample + '\n``'],
  ['长围栏嵌短围栏', sample => '````xml\n```\n' + sample + '\n```\n````'],
  ['波浪围栏', sample => '~~~xml\n```\n' + sample + '\n```\n~~~~'],
]) test(`同次${label}示例原样保存，只有正式变量提交且冷开一致`, async () => {
  await withInline(async e => {
    const example = wrap(block([patch('/玩家/称呼', '代码示例')]));
    e.story = async () => example + '\n' + reply();
    await e.runtime.send('走到门口');
    assert.equal(e.messages[2].message, example + '\n' + body);
    assert.equal(e.state().玩家.称呼, null);
    assert.equal(e.state().玩家.当前状态.体力值, 79);
    await reopen(e);
    assert.equal(e.messages[2].message, example + '\n' + body);
    assert.equal(e.state().玩家.称呼, null);
  });
});

for (const position of ['尾部', '嵌套']) test(`同次${position}非空补丁未结束时不计轮，原待办重开编辑可恢复`, async () => {
  await withInline(async e => {
    const extra = JSON.stringify([patch('/玩家/称呼', '补齐的第二项')]);
    const malformed = position === '尾部'
      ? reply().replace('</UpdateVariable>', '<JSONPatch>' + extra + '</UpdateVariable>')
      : reply().replace('<JSONPatch>', '<JSONPatch>' + extra + '<JSONPatch>');
    e.story = async () => malformed;
    await assert.rejects(e.runtime.send('走到门口'), /JSONPatch.*未结束/);
    const id = e.vars.澄湾待更新正文.id;
    assert.equal(e.vars.澄湾待更新正文.reply, malformed);
    assert.equal(e.parses, 0);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 0);
    assert.notEqual(e.state().玩家.当前状态.体力值, 79);
    await reopen(e);
    assert.equal(e.vars.澄湾待更新正文.id, id);
    assert.equal(e.vars.澄湾待更新正文.reply, malformed);
    await e.runtime.messageAction('edit', 2, reply() + '\n' + block(JSON.parse(extra)));
    await e.runtime.retry();
    assert.equal(e.state().玩家.称呼, '补齐的第二项');
    assert.equal(e.state().玩家.当前状态.体力值, 79);
    assert.deepEqual(Object.keys(e.state()._系统.已计轮事件), [id]);
    assert.equal(e.calls.length, 1);
    await reopen(e);
    assert.equal(e.state().玩家.称呼, '补齐的第二项');
  });
});

test('两个正式块之间的正文保留，两组命令一次提交', async () => {
  await withInline(async e => {
    e.story = async () => '前段正文。\n' + block([patch('/玩家/称呼', '旅客')]) + '\n' + reply();
    await e.runtime.send('走到门口');
    assert.equal(e.messages[2].message, '前段正文。\n' + body);
    assert.equal(e.parses, 1);
    assert.equal(e.state().玩家.称呼, '旅客');
    assert.equal(e.state().玩家.当前状态.体力值, 79);
    await reopen(e);
    assert.equal(e.messages[2].message, '前段正文。\n' + body);
  });
});

for (const wrap of [sample => '<thinking>' + sample + '</thinking>', sample => '```xml\n' + sample + '\n```'])
  test('同次只有思考或代码示例时保留正文并报缺少正式变量，编辑后可恢复', async () => {
    await withInline(async e => {
      const example = wrap(block([patch('/玩家/称呼', '示例')]));
      e.story = async () => example + '\n' + body;
      await assert.rejects(e.runtime.send('走到门口'), /缺少/);
      assert.equal(e.messages[2].message, example + '\n' + body);
      assert.equal(e.parses, 0);
      await reopen(e);
      await e.runtime.messageAction('edit', 2, example + '\n' + reply());
      await e.runtime.retry();
      assert.equal(e.state().玩家.称呼, null);
      assert.equal(e.state().玩家.当前状态.体力值, 79);
      assert.equal(e.calls.length, 1);
    });
  });

test('同次外块只含思考里的补丁时保留待办，重开编辑后只计一轮', async () => {
  await withInline(async e => {
    const sample = JSON.stringify([patch('/玩家/称呼', '思考示例')]);
    const raw = body + '\n<UpdateVariable><thinking><JSONPatch>' + sample + '</JSONPatch></thinking></UpdateVariable>';
    e.story = async () => raw;
    await assert.rejects(e.runtime.send('走到门口'), /缺少正式/);
    assert.equal(e.parses, 0);
    assert.equal(e.state().玩家.称呼, null);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 0);
    await reopen(e);
    assert.equal(e.vars.澄湾待更新正文.reply, raw);
    await e.runtime.messageAction('edit', 2, reply());
    await e.runtime.retry();
    assert.equal(e.calls.length, 1);
    assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 1);
    assert.equal(e.state().玩家.称呼, null);
    assert.equal(e.state().玩家.当前状态.体力值, 79);
  });
});

test('MVU自动写回前恢复待办基线和已结算快照，示例改动不落盘', async () => {
  const e = environment(undefined, inlineSettings);
  const on = global.eventOn, endedListeners = [];
  global.eventOn = (event, listener) => {
    if (event === Mvu.events.VARIABLE_UPDATE_ENDED) endedListeners.push(listener);
    return on(event, listener);
  };
  await e.runtime.start();
  const automaticCandidate = async (base, text) => {
    const variables = copy(base);
    variables.stat_data.玩家.称呼 = '代码示例';
    variables.stat_data._系统.数据版本 = 999;
    variables.display_data = { example: '示例显示数据' };
    variables.delta_data = { example: '示例增量' };
    for (const listener of endedListeners) await listener(variables, copy(base));
    e.listeners.get('mvu-before-save')({ variables, message_content: text });
    return variables;
  };
  const create = global.createChatMessages;
  let received = 0;
  global.createChatMessages = async (rows, options) => {
    await create(rows, options);
    if (rows.at(-1)?.role !== 'assistant') return;
    const message = e.messages.at(-1);
    const variables = await automaticCandidate(e.messages.slice(0, -1).findLast(item => item.data?.stat_data).data, message.message);
    assert.equal(variables.stat_data.玩家.称呼, null);
    assert.notEqual(variables.stat_data._系统.数据版本, 999);
    assert.equal(variables.delta_data?.example, undefined);
    message.data = copy(variables);
    received++;
  };
  try {
    const example = '~~~xml\n' + block([patch('/玩家/称呼', '代码示例')]) + '\n~~~';
    e.story = async () => example + '\n' + reply();
    await e.runtime.send('走到门口');
    assert.equal(received, 1);
    assert.equal(e.state().玩家.当前状态.体力值, 79);
    assert.equal(e.state().玩家.称呼, null);
    const variables = await automaticCandidate(e.messages[0].data, e.messages[2].message);
    assert.deepEqual(variables, e.messages[2].data);
    const previous = copy(e.messages[2].data);
    e.story = async () => example + '\n' + body + '\n' + block([patch('/玩家/当前状态/体力值', 78)]);
    await e.runtime.send('继续走');
    assert.equal(e.messages[4].message, e.messages[2].message);
    const repeated = await automaticCandidate(previous, e.messages[4].message);
    assert.deepEqual(repeated, e.messages[4].data);
    assert.equal(repeated.stat_data.玩家.当前状态.体力值, 78);
    assert.equal(e.listeners.has('commands'), false);
    const unrelated = await automaticCandidate(previous, '未受卡片管理的消息');
    assert.equal(unrelated.stat_data.玩家.称呼, '代码示例');
    assert.equal(unrelated.stat_data._系统.数据版本, 999);
  } finally {
    global.eventOn = on;
    await e.runtime.dispose();
  }
});

test('外部MVU解析同文同基线及其他基线均保留自己的候选结果', async () => {
  const e = environment(undefined, inlineSettings);
  const parser = Mvu.parseMessage;
  await e.runtime.start();
  try {
    const commands = [patch('/玩家/称呼', '外部调用结果')];
    const example = '~~~xml\n' + block(commands) + '\n~~~';
    e.story = async () => example + '\n' + reply();
    await e.runtime.send('走到门口');
    const stored = e.messages[2].message;
    Mvu.parseMessage = async (text, old) => {
      const candidate = copy(old);
      return parser(block(commands), candidate);
    };
    for (const version of [e.messages[0].data.stat_data._系统.数据版本, 100, undefined]) {
      const envelope = copy(e.messages[0].data);
      envelope.stat_data._系统.数据版本 = version;
      const result = await Mvu.parseMessage(stored, envelope);
      assert.equal(result.stat_data.玩家.称呼, '外部调用结果');
      assert.equal(result.stat_data.玩家.当前状态.体力值, envelope.stat_data.玩家.当前状态.体力值);
      assert.equal(envelope.stat_data.玩家.称呼, null);
    }
    assert.equal(e.state().玩家.称呼, null);
    assert.equal(e.state().玩家.当前状态.体力值, 79);
  } finally { await e.runtime.dispose(); }
});
