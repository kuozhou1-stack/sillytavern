const { test } = require('node:test');
const assert = require('node:assert/strict');
const { withEnv, copy, block, patch, createRuntime } = require('./修复宿主.cjs');
const { managePhone } = require('../运行/phone-management.ts');

async function reload(e) {
  await e.runtime.dispose();
  const saved = copy(e.diskChat);
  e.vars = saved[0].chat_metadata.variables;
  e.messages = saved.slice(1).map(row => ({ role: row.is_user ? 'user' : 'assistant', message: row.mes,
    extra: row.extra, swipe_id: row.swipe_id, swipes: row.swipes, swipe_info: row.swipe_info,
    data: row.variables[row.swipe_id ?? 0], swipes_data: row.swipes ? row.variables : undefined }));
  e.runtime = createRuntime(); await e.runtime.start();
}

for (const legacy of [false, true]) for (const via of ['desktop', 'native']) {
  test(`${via}编辑保留同楼三笔业务和完整引用，${legacy ? '旧回执从公开备份取证' : '新回执直接重放'}并可冷恢复`, async () => {
    await withEnv(async e => {
      await e.runtime.commit(s => { s._系统.存档id = 'same_fixture_save'; }, 'initial_identity');
      e.update = async () => block([]); await e.runtime.send('前一轮');
      e.update = async () => block([{ op: 'insert', path: '/手机/原文/消息/incoming', value: {
        会话id: 'chat', 发送账号id: 'npc', 故事时间: e.state().世界.当前时间,
        内容块: [{ 类型: '文字', id: 'incoming_text', 正文: '已确认的通讯内容' }],
      } }]);
      await e.runtime.send('旧正文');
      const originalStory = copy(e.diskChat), oldStory = e.messages[4].extra.cw_story_settlements['0'];
      const noticeIds = Object.keys(e.state().手机._通知); assert(noticeIds.length);
      await e.runtime.commit(s => { for (const id of noticeIds) s.手机._通知[id].已读 = true; }, 'notice_commit');
      await e.runtime.commit(s => managePhone(s, 'readMessage', 'incoming'), 'reading_commit');
      await e.runtime.commit(s => managePhone(s, 'createAccount', '微澜', '后续账号'), 'account_commit');
      if (legacy) for (const id of ['notice_commit', 'reading_commit', 'account_commit'])
        delete e.messages[4].data.stat_data._系统.提交记录[id].变更JSON;
      const expected = copy(e.messages[4].data.stat_data), receipts = copy(expected._系统.提交记录);
      const prefix = copy(e.diskChat.slice(1, 5));
      const request = global.fetch; let backupReads = 0;
      global.fetch = async (url, options) => {
        const route = new URL(url).pathname;
        if (route === '/api/backups/chat/get') {
          backupReads++;
          assert(legacy, '新回执不应读取备份');
          return Response.json([{ file_name: 'chat_fixture_20261111.jsonl', last_mes: '2026-11-11T10:30:00.000Z' }]);
        }
        if (route === '/api/backups/chat/download') {
          assert.deepEqual(JSON.parse(options.body), { name: 'chat_fixture_20261111.jsonl' });
          const raw = originalStory[oldStory.floor + 1].variables[oldStory.swipe].stat_data;
          const previous = originalStory[oldStory.baseFloor + 1].variables[oldStory.baseSwipe].stat_data;
          assert.equal(raw._系统.存档id, expected._系统.存档id);
          assert.equal(raw._系统.分支id, expected._系统.分支id);
          assert.equal(raw._系统.楼层id, oldStory.floor);
          assert.equal(raw._系统.候选回复id, String(oldStory.swipe));
          assert.equal(raw._系统.数据版本, oldStory.version);
          assert.deepEqual(previous, e.messages[oldStory.baseFloor].data.stat_data);
          return new Response(originalStory.map(row => JSON.stringify(row)).join('\n'));
        }
        return request(url, options);
      };
      if (via === 'desktop') await e.runtime.messageAction('edit', 4, '新正文');
      else { e.messages[4].message = '新正文'; await e.listeners.get('edited')(4); }
      assert.equal(e.vars.澄湾待更新正文.context.floor, 2);
      const editId = e.vars.澄湾待更新正文.id;
      await reload(e);
      assert.equal(e.vars.澄湾待更新正文.id, editId);
      e.update = async () => block([]); await e.runtime.retry();
      const result = e.state();
      assert.equal(Object.keys(result._系统.已计轮事件).length, 2);
      assert(!result._系统.已计轮事件[oldStory.commitId]);
      assert(result._系统.已计轮事件[editId]);
      assert(result._系统.数据版本 > expected._系统.数据版本);
      for (const id of ['notice_commit', 'reading_commit', 'account_commit'])
        assert.deepEqual(result._系统.提交记录[id], receipts[id]);
      assert.deepEqual(result.手机._通知, expected.手机._通知);
      assert.deepEqual(result.手机._阅读进度, expected.手机._阅读进度);
      assert.deepEqual(result.手机.账号, expected.手机.账号);
      assert.deepEqual(result.手机.原文.消息.incoming, expected.手机.原文.消息.incoming);
      assert.deepEqual(e.diskChat.slice(1, 5), prefix);
      assert.equal(backupReads, legacy ? 1 : 0);
      // 携带已确认变更后再次编辑不再依赖备份，也不能丢掉此前已重放的事务。
      await e.runtime.messageAction('edit', 4, '再次编辑正文'); await e.runtime.retry();
      assert.equal(Object.keys(e.state()._系统.已计轮事件).length, 2);
      assert.deepEqual(e.state().手机._阅读进度, expected.手机._阅读进度);
      assert.equal(backupReads, legacy ? 1 : 0);
    });
  });
}

test('同账号后续昵称与新正文简介各自保存，不按整实体覆盖', async () => {
  await withEnv(async e => {
    await e.runtime.send('原正文');
    await e.runtime.commit(s => { s.手机.账号.npc.昵称 = '后续昵称'; }, 'nickname_commit');
    await e.runtime.messageAction('edit', 2, '新正文修改介绍');
    e.update = async () => block([patch('/手机/账号/npc/简介', '新正文简介')]);
    await e.runtime.retry();
    assert.equal(e.state().手机.账号.npc.昵称, '后续昵称');
    assert.equal(e.state().手机.账号.npc.简介, '新正文简介');
    const paths = e.messages[2].extra.cw_story_settlements['0'].changes.map(change => change.path);
    assert(paths.includes('/手机/账号/npc/简介'));
    assert(!paths.includes('/手机/账号/npc/昵称'));
  });
});

test('人物关闭后旧重放全文随独立快照保存，编辑仍能重放且活动楼层不残留全文', async () => {
  for (const editFirst of [false, true]) await withEnv(async e => {
    if (editFirst) await e.runtime.commit(s => { s.角色.npc.简介 = 'PRIVATE_REPLAY_ONLY'; }, 'manual_edit');
    await e.runtime.send('普通正文');
    if (!editFirst) await e.runtime.commit(s => { s.角色.npc.简介 = 'PRIVATE_REPLAY_ONLY'; }, 'manual_edit');
    await e.runtime.manageCharacters({ kind: 'enabled', ids: ['npc'], enabled: false });
    assert(!JSON.stringify(e.state()).includes('PRIVATE_REPLAY_ONLY'));
    const snapshot = Object.values(e.vars.澄湾角色库.snapshots).find(row => row.id === 'npc');
    assert.equal(snapshot.pack.角色.简介, 'PRIVATE_REPLAY_ONLY');
    assert(snapshot.replays.manual_edit.changes.includes('PRIVATE_REPLAY_ONLY'));
    assert.equal(e.state()._系统.提交记录.manual_edit.变更JSON, undefined);
    await e.runtime.messageAction('edit', 2, '新正文');
    await e.runtime.retry();
    assert.equal(e.state().角色.npc, undefined);
    assert(!JSON.stringify(e.state()).includes('PRIVATE_REPLAY_ONLY'));
    assert(!JSON.stringify(e.messages[2]).includes('PRIVATE_REPLAY_ONLY'));
    assert(!JSON.stringify(require('../运行/model-history.ts').publicModelData(e.state())).includes('变更JSON'));
    await e.runtime.manageCharacters({ kind: 'enabled', ids: ['npc'], enabled: true });
    assert.equal(e.state().角色.npc.简介, 'PRIVATE_REPLAY_ONLY');
  });
});
