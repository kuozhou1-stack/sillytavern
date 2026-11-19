const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { environment, createRuntime, copy, block, deferred, until } = require('./修复宿主.cjs');
const { installNativeControls } = require('../脚本/流式同层/native-controls.ts');
const output = process.env.VALORAN_RECOVERY_OUTPUT || fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'valoran-recovery-'));
fs.mkdirSync(output, { recursive: true });
let index = 0;
async function isolated(run) {
  const e = environment();
  const save = e.saveDisk;
  e.diskFile = path.join(output, `regression-save-${++index}.jsonl`);
  e.saveDisk = () => {
    save();
    fs.writeFileSync(e.diskFile, e.diskChat.map(row => JSON.stringify(row)).join('\n') + '\n');
  };
  e.readFile = () => fs.readFileSync(e.diskFile, 'utf8').trim().split('\n').map(row => JSON.parse(row));
  e.readDisk = () => Response.json(e.readFile());
  e.saveDisk();
  await e.runtime.start();
  try { await run(e); } finally { await e.runtime.dispose(); }
}
async function reopen(e) {
  await e.runtime.dispose();
  const saved = e.readFile();
  e.vars = copy(saved[0].chat_metadata.variables);
  e.messages = saved.slice(1).map(row => ({ role: row.is_user ? 'user' : 'assistant', message: row.mes,
    data: copy(row.variables[row.swipe_id ?? 0]), extra: copy(row.extra), swipe_id: row.swipe_id,
    swipes: row.swipes, swipe_info: row.swipe_info, swipes_data: row.swipes ? row.variables : undefined }));
  e.runtime = createRuntime();
  await e.runtime.start();
}
async function alternate(e) {
  const row = e.messages[2], second = copy(row.data), extra = copy(row.extra);
  second.stat_data._系统.候选回复id = '1';
  second.stat_data._系统.分支id = e.chat + ':2:1';
  extra.cw_story_settlements = { '1': { ...extra.cw_story_settlements['0'], swipe: 1 } };
  await setChatMessages([{ message_id: 2, swipe_id: 0, swipes: [row.message, '另一已结算正文'],
    swipes_data: [copy(row.data), second], swipes_info: [{ extra: copy(row.extra), plugin: 'original' }, extra] }]);
}
function interruptJournal(e) {
  const save = e.saveDisk;
  let interrupted = false;
  e.saveDisk = () => {
    save();
    if (!interrupted && e.vars.澄湾待确认提交?.replyFloor === 2) {
      interrupted = true;
      throw Error('模拟正文journal保存确认中断');
    }
  };
}

test('正文失败后的本地已读被拒绝，原输入、错误、版本和重试身份跨重开保留', async () => {
  await isolated(async e => {
    assert.equal(e.runtime.view.canAutoRead, true);
    e.story = async () => { throw Error('模拟正文网络失败'); };
    await assert.rejects(e.runtime.send('去桥边'), /网络失败/);
    const id = e.vars.澄湾失败请求.id, original = copy(e.vars.澄湾失败请求);
    const error = e.runtime.view.error, version = e.state()._系统.数据版本;
    for (const restarted of [false, true]) {
      if (restarted) await reopen(e);
      const currentError = e.runtime.view.error;
      assert.equal(e.runtime.view.canAutoRead, false);
      await assert.rejects(e.runtime.commit(s => { s.玩家.姓名 = '已读不应执行'; }), /恢复未确认提交/);
      assert.deepEqual(e.vars.澄湾失败请求, original);
      assert.equal(e.runtime.view.error, currentError);
      assert.equal(e.state()._系统.数据版本, version);
    }
    assert.match(error, /网络失败/);
    e.story = async () => '网络恢复后正文';
    await e.runtime.retry();
    assert(e.state()._系统.提交记录[id]);
    assert.equal(e.messages.filter(row => row.role === 'user').length, 1);
    assert.equal(e.runtime.view.canAutoRead, true);
    await e.runtime.commit(s => { s.玩家.姓名 = '正常本地提交'; });
    assert.equal(e.readFile().at(-1).variables[0].stat_data.玩家.姓名, '正常本地提交');
  });
});

test('普通错误不阻止自动已读，journal和只读会阻止', async () => {
  await isolated(async e => {
    await assert.rejects(e.runtime.commit(() => { throw Error('普通输入错误'); }), /普通输入错误/);
    assert.equal(e.runtime.view.canAutoRead, true);
    await e.runtime.commit(s => { s.玩家.姓名 = '恢复正常'; });
    e.vars.澄湾待确认提交 = { context: e.runtime.service.host.context(), commitId: 'journal-only',
      candidate: copy(e.state()), rollbackOnFailure: true };
    e.runtime.refresh();
    assert.equal(e.runtime.view.canAutoRead, false);
    await assert.rejects(e.runtime.commit(() => {}), /恢复未确认提交/);
    e.vars.澄湾待确认提交 = null;
    e.runtime.view.readOnly = true;
    e.runtime.refresh();
    assert.equal(e.runtime.view.canAutoRead, false);
  });
});

for (const cold of [false, true]) test(`连续编辑撤回恢复首次原文和同楼后续事务${cold ? '，冷开并仅靠楼层记录恢复' : ''}`, async () => {
  await isolated(async e => {
    await e.runtime.send('第一次行动');
    await e.runtime.commit(s => { s.玩家.姓名 = '同楼后续事务'; }, 'later-local');
    await alternate(e);
    const original = e.messages[2].message, data = copy(e.messages[2].data), other = copy(e.messages[2].swipes_data[1]);
    await e.runtime.messageAction('edit', 2, '第一次修改');
    const id = e.vars.澄湾待更新正文.id;
    await e.runtime.messageAction('edit', 2, '第二次修改');
    assert.equal(e.vars.澄湾待更新正文.id, id);
    assert.equal(e.vars.澄湾待更新正文.editingOriginal.text, original);
    if (cold) {
      e.vars.澄湾待更新正文 = null;
      e.saveDisk();
      await reopen(e);
      assert.equal(e.vars.澄湾待更新正文.id, id);
    }
    await e.runtime.discardPending();
    assert.equal(e.messages[2].message, original);
    assert.deepEqual(e.messages[2].data, data);
    assert.deepEqual(e.messages[2].swipes_data[1], other);
    assert.equal(e.messages[2].swipe_info[0].plugin, 'original');
    assert.equal(e.vars.澄湾待更新正文, null);
    await reopen(e);
    assert.equal(e.messages[2].message, original);
    assert.equal(e.state().玩家.姓名, '同楼后续事务');
    assert(e.state()._系统.提交记录['later-local']);
    assert.equal(e.runtime.view.canAutoRead, true);
  });
});

test('撤回保存失败保留编辑恢复依据，再次撤回可读回原文', async () => {
  await isolated(async e => {
    await e.runtime.send('首次行动');
    const original = e.messages[2].message;
    await e.runtime.messageAction('edit', 2, '待撤回的修改');
    const id = e.vars.澄湾待更新正文.id, save = e.saveDisk;
    e.saveDisk = () => { throw Error('模拟撤回保存断开'); };
    await assert.rejects(e.runtime.discardPending(), /保存断开/);
    assert.equal(e.vars.澄湾待更新正文.id, id);
    assert.equal(e.messages[2].message, '待撤回的修改');
    assert.equal(e.runtime.view.canAutoRead, false);
    e.saveDisk = save;
    await e.runtime.discardPending();
    assert.equal(e.readFile().at(-1).mes, original);
    assert.equal(e.readFile()[0].chat_metadata.variables.澄湾待更新正文, null);
  });
});

for (const action of ['delete', 'ai_reroll']) test(`journal建立后${action}关闭旧记录，重roll失败保留新请求`, async () => {
  await isolated(async e => {
    interruptJournal(e);
    await assert.rejects(e.runtime.send('首次行动'), /journal保存/);
    const oldId = e.vars.澄湾待确认提交.commitId;
    if (action === 'ai_reroll') {
      e.story = async () => { throw Error('模拟新的正文失败'); };
      await assert.rejects(e.runtime.messageAction(action, 2), /新的正文失败/);
      assert.notEqual(e.vars.澄湾失败请求.id, oldId);
    } else await e.runtime.messageAction(action, 2);
    assert.equal(e.vars.澄湾待确认提交, null);
    assert.equal(e.vars.澄湾待更新正文, null);
    assert(!e.vars.澄湾排队操作.some(item => item.id === oldId));
    await reopen(e);
    assert.equal(e.vars.澄湾待确认提交, null);
    if (action === 'delete') await e.runtime.commit(s => { s.玩家.姓名 = '删除后可操作'; });
    else {
      e.story = async () => '第二次重试正文';
      await e.runtime.retry();
      assert.equal(e.messages.length, 3);
    }
    assert(!e.messages[0].data.stat_data._系统.提交记录[oldId]);
  });
});

test('仅剩正文journal的旧档删除后能重开管理，重复swipe事件保留有效队列', async () => {
  await isolated(async e => {
    interruptJournal(e);
    await assert.rejects(e.runtime.send('首次行动'), /journal保存/);
    e.vars.澄湾待更新正文 = null;
    delete e.messages[2].extra.cw_story_request;
    delete e.messages[2].extra.cw_update_pending;
    e.saveDisk();
    await reopen(e);
    assert(e.vars.澄湾待确认提交);
    await e.runtime.messageAction('delete', 2);
    await reopen(e);
    await e.runtime.commit(s => { s.玩家.姓名 = '旧档管理'; });
    e.story = async () => { throw Error('下一次正文失败'); };
    await assert.rejects(e.runtime.send('仍在原候选'), /正文失败/);
    const before = copy(e.vars.澄湾排队操作), failed = copy(e.vars.澄湾失败请求);
    await e.listeners.get('swipe')(0);
    assert.deepEqual(e.vars.澄湾排队操作, before);
    assert.deepEqual(e.vars.澄湾失败请求, failed);
  });
});

test('原生候选按钮从待结算编辑切回已结算候选，恢复记录与原候选原文一起保存', async () => {
  await isolated(async e => {
    await e.runtime.send('首次行动');
    await alternate(e);
    const original = e.messages[2].message;
    await e.runtime.messageAction('edit', 2, '待结算编辑');
    interruptJournal(e);
    await assert.rejects(e.runtime.retry(), /journal保存/);
    const handlers = new Map(), failures = [];
    const doc = { addEventListener: (name, fn) => handlers.set(name, fn), removeEventListener() {}, getElementById() { return null; } };
    const remove = installNativeControls({ doc, host: { setInterval() {}, clearInterval() {}, location: {} },
      chat: e.chat, currentChat: () => e.chat, runtime: () => e.runtime, ready: () => true,
      message: id => getChatMessages(id, { include_swipes: true })[0],
      lastMessage: () => getChatMessages(-1)[0], hasPending: () => false, error: text => failures.push(text) });
    const button = { matches: selectors => selectors.split(',').map(s => s.trim()).includes('.swipe_right'),
      closest: () => ({ getAttribute: () => '2' }) };
    handlers.get('click')({ target: { closest: () => button }, preventDefault() {}, stopImmediatePropagation() {} });
    await until(() => failures.length || e.messages[2].swipe_id === 1 && !e.runtime.view.operation);
    remove();
    assert.deepEqual(failures, []);
    assert.equal(e.vars.澄湾待确认提交, null);
    assert.equal(e.vars.澄湾待更新正文, null);
    assert.equal(e.messages[2].swipes[0], original);
    await reopen(e);
    assert.equal(e.messages[2].swipe_id, 1);
    await e.runtime.commit(s => { s.玩家.姓名 = '新候选可操作'; });
  });
});

test('生成中允许纯外观设置，混合业务设置被拒绝，停止手机状态使用新引用', async () => {
  await isolated(async e => {
    const response = deferred();
    e.story = () => response.promise;
    const sending = e.runtime.send('持续生成');
    await until(() => e.runtime.view.busy);
    await e.runtime.saveSettings({ theme: 'dark', fontSize: 18 }, 'general');
    assert.equal(e.runtime.settings.fontSize, 18);
    await assert.rejects(e.runtime.saveSettings({ theme: 'warm', characterAuto: true }, 'general'), /等待当前请求/);
    e.runtime.view.phoneRequest = { id: 'phone-status', status: 'generating' };
    const before = e.runtime.view.phoneRequest;
    e.runtime.stop();
    assert.notEqual(e.runtime.view.phoneRequest, before);
    assert.equal(e.runtime.view.phoneRequest.status, 'stopping');
    response.resolve('停止后的正文');
    await assert.rejects(sending, /停止/);
  });
});

test('首次生成待结算正文保留编辑与重roll恢复，孤立楼层阻止被动提交', async () => {
  await isolated(async e => {
    e.update = async () => { throw Error('模拟变量请求失败'); };
    await assert.rejects(e.runtime.send('首次生成'), /变量请求失败/);
    const id = e.vars.澄湾待更新正文.id;
    await e.runtime.discardPending();
    assert.equal(e.vars.澄湾待更新正文.id, id);
    assert.match(e.runtime.view.error, /缺少可撤回/);
    await e.runtime.messageAction('edit', 2, '修改待结算正文');
    assert.equal(e.vars.澄湾待更新正文.id, id);
    assert.equal(e.vars.澄湾待更新正文.editingOriginal, undefined);
    e.vars.澄湾待更新正文 = null;
    e.vars.澄湾排队操作 = [];
    const extra = e.messages[2].swipe_info[e.messages[2].swipe_id ?? 0];
    delete extra.cw_story_request;
    e.saveDisk();
    await reopen(e);
    assert.equal(e.vars.澄湾待更新正文, null);
    assert.equal(e.runtime.view.canAutoRead, false);
    await assert.rejects(e.runtime.commit(() => {}), /恢复未确认提交/);
    e.update = async () => block([]);
    await e.runtime.messageAction('ai_reroll', 2);
    assert.equal(e.runtime.view.canAutoRead, true);
  });
});

for (const action of ['delete', 'ai_reroll']) test(`候选已写入而确认中断时${action}沿原ID确认，不重复变量请求`, async () => {
  await isolated(async e => {
    const save = e.saveDisk;
    let failed = false;
    e.saveDisk = () => {
      save();
      const journal = e.vars.澄湾待确认提交;
      if (!failed && journal?.replyFloor === 2 && e.messages[2]?.data?.stat_data?._系统.提交记录[journal.commitId]) {
        failed = true;
        throw Error('模拟候选确认中断');
      }
    };
    await assert.rejects(e.runtime.send('已经写入候选'), /候选确认中断/);
    const id = e.vars.澄湾待更新正文.id, updates = e.calls.filter(c => c.kind === 'update').length;
    await e.runtime.messageAction(action, 2);
    assert.equal(e.vars.澄湾待确认提交, null);
    assert.equal(e.vars.澄湾待更新正文, null);
    assert.equal(e.calls.filter(c => c.kind === 'update').length, updates + (action === 'delete' ? 0 : 1));
    assert(!e.vars.澄湾排队操作.some(item => item.id === id));
    await reopen(e);
    assert.equal(e.vars.澄湾待确认提交, null);
  });
});

test('关闭已删除回复的恢复记录保存失败后仍可重开恢复', async () => {
  await isolated(async e => {
    interruptJournal(e);
    await assert.rejects(e.runtime.send('首次行动'), /journal保存/);
    const id = e.vars.澄湾待确认提交.commitId, save = e.saveDisk;
    e.saveDisk = () => { throw Error('模拟清理恢复记录保存失败'); };
    await assert.rejects(e.runtime.messageAction('delete', 2), /清理恢复记录保存失败/);
    assert.equal(e.vars.澄湾待确认提交.commitId, id);
    assert.equal(e.vars.澄湾待更新正文.id, id);
    e.saveDisk = save;
    await reopen(e);
    await e.runtime.messageAction('delete', 2);
    await reopen(e);
    assert.equal(e.vars.澄湾待确认提交, null);
    assert.equal(e.messages.length, 2);
  });
});

test('外观保存报错后镜像采用实际读回值，读回也失败则保留未确认标记', async () => {
  await isolated(async e => {
    const replace = global.replaceVariables, read = global.getVariables;
    let failRead = false;
    global.replaceVariables = async (value, options) => {
      await replace(value, options);
      if (options.type === 'character') throw Error('模拟保存响应中断');
    };
    global.getVariables = options => {
      if (failRead && options.type === 'character') throw Error('模拟无法读取角色设置');
      return read(options);
    };
    await assert.rejects(e.runtime.saveSettings({ fontSize: 19 }, 'general'), /保存响应中断/);
    assert.equal(e.runtime.settings.fontSize, 19);
    failRead = true;
    await assert.rejects(e.runtime.saveSettings({ fontSize: 20 }, 'general'), error =>
      error.settingsUnconfirmed === true && /保存未确认/.test(error.message));
    failRead = false;
    global.replaceVariables = replace;
    global.getVariables = read;
  });
});

test('旧编辑待办缺少可信原文时保留待办，并继续支持再编辑和重试', async () => {
  await isolated(async e => {
    await e.runtime.send('首次行动');
    await e.runtime.messageAction('edit', 2, '旧档编辑正文');
    const id = e.vars.澄湾待更新正文.id;
    delete e.vars.澄湾待更新正文.editingOriginal;
    delete e.messages[2].swipe_info[0].cw_story_request.editingOriginal;
    e.saveDisk();
    await reopen(e);
    await e.runtime.discardPending();
    assert.equal(e.vars.澄湾待更新正文.id, id);
    assert.match(e.runtime.view.error, /缺少可撤回/);
    await e.runtime.messageAction('edit', 2, '旧档再次编辑');
    await e.runtime.retry();
    assert.equal(e.vars.澄湾待更新正文, null);
    assert.equal(e.messages[2].message, '旧档再次编辑');
  });
});

test('无ID的旧失败请求从玩家楼重新发送时关闭原恢复记录', async () => {
  await isolated(async e => {
    e.story = async () => { throw Error('旧档正文失败'); };
    await assert.rejects(e.runtime.send('旧版输入'), /旧档正文失败/);
    delete e.vars.澄湾失败请求.id;
    e.vars.澄湾排队操作 = [];
    e.saveDisk();
    await reopen(e);
    e.story = async () => '重新发送成功';
    await e.runtime.messageAction('player_send', 1);
    assert.equal(e.vars.澄湾失败请求, null);
    assert.equal(e.messages.length, 3);
  });
});
