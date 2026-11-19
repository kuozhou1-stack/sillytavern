const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { environment, createRuntime, copy, block, patch } = require('./修复宿主.cjs');
const output = process.env.VALORAN_RECOVERY_OUTPUT || fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'valoran-recovery-'));
fs.mkdirSync(output, { recursive: true });
let sequence = 0;

async function isolated(run) {
  const e = environment(), save = e.saveDisk;
  e.diskFile = path.join(output, `save-${++sequence}.jsonl`);
  e.saveDisk = () => {
    save();
    fs.writeFileSync(e.diskFile, e.diskChat.map(row => JSON.stringify(row)).join('\n') + '\n');
  };
  e.readFile = () => fs.readFileSync(e.diskFile, 'utf8').trim().split('\n').map(JSON.parse);
  e.readDisk = () => Response.json(e.readFile());
  e.saveDisk();
  await e.runtime.start();
  try { await run(e); } finally { await e.runtime.dispose(); }
}
async function reopen(e) {
  await e.runtime.dispose();
  const disk = e.readFile();
  e.vars = copy(disk[0].chat_metadata.variables);
  e.messages = disk.slice(1).map(row => ({ role: row.is_user ? 'user' : 'assistant', message: row.mes,
    data: copy(row.variables[row.swipe_id ?? 0]), extra: copy(row.extra), swipe_id: row.swipe_id,
    swipes: row.swipes, swipe_info: row.swipe_info, swipes_data: row.swipes ? row.variables : undefined }));
  e.runtime = createRuntime();
  await e.runtime.start();
}
async function alternate(e) {
  const row = e.messages[2], other = copy(row.data), extra = copy(row.extra);
  other.stat_data._系统.候选回复id = '1';
  other.stat_data._系统.分支id = e.chat + ':2:1';
  extra.cw_story_settlements = { '1': { ...extra.cw_story_settlements['0'], swipe: 1 } };
  await setChatMessages([{ message_id: 2, swipe_id: 0, swipes: [row.message, '其他已结算候选'],
    swipes_data: [copy(row.data), other], swipes_info: [{ ...copy(row.extra), plugin: 'retained' }, extra] }]);
  e.saveDisk();
}
function interrupt(e, match) {
  const save = e.saveDisk;
  let failed = false;
  e.saveDisk = () => {
    save();
    if (!failed && match(e.vars.澄湾待确认提交)) {
      failed = true;
      throw Error('受控journal确认中断');
    }
  };
  return () => { e.saveDisk = save; };
}
function trace(label, e) {
  console.log(JSON.stringify({ label, pending: e.vars.澄湾待更新正文?.id ?? null,
    phone: e.vars.澄湾待更新手机?.id ?? null, failed: e.vars.澄湾失败请求?.id ?? null,
    journal: e.vars.澄湾待确认提交?.commitId ?? null,
    queue: (e.vars.澄湾排队操作 ?? []).map(item => item.id), canAutoRead: e.runtime.view.canAutoRead,
    managementPending: e.runtime.view.managementPending, error: e.runtime.view.error }));
}
async function prepareFailure(e) {
  await e.runtime.saveSettings({ characterAuto: true, characterRoster: {
    majorLimit: 6, minorLimit: 1, majorRotation: 0, minorRotation: 0,
  } }, 'general');
  const restore = interrupt(e, journal => String(journal?.commitId).startsWith('character_roster_'));
  await assert.rejects(e.runtime.send('第二轮准备'), /journal确认中断/);
  restore();
  assert.equal(e.vars.澄湾待确认提交.replyFloor, undefined);
  assert.equal(e.vars.澄湾待确认提交.context.floor, 2);
  return copy(e.vars.澄湾待确认提交);
}

for (const entry of ['desktop', 'native-cold', 'desktop-tagged', 'native-cold-tagged']) test(`编辑T0到T1后改回T0关闭待结算并保留同楼事务/${entry}`, async () => {
  await isolated(async e => {
    await e.runtime.send('首次行动');
    await e.runtime.commit(state => { state.玩家.姓名 = '同楼独立提交'; }, 'independent-local');
    await alternate(e);
    const original = e.messages[2].message, state = copy(e.messages[2].data), other = copy(e.messages[2].swipes_data[1]);
    await e.runtime.messageAction('edit', 2, '第一次修改T1');
    const replacement = entry.endsWith('-tagged') ? '（第2楼）\n' + original : original;
    if (entry.startsWith('native-cold')) {
      await reopen(e);
      await setChatMessages([{ message_id: 2, message: replacement }]);
      await e.listeners.get('edited')(2);
    } else await e.runtime.messageAction('edit', 2, replacement);
    trace(entry, e);
    assert.equal(e.vars.澄湾待更新正文, null);
    assert.equal(e.runtime.view.canAutoRead, true);
    assert.equal(e.messages[2].message, original);
    assert.deepEqual(e.messages[2].data, state);
    assert.deepEqual(e.messages[2].swipes_data[1], other);
    await reopen(e);
    assert.equal(e.vars.澄湾待更新正文, null);
    assert.equal(e.state().玩家.姓名, '同楼独立提交');
    assert(e.state()._系统.提交记录['independent-local']);
  });
});

for (const action of ['delete-base', 'delete-input', 'reroll', 'native-swipe']) test(`准备journal无replyFloor时放弃原来源/${action}`, async () => {
  await isolated(async e => {
    await e.runtime.send('首次行动');
    await e.runtime.commit(state => { state.玩家.姓名 = '准备前独立提交'; }, 'before-preparation');
    await alternate(e);
    const original = copy(e.messages[2].data);
    const journal = await prepareFailure(e), failedId = e.vars.澄湾失败请求.id;
    if (action === 'delete-base') await e.runtime.messageAction('delete', 2);
    if (action === 'delete-input') await e.runtime.messageAction('delete', 3);
    if (action === 'reroll') {
      await e.runtime.saveSettings({ characterAuto: false }, 'general');
      e.story = async () => { throw Error('新的正文失败'); };
      await assert.rejects(e.runtime.messageAction('ai_reroll', 2), /新的正文失败/);
    }
    if (action === 'native-swipe') {
      await setChatMessages([{ message_id: 2, swipe_id: 1 }]);
      await e.listeners.get('swipe')(2);
    }
    trace(action, e);
    assert.equal(e.vars.澄湾待确认提交, null);
    assert.notEqual(e.vars.澄湾失败请求?.id, failedId);
    assert(!e.vars.澄湾排队操作.some(item => item.id === failedId || item.id === journal.commitId));
    if (['delete-input', 'native-swipe'].includes(action)) assert.deepEqual(e.messages[2].swipes_data[0], original);
    await reopen(e);
    assert.equal(e.vars.澄湾待确认提交, null);
    if (action === 'reroll') {
      e.story = async () => '新请求重试成功';
      await e.runtime.retry();
    } else await e.runtime.commit(state => { state.玩家.当前状态.体力值 = 78; });
  });
});

for (const action of ['delete', 'native-swipe']) test(`手机已写入但确认中断后关闭所属journal/${action}`, async () => {
  await isolated(async e => {
    await e.runtime.send('首次行动');
    await alternate(e);
    e.update = async () => block([patch('/玩家/当前状态/体力值', 79)]);
    const restore = interrupt(e, journal => journal?.commitId === e.vars.澄湾待更新手机?.id &&
      !!e.messages[2].data.stat_data._系统.提交记录[journal.commitId]);
    await assert.rejects(e.runtime.phoneAction({ kind: 'send', id: 'chat', text: '手机事务内容' }), /journal确认中断/);
    restore();
    const phoneId = e.vars.澄湾待更新手机.id;
    assert.equal(e.vars.澄湾待确认提交.replyFloor, undefined);
    if (action === 'delete') await e.runtime.messageAction('delete', 2);
    else {
      await setChatMessages([{ message_id: 2, swipe_id: 1 }]);
      await e.listeners.get('swipe')(2);
      assert(e.messages[2].swipes_data[0].stat_data._系统.提交记录[phoneId]);
      assert.equal(e.messages[2].swipes_data[0].stat_data.玩家.当前状态.体力值, 79);
    }
    trace('phone-' + action, e);
    assert.equal(e.vars.澄湾待更新手机, null);
    assert.equal(e.vars.澄湾待确认提交, null);
    await reopen(e);
    assert.equal(e.vars.澄湾待确认提交, null);
    assert.equal(e.runtime.view.canAutoRead, true);
  });
});

test('旧档只有inputSaved排队项时替换玩家输入会关闭原ID', async () => {
  await isolated(async e => {
    e.story = async () => { throw Error('旧请求失败'); };
    await assert.rejects(e.runtime.send('原输入'), /旧请求失败/);
    const originalId = e.vars.澄湾排队操作[0].id;
    assert.equal(e.vars.澄湾排队操作[0].inputSaved, true);
    e.vars.澄湾失败请求 = null;
    e.saveDisk();
    await reopen(e);
    e.story = async () => '新的正文';
    await e.runtime.messageAction('player_send', 1);
    trace('old-intent-replaced', e);
    assert(!e.vars.澄湾排队操作.some(item => item.id === originalId));
    await reopen(e);
    assert.equal(e.runtime.view.canAutoRead, true);
    assert.equal(e.messages.filter(row => row.role === 'user').length, 1);
  });
});

test('无实际变化的候选事件保留准备journal和原请求', async () => {
  await isolated(async e => {
    await e.runtime.send('首次行动');
    const journal = await prepareFailure(e), failed = copy(e.vars.澄湾失败请求);
    await e.listeners.get('swipe')(2);
    assert.deepEqual(e.vars.澄湾待确认提交, journal);
    assert.deepEqual(e.vars.澄湾失败请求, failed);
  });
});

test('准备候选写入后回滚中断，冷开删除玩家楼恢复精确原快照', async () => {
  await isolated(async e => {
    await e.runtime.send('首次行动');
    await e.runtime.commit(state => { state.玩家.姓名 = '回滚前独立事务'; }, 'independent-before-rollback');
    await alternate(e);
    const before = copy(e.messages[2].data), other = copy(e.messages[2].swipes_data[1]);
    await e.runtime.saveSettings({ characterAuto: true, characterRoster: {
      majorLimit: 6, minorLimit: 1, majorRotation: 0, minorRotation: 0,
    } }, 'general');
    const save = e.saveDisk, write = Mvu.replaceMvuData;
    let failedSave = false, failedRollback = false;
    e.saveDisk = () => {
      save();
      const journal = e.vars.澄湾待确认提交;
      if (!failedSave && String(journal?.commitId).startsWith('character_roster_') &&
          e.messages[2].data.stat_data._系统.提交记录[journal.commitId]) {
        failedSave = true;
        throw Error('候选保存响应中断');
      }
    };
    Mvu.replaceMvuData = async (value, options) => {
      if (failedSave && !failedRollback && _.isEqual(value, before)) {
        failedRollback = true;
        throw Error('回滚写入中断');
      }
      await write(value, options);
    };
    await assert.rejects(e.runtime.send('准备后取消'), /回滚写入中断/);
    e.saveDisk = save;
    Mvu.replaceMvuData = write;
    assert.equal(failedRollback, true);
    const id = e.vars.澄湾待确认提交.commitId;
    assert(e.messages[2].data.stat_data._系统.提交记录[id]);
    await reopen(e);
    await e.runtime.messageAction('delete', 3);
    assert.equal(e.vars.澄湾待确认提交, null);
    assert.deepEqual(e.messages[2].data, before);
    assert.deepEqual(e.messages[2].swipes_data[1], other);
    await reopen(e);
    assert.deepEqual(e.messages[2].data, before);
    assert(e.state()._系统.提交记录['independent-before-rollback']);
    assert.equal(e.runtime.view.canAutoRead, true);
  });
});

test('删除其他新增玩家楼会保留独立本地journal及已写入事务', async () => {
  await isolated(async e => {
    await e.runtime.send('首次行动');
    const restore = interrupt(e, journal => journal?.commitId === 'independent-pending' &&
      !!e.messages[2].data.stat_data._系统.提交记录['independent-pending']);
    await assert.rejects(e.runtime.commit(state => { state.玩家.姓名 = '独立本地事务'; }, 'independent-pending'), /journal确认中断/);
    restore();
    const journal = copy(e.vars.澄湾待确认提交);
    await createChatMessages([{ role: 'user', message: '后来追加的玩家楼' }]);
    await e.runtime.messageAction('delete', 3);
    assert.deepEqual(e.vars.澄湾待确认提交, journal);
    assert(e.messages[2].data.stat_data._系统.提交记录['independent-pending']);
    await e.runtime.retry();
    await reopen(e);
    assert.equal(e.state().玩家.姓名, '独立本地事务');
    assert.equal(e.vars.澄湾待确认提交, null);
  });
});

test('关闭准备记录保存失败保留原身份，实体文件重开后可再次关闭', async () => {
  await isolated(async e => {
    await e.runtime.send('首次行动');
    const journal = await prepareFailure(e), failedId = e.vars.澄湾失败请求.id;
    const save = e.saveDisk;
    e.saveDisk = () => { throw Error('关闭记录保存中断'); };
    await assert.rejects(e.runtime.messageAction('delete', 3), /关闭记录保存中断/);
    assert.equal(e.vars.澄湾待确认提交.commitId, journal.commitId);
    assert.equal(e.vars.澄湾失败请求.id, failedId);
    e.saveDisk = save;
    await reopen(e);
    assert.equal(e.vars.澄湾待确认提交.commitId, journal.commitId);
    await e.runtime.messageAction('delete', 3);
    await reopen(e);
    assert.equal(e.vars.澄湾待确认提交, null);
    assert.equal(e.runtime.view.canAutoRead, true);
  });
});

test('资料选择候选已写入时删除原玩家楼，仅关闭恢复身份并保留提交', async () => {
  await isolated(async e => {
    await e.runtime.send('首次行动');
    await e.runtime.saveSettings({ characterAuto: false, informationAuto: true }, 'general');
    e.update = async () => JSON.stringify({ 地点: [], 组织: [] });
    const restore = interrupt(e, journal => String(journal?.commitId).startsWith('information_selection_') &&
      !!e.messages[2].data.stat_data._系统.提交记录[journal.commitId]);
    await assert.rejects(e.runtime.send('第二轮选择资料'), /journal确认中断/);
    restore();
    const journal = copy(e.vars.澄湾待确认提交), written = copy(e.messages[2].data);
    assert.equal(journal.rollbackOnFailure, false);
    assert.equal(journal.replyFloor, undefined);
    await reopen(e);
    await e.runtime.messageAction('delete', 3);
    assert.equal(e.vars.澄湾待确认提交, null);
    assert.equal(e.vars.澄湾失败请求, null);
    assert.deepEqual(e.messages[2].data, written);
    assert(e.messages[2].data.stat_data._系统.提交记录[journal.commitId]);
    await reopen(e);
    assert.equal(e.runtime.view.canAutoRead, true);
    assert.deepEqual(e.messages[2].data, written);
  });
});

for (const saved of [false, true]) test(`改回原文的保存${saved ? '落盘后确认' : '写盘前'}失败按实体文件冷开恢复`, async () => {
  await isolated(async e => {
    await e.runtime.send('首次行动');
    const original = e.messages[2].message;
    await e.runtime.messageAction('edit', 2, '修改T1');
    const id = e.vars.澄湾待更新正文.id, save = e.saveDisk;
    e.saveDisk = () => {
      if (saved) save();
      throw Error('回原文保存确认中断');
    };
    await assert.rejects(e.runtime.messageAction('edit', 2, original), /回原文保存确认中断/);
    assert.equal(e.vars.澄湾待更新正文.id, id);
    assert.equal(e.vars.澄湾待更新正文.editingOriginal.text, original);
    e.saveDisk = save;
    await reopen(e);
    if (!saved) {
      assert.equal(e.messages[2].message, '修改T1');
      assert.equal(e.vars.澄湾待更新正文.id, id);
      await e.runtime.messageAction('edit', 2, original);
      await reopen(e);
    }
    assert.equal(e.messages[2].message, original);
    assert.equal(e.vars.澄湾待更新正文, null);
    assert.equal(e.runtime.view.canAutoRead, true);
  });
});

for (const entry of ['desktop', 'native', 'desktop-numbered-old']) test(`旧档已把T0登记为待结算时同文入口完成撤回/${entry}`, async () => {
  await isolated(async e => {
    await e.runtime.send('首次行动');
    const original = e.messages[2].message;
    await e.runtime.messageAction('edit', 2, '修改T1');
    // 固定旧档形态由修前完整host的T0→T1→T0路径复现，保留其请求身份和原始结算。
    e.vars.澄湾待更新正文.text = original;
    await setChatMessages([{ message_id: 2, message: entry === 'desktop-numbered-old' ? '（第2楼）\n' + original : original }]);
    const hash = require('node:crypto').createHash('sha256').update(original).digest('hex');
    for (const extra of [e.messages[2].extra, e.messages[2].swipe_info[0]]) {
      extra.cw_story_request.narrativeHash = hash;
    }
    e.saveDisk();
    await reopen(e);
    assert(e.vars.澄湾待更新正文);
    if (entry.startsWith('desktop')) await e.runtime.messageAction('edit', 2, original);
    else await e.listeners.get('edited')(2);
    assert.equal(e.vars.澄湾待更新正文, null);
    await reopen(e);
    assert.equal(e.messages[2].message, original);
    assert.equal(e.runtime.view.canAutoRead, true);
  });
});
