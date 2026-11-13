const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Schema, withEnv } = require('./修复宿主.cjs');
const { createProfile } = require('../运行/creation.ts');
const { disabledAccount } = require('../运行/character-activity.ts');
const { importCharacter } = require('../运行/characters.ts');
const { libraryRevision, LibrarySchema, LIBRARY_KEY } = require('../运行/character-library.ts');

const initial = Schema.parse({
  世界: { 片区: { test_district: { 名称: '测试片区' } }, 当前场景: { 在场人物: ['friend', 'absent'] }, 天气: { 天气状况: '春雨' } },
  玩家: { id: 'hero', 性别: '未知', 身份: { 社会身份: '居民', 工作或就读单位: '事务所' },
    资金: { 余额分: 12345 }, 当前状态: { 当前地点id: 'home', 体力值: 42 },
    生活: { 住处id: 'home', 日常活动: '散步' }, 已知信息: { 已认识人物: { absent: { 称呼: '旧识' } } },
    物品栏: { map: { 名称: '地图', 数量: 0, 描述: '铅笔标记', 持有人id: 'hero' } } },
  地点: { home: { 名称: '花园', 片区id: 'test_district', 类型: '院落', 功能: '公共聚会' } },
  角色: { friend: { 层级: '次要', 姓名: '老何', 关系网: { absent: { 关系: '旧同事' } } }, absent: { 层级: '次要', 姓名: '张三' } },
  组织: { office: { 已知成员: { absent: { 职务: '文员' } } } },
  手机: { 账号: { me: { 人物id: 'hero', 账号名: '原账号' }, other: { 人物id: 'friend' }, archived: { 人物id: 'absent' } },
    联系人: { familiar: { 本人账号id: 'me', 对方账号id: 'other', 备注: '保持备注' } },
    会话: { dialogue: { 类型: '私聊', 参与账号id: ['me', 'other'] } } },
});

test('建档时局部调用保留作者的稳定 ID、完整地点、未编辑字段及角色', () => {
  const state = createProfile(initial, { player: { 姓名: '新名', 住处描述: '花园' }, characters: [] });
  assert.equal(state.玩家.id, 'hero');
  assert.equal(state.玩家.生活.住处id, 'home');
  assert.deepEqual(state.地点, initial.地点);
  assert.deepEqual(state.玩家.身份, initial.玩家.身份);
  assert.deepEqual(state.玩家.物品栏, initial.玩家.物品栏);
  assert.equal(state.玩家.当前状态.体力值, 42);
  assert.equal(state.玩家.当前状态.饱食度, 100);
  assert.equal(state.玩家.资金.余额分, 12345);
  assert.equal(state.玩家.性别, '未知');
  assert.deepEqual(state.手机, initial.手机);
  assert.equal(state.角色.absent.姓名, '张三');
});

test('表单显式移除和清空经过真实 Runtime、MVU 提交与隔离酒馆存档读回', async () => {
  const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
  const file = path.join(__dirname, '../界面/桌面端/components/creation/StepInitialCharacters.vue');
  const setup = require('vue/compiler-sfc').parse(fs.readFileSync(file, 'utf8')).descriptor.scriptSetup.content;
  const ast = ts.createSourceFile(file + '.ts', setup, ts.ScriptTarget.Latest, true);
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'updateRelField');
  const relations = { friend: { contact: true, contactEdited: false } };
  const update = new Function('getRelation', 'emit', 'props', ts.transpileModule(fn.getText(ast), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText + '\nreturn updateRelField;')(id => relations[id], (_name, value) => Object.assign(relations, value), { relations });
  update('friend', 'contact', false);
  assert.equal(relations.friend.contactEdited, true);
  const cleared = createProfile(initial, { player: { 姓名: '玩家' }, characters: [{ id: 'friend', ...initial.角色.friend }],
    details: { 初始关系: relations } });
  assert.equal(cleared.手机.联系人.familiar.状态, '移除');
  await withEnv(async e => {
    await e.runtime.createProfile({
      player: { 姓名: '新名字', 住处描述: '' },
      characters: [{ id: 'friend', ...initial.角色.friend }],
      details: { 移除初始角色: ['absent'], 移除初始物品: ['map'], 邻信账号名: '更新账号名',
        世界: { 天气: { 天气状况: null } }, 玩家: { 物品栏: {}, 资金: { 余额分: 0 } },
        初始关系: { friend: { basis: '多年好友', contact: true, contactEdited: true } } },
    });
    const saved = e.diskChat[1].variables[0].stat_data;
    assert.equal(saved.玩家.资金.余额分, 0);
    assert.deepEqual(saved.玩家.物品栏, {});
    assert.equal(saved.世界.天气.天气状况, null);
    assert.equal(saved.玩家.生活.住处id, null);
    assert.equal(saved.地点.home.名称, '花园');
    assert.equal(saved.玩家.当前状态.当前地点id, 'home');
    assert.equal(saved.角色.absent, undefined);
    assert.deepEqual(saved.世界.当前场景.在场人物, ['friend']);
    assert.equal(saved.玩家.已知信息.已认识人物.absent.称呼, '旧识');
    assert.equal(saved.角色.friend.关系网.absent.关系, '旧同事');
    assert.equal(saved.组织.office.已知成员.absent.职务, '文员');
    assert.equal(saved.手机.账号.archived.人物id, 'absent');
    assert.equal(disabledAccount(saved, 'archived'), true);
    assert.equal(e.runtime.view.characterLibrary.characters.absent, undefined);
    assert.equal(saved.手机.账号.me.账号名, '更新账号名');
    assert.equal(saved.手机.联系人.familiar.备注, '保持备注');
    assert.equal(Object.keys(saved.手机.联系人).length, 2);
    assert.deepEqual(Object.keys(saved.手机.会话), ['dialogue']);
  }, initial);
});

test('局部更新物品保留旧栏，普通移除人物可再导入，真正停用的恢复快照受到保护', async () => {
  const seed = Schema.parse({ ...initial, 角色: { ...initial.角色, free: { 层级: '次要', 姓名: '未结识' } },
    手机: { ...initial.手机, 账号: { ...initial.手机.账号, free_history: { 人物id: 'free', 账号名: '历史账号' } } } });
  await withEnv(async e => {
    await e.runtime.createProfile({
      player: { 姓名: '玩家' }, characters: [],
      details: { 移除初始角色: ['free'], 玩家: { 物品栏: { bag: { 名称: '包' } } } },
    });
    const state = e.state();
    assert.deepEqual(state.玩家.物品栏.map, initial.玩家.物品栏.map);
    assert.equal(state.玩家.物品栏.bag.名称, '包');
    assert(state._系统.角色停用标识.free);
    assert(!Object.values(e.vars[LIBRARY_KEY].snapshots).some(snapshot => snapshot.id === 'free'));
    assert.equal(e.runtime.view.characterLibrary.characters.free, undefined);
    const importId = id => e.runtime.commit(s => {
      const revision = libraryRevision(s, LibrarySchema.parse(e.vars[LIBRARY_KEY]));
      importCharacter(s, id, { 姓名: '重新录入', 层级: '次要' }, undefined, Object.hasOwn(revision.disabled, id));
    });
    await importId('free');
    assert.equal(e.state().角色.free.姓名, '重新录入');
    assert.equal(e.state().手机.账号.free_history.账号名, '历史账号');
    assert.equal(e.state().手机.账号.free_history.人物id, 'free');
    await e.runtime.manageCharacters({ kind: 'enabled', ids: ['friend'], enabled: false });
    await assert.rejects(importId('friend'), /不能用导入覆盖关闭快照/);
    assert.equal(e.state().角色.friend, undefined);
    assert.equal(e.runtime.view.characterLibrary.characters.friend.姓名, '老何');
  }, seed);
});
