const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { environment, createRuntime, copy, block, patch, endpoint } = require('./修复宿主.cjs');
const { preparePromptWorldbook, variableRuleText, variableRuleContent, createPromptRequestContext } = require('../运行/prompt-context.ts');
const format = fs.readFileSync(path.join(__dirname, '../世界书/变量/变量输出格式.yaml'), 'utf8');
const oldFormat = `变量输出格式:
  rule:
    - '回复只写一个 JSON 对象，唯一字段 JSONPatch 是补丁数组序列化后的字符串。对象前后不写计划、解释、正文或代码围栏。'
    - 用户修改过的已有规则保留。
    - '没有变化时直接返回 {"JSONPatch":"[]"}。'
  format: |-
    {"JSONPatch":"[]"}
`;

async function run(independent, check) {
  const e = environment(undefined, { characterAuto: false, informationAuto: false, variable: { ...endpoint('variable'), independent } });
  e.rules[0].content = '用户保留的更新规则 UNIQUE_RULE';
  e.rules[1].content = format;
  await e.runtime.start();
  try { await check(e); } finally { await e.runtime.dispose(); }
}

test('同次正文从开启的原生世界书读取规则与格式各一次，保留用户位置', async () => {
  await run(false, async e => {
    assert(e.rules.every(entry => entry.enabled));
    e.rules[0].position = { type: 'before_character_definition', order: 14730 };
    e.rules[1].position = { type: 'after_character_definition', order: 14740 };
    await preparePromptWorldbook(true);
    const positions = copy(e.rules.map(entry => entry.position));
    e.story = async () => '正文' + block([patch('/玩家/当前状态/体力值', 79)]);
    await e.runtime.send('观察');
    const config = e.calls[0].config;
    assert.equal(config.injects, undefined);
    const messages = config.finalMessages;
    assert.equal(messages.filter(message => message.content.includes('UNIQUE_RULE')).length, 1);
    assert.equal(messages.filter(message => message.content.includes('正文同次:')).length, 1);
    assert(!JSON.stringify(messages).includes('本次执行变量更新（后台结算）'));
    assert.deepEqual(e.rules.map(entry => entry.position), positions);
    assert.equal(e.calls.length, 1);
  });
});

test('独立模式关闭原生规则，后台显式读取可编辑格式并只附一份任务职责', async () => {
  await run(true, async e => {
    assert(e.rules.every(entry => !entry.enabled));
    await e.runtime.send('观察');
    const [story, worker] = e.calls.map(call => call.config);
    assert(!JSON.stringify(story.finalMessages).includes('UNIQUE_RULE'));
    assert.equal(worker.finalMessages.filter(message => message.content.includes('UNIQUE_RULE')).length, 1);
    assert.equal(worker.finalMessages.filter(message => message.content.includes('本次执行变量更新（后台结算）')).length, 1);
    assert.equal(worker.injects.length, 2);
  });
});

test('保存切换及读取共用设置会同步两条规则开关，其他通道不改开关', async () => {
  await run(false, async e => {
    const save = independent => e.runtime.saveSettings({ variable: { ...e.runtime.settings.variable, independent } }, 'variable');
    await save(true);
    assert(e.rules.every(entry => !entry.enabled));
    e.runtime.settings.variable.independent = false;
    e.rules.forEach(entry => { entry.enabled = true; });
    await e.runtime.reloadSettings('variable');
    assert.equal(e.runtime.settings.variable.independent, true);
    assert(e.rules.every(entry => !entry.enabled));
    await save(false);
    assert(e.rules.every(entry => entry.enabled));
    const writes = e.ruleWrites;
    await e.runtime.reloadSettings('information');
    assert.equal(e.ruleWrites, writes);
  });
});

test('规则保存失败清楚抛出，保留已落盘设置，再启动按已保存设置恢复', async () => {
  await run(true, async e => {
    const update = global.updateWorldbookWith;
    global.updateWorldbookWith = async () => { throw Error('世界书磁盘写入失败'); };
    try {
      await assert.rejects(e.runtime.saveSettings({ variable: { ...e.runtime.settings.variable, independent: false } }, 'variable'), /世界书磁盘写入失败/);
      assert.equal(e.runtime.settings.variable.independent, false);
      assert.equal(e.sharedFiles.get('/user/files/valoran-v1-api-variable.json').value.independent, false);
      assert(e.rules.every(entry => !entry.enabled));
    } finally { global.updateWorldbookWith = update; }
    await e.runtime.dispose();
    e.runtime = createRuntime();
    await e.runtime.start();
    assert.equal(e.runtime.settings.variable.independent, false);
    assert(e.rules.every(entry => entry.enabled));
  });
});

test('旧模板仅迁移输出合同，保留用户追加规则、位置及自定义格式，重复准备不写', async () => {
  const e = environment();
  e.rules[1].content = oldFormat + '\n用户追加规则应保留。';
  const position = copy(e.rules[1].position);
  await preparePromptWorldbook(true);
  assert(e.rules[1].content.includes('正文同次:'));
  assert(e.rules[1].content.includes('用户追加规则应保留。'));
  assert(e.rules[1].content.includes('用户修改过的已有规则保留。'));
  assert.deepEqual(e.rules[1].position, position);
  const writes = e.ruleWrites;
  await preparePromptWorldbook(true);
  assert.equal(e.ruleWrites, writes);
  e.rules[1].content = '# {{valoran_variables}}\n用户完全自定义的输出合同\n# {{valoran_variables_end}}\n';
  const custom = e.rules[1].content;
  await preparePromptWorldbook(false);
  assert.equal(e.rules[1].content, custom);
  assert(e.rules.every(entry => !entry.enabled));
});

test('手机后台、资料与奇遇上下文隐藏原生规则，同次与普通原生入口展开且不含后台任务', async () => {
  const e = environment();
  const wrapped = format.trim();
  for (const purpose of ['story', 'variables', 'knowledge', 'novel']) {
    assert.equal(createPromptRequestContext({ purpose, state: e.state() }).expandPrompt(wrapped), '');
  }
  const inline = createPromptRequestContext({ purpose: 'inline', state: e.state() }).expandPrompt(wrapped);
  assert(inline.includes('正文同次:'));
  assert(!inline.includes('本次执行变量更新（后台结算）'));
  assert(variableRuleText(format).includes('正文同次:'));
  assert(variableRuleContent(format).includes('本次执行变量更新（后台结算）'));
});

test('派生世界书格式内容与维护源一致且后台JSON示例合法', () => {
  const book = JSON.parse(fs.readFileSync(path.join(__dirname, '../瓦洛兰.worldbook.json'), 'utf8'));
  assert.equal(Object.values(book.entries).find(entry => entry.comment === '[mvu_update]变量输出格式').content, format);
  const contract = require('yaml').parse(format).变量输出格式;
  assert(Array.isArray(contract.正文同次));
  assert(Array.isArray(JSON.parse(JSON.parse(contract.后台结算示例).JSONPatch)));
  assert(!contract.正文同次.some(line => line.includes('没有变化时写 []')));
  assert(!contract.rule.some(line => line.includes('没有变化时直接返回')));
});

test('迁移只改官方字段内的旧句，完整引文与已有的自定义同次格式保留', async () => {
  const e = environment();
  const oldGeneral = '下列类型描述保存后的字段，不是每轮填写清单。新增认知记实际来源，性质变化须有新依据。';
  const oldDebt = '仅有实际借款、欠款、待退款、应收应付时建立，保存对象、金额与条件；实际清偿或取消才改状态，并引用对应交易。不计入当前金币余额，不再另存获知来源。';
  const citation = '引用:\n  旧规则: |-\n    ' + oldGeneral + '\n';
  e.rules[0].content = citation + '变量更新规则:\n  通用约定: |-\n    ' + oldGeneral +
    '\n  玩家:\n    资金:\n      对照:\n        check:\n          - ' + oldDebt +
    '\n      未结事项:\n        check:\n          - ' + oldDebt;
  const formatCitation = '自定义:\n  引文:\n' + oldFormat.split('\n')[2] + '\n';
  e.rules[1].content = formatCitation + oldFormat.replace('  rule:', '  正文同次: [保留此格式]\n  rule:');
  await preparePromptWorldbook(true);
  assert(e.rules[0].content.includes(citation));
  assert(e.rules[1].content.includes(formatCitation));
  const { parse } = require('yaml');
  const rules = parse(e.rules[0].content).变量更新规则;
  assert(rules.通用约定.includes('保留原来的主语'));
  assert.deepEqual(rules.玩家.资金.对照.check, [oldDebt]);
  assert.equal(rules.玩家.资金.未结事项.check.length, 2);
  const format = parse(e.rules[1].content).变量输出格式;
  assert.deepEqual(format.正文同次, ['保留此格式']);
  assert(format.rule[0].startsWith('本轮为后台变量结算时'));
  const writes = e.ruleWrites;
  await preparePromptWorldbook(true);
  assert.equal(e.ruleWrites, writes);
});

test('后台示例排在规则列表之前时，插入同次节仍保留后台示例和规则', async () => {
  const e = environment();
  const exampleStart = oldFormat.indexOf('  format:');
  e.rules[1].content = '变量输出格式:\n' + oldFormat.slice(exampleStart) + oldFormat.slice(oldFormat.indexOf('  rule:'), exampleStart);
  await preparePromptWorldbook(true);
  const format = require('yaml').parse(e.rules[1].content).变量输出格式;
  assert.equal(format.后台结算示例, '{"JSONPatch":"[]"}');
  assert.equal(format.正文同次.length, 3);
  assert.equal(format.rule[1], '用户修改过的已有规则保留。');
});

for (const newline of ['\n', '\r\n']) test('迁移只更新发布规则行，保留前置嵌套示例及同文用户说明/' + JSON.stringify(newline), async () => {
  const e = environment();
  const custom = '用户自己的嵌套示例内容';
  const description = '没有变化时直接返回用户原话';
  const original = '回复只写一个 JSON 对象，唯一字段 JSONPatch 是补丁数组序列化后的字符串。对象前后不写计划、解释、正文或代码围栏。';
  const source = '用户自定义:\n  变量输出格式:\n    format: |-\n      ' + custom + '\n' +
    oldFormat.replace('变量输出格式:\n', '变量输出格式:\n  用户示例:\n    format: |-\n      ' + custom +
      '\n  用户说明: ' + description + '\n  原句引用: ' + original + '\n');
  e.rules[1].content = source.replaceAll('\n', newline);
  await preparePromptWorldbook(true);
  const parsed = require('yaml').parse(e.rules[1].content);
  assert.deepEqual(parsed.用户自定义, { 变量输出格式: { format: custom } });
  const contract = parsed.变量输出格式;
  assert.deepEqual(contract.用户示例, { format: custom });
  assert.equal(contract.用户说明, description);
  assert.equal(contract.原句引用, original);
  assert.equal(contract.format, undefined);
  assert.equal(contract.后台结算示例, '{"JSONPatch":"[]"}');
  assert(!contract.rule.some(line => line.includes('没有变化时直接返回')));
  assert(!contract.正文同次.some(line => line.includes('没有变化时写 []')));
  assert(contract.rule.includes('本轮为后台变量结算时，' + original));
  assert.equal(contract.正文同次.length, 3);
  const before = e.rules[1].content, writes = e.ruleWrites;
  await preparePromptWorldbook(true);
  assert.equal(e.rules[1].content, before);
  assert.equal(e.ruleWrites, writes);
});

test('已迁移的同次和后台格式删除两处旧提示，保留用户引文、注释与段落格式', async () => {
  const e = environment();
  const oldInline = 'JSONPatch 内直接写 JSON 数组；没有变化时写 []。正文中的说明和代码示例不作为变量更新。';
  const currentInline = 'JSONPatch 内直接写 JSON 数组。正文中的说明和代码示例不作为变量更新。';
  const oldWorker = '后台结算没有变化时直接返回 {"JSONPatch":"[]"}。';
  const common = ['# {{valoran_variables}}', '---', '变量输出格式:', '  正文同次:'];
  const tail = ['    - 保留另一条。', '  用户引文:', '    - ' + oldInline, "    - '" + oldWorker + "'", '# {{valoran_variables_end}}', ''];
  const old = [...common, "    - '" + oldInline + "' # 同次规则", '  rule:', '    # 后台规则',
    "    - '" + oldWorker + "' # 作者注释", ...tail].join('\r\n');
  const expected = [...common, "    - '" + currentInline + "' # 同次规则", '  rule:', '    # 后台规则',
    '     # 作者注释', ...tail].join('\r\n');
  e.rules[1].content = old;
  await preparePromptWorldbook(true);
  assert.equal(e.rules[1].content, expected);
  const writes = e.ruleWrites;
  await preparePromptWorldbook(true);
  assert.equal(e.ruleWrites, writes);
});
