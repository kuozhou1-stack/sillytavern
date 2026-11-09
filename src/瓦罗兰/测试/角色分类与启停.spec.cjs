const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const { test, describe } = require('node:test');

const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, parent, ...args) {
  if (name.startsWith('.') && parent && fs.existsSync(path.resolve(path.dirname(parent.filename), name + '.ts'))) {
    name += '.ts';
  }
  return resolve.call(this, name, parent, ...args);
};

require.extensions['.ts'] = (module, file) => {
  const content = fs.readFileSync(file, 'utf8');
  module._compile(
    ts.transpileModule(content, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    file,
  );
};

const {
  useCharacterDisplayState,
  DEFAULT_CATEGORY_ID,
} = require('../界面/桌面端/components/characters/useCharacterDisplayState.ts');
const { characterManagementContracts } = require('../界面/character-management.ts');

test('管理读回仅复制分类与状态，不重复读取人物快照和整份存档', () => {
  const library = {
    categories: [{ id: 'uncategorized', name: '未分类' }],
    meta: { npc: { categoryId: 'uncategorized', order: 0, enabled: true } },
    get characters() { throw Error('不应读取完整角色档案'); },
  };
  const contracts = characterManagementContracts({
    view: { characterLibrary: library },
    refresh: () => { throw Error('不应重复刷新'); },
    snapshot: () => { throw Error('不应序列化完整存档'); },
  });
  const categories = contracts.getCategories(), meta = contracts.getCharacterMetaMap();
  assert.equal(meta.npc.enabled, true);
  categories[0].name = '本地改名';
  meta.npc.enabled = false;
  assert.equal(library.categories[0].name, '未分类');
  assert.equal(library.meta.npc.enabled, true);
});

describe('瓦罗兰 角色管理分类、拖拽整理与启停交互验证', () => {
  const mockCharacters = {
    char_1: {
      基础信息: { 姓名: '苏林', 性别: '女', 年龄: 19, 职业: '大学生' },
      层级: '主要',
    },
    char_2: {
      基础信息: { 姓名: '络络', 性别: '女', 年龄: 18, 职业: '高中生' },
      层级: '主要',
    },
    char_3: {
      基础信息: { 姓名: '白娅', 性别: '女', 年龄: 24, 职业: '咖啡馆店长' },
      层级: '主要',
    },
    char_4: {
      基础信息: { 姓名: '陈奶奶', 性别: '女', 年龄: 68, 职业: '居委会热心街坊' },
      层级: '次要',
    },
    char_long_name: {
      基础信息: { 姓名: '超长姓名测试·亚历山德拉·维多利亚·伊丽莎白·澄湾名宿', 性别: '男', 年龄: 45, 职业: '学者' },
      层级: '次要',
    },
  };

  test('1. 自定义分类创建、重命名、删除及“未分类”兜底', async () => {
    const state = useCharacterDisplayState();
    state.togglePreviewMode(true, mockCharacters);

    // 默认包含系统内置保留分类
    assert.equal(state.categories.value.some(c => c.id === DEFAULT_CATEGORY_ID), true);

    // 创建新分类
    const created1 = await state.createCategory('学校 (澄湾大学)');
    assert.equal(created1, true);
    assert.equal(state.categories.value.some(c => c.name === '学校 (澄湾大学)'), true);

    // 防重名验证（此时尚未改名）
    const duplicate = await state.createCategory('学校 (澄湾大学)');
    assert.equal(duplicate, false);

    const created2 = await state.createCategory('商业街新区');
    assert.equal(created2, true);

    // 重命名分类
    const schoolCat = state.categories.value.find(c => c.name === '学校 (澄湾大学)');
    assert.ok(schoolCat);
    const renamed = await state.renameCategory(schoolCat.id, '学校与附中');
    assert.equal(renamed, true);
    assert.equal(schoolCat.name, '学校与附中');

    // 将角色分配至该分类
    await state.moveCharacter('char_1', schoolCat.id);
    assert.equal(state.charMetaMap.value['char_1'].categoryId, schoolCat.id);

    // 删除分类：角色必须安全自动归入“未分类”，不删除、不改变角色的开启状态
    const initialEnabled = state.charMetaMap.value['char_1'].enabled;
    const deleted = await state.deleteCategory(schoolCat.id);
    assert.equal(deleted, true);
    assert.equal(state.categories.value.some(c => c.id === schoolCat.id), false);
    assert.equal(state.charMetaMap.value['char_1'].categoryId, DEFAULT_CATEGORY_ID);
    assert.equal(state.charMetaMap.value['char_1'].enabled, initialEnabled); // 开启状态保持原状不受损
  });

  test('2. 拖拽与快捷移动：跨分类移动与分类内重排', async () => {
    const state = useCharacterDisplayState();
    state.togglePreviewMode(true, mockCharacters);

    await state.createCategory('家庭生活');
    const familyCat = state.categories.value.find(c => c.name === '家庭生活');
    assert.ok(familyCat);

    // 跨分类移动
    await state.moveCharacter('char_2', familyCat.id, 0);
    assert.equal(state.charMetaMap.value['char_2'].categoryId, familyCat.id);
    assert.equal(state.charMetaMap.value['char_2'].order, 0);

    await state.moveCharacter('char_3', familyCat.id, 1);
    assert.equal(state.charMetaMap.value['char_3'].categoryId, familyCat.id);
    assert.equal(state.charMetaMap.value['char_3'].order, 1);

    // 分类内重新排序
    await state.reorderCharacters(familyCat.id, ['char_3', 'char_2']);
    assert.equal(state.charMetaMap.value['char_3'].order, 0);
    assert.equal(state.charMetaMap.value['char_2'].order, 1);
  });

  test('3. 单人启停与分类批量启停混合状态计算', async () => {
    const state = useCharacterDisplayState();
    state.togglePreviewMode(true, mockCharacters);

    await state.createCategory('测试启停分类');
    const cat = state.categories.value.find(c => c.name === '测试启停分类');
    assert.ok(cat);

    await state.moveCharacter('char_1', cat.id);
    await state.moveCharacter('char_2', cat.id);

    // 显式将两名角色先设为开启状态
    await state.toggleCharacterEnabled('char_1', true);
    await state.toggleCharacterEnabled('char_2', true);

    // 初始均开启
    let stats = state.getCategoryStats(cat.id, mockCharacters);
    assert.equal(stats.total, 2);
    assert.equal(stats.enabled, 2);
    assert.equal(stats.checkState, 'all');

    // 单人关闭
    await state.toggleCharacterEnabled('char_1', false);
    assert.equal(state.charMetaMap.value['char_1'].enabled, false);

    // 呈现混合状态 (mixed)
    stats = state.getCategoryStats(cat.id, mockCharacters);
    assert.equal(stats.enabled, 1);
    assert.equal(stats.checkState, 'mixed');

    // 混合状态下一键批量开启 -> 全部开启
    await state.batchToggleCategory(cat.id, mockCharacters, true);
    stats = state.getCategoryStats(cat.id, mockCharacters);
    assert.equal(stats.enabled, 2);
    assert.equal(stats.checkState, 'all');

    // 全开状态下一键批量关闭 -> 全部关闭
    await state.batchToggleCategory(cat.id, mockCharacters, false);
    stats = state.getCategoryStats(cat.id, mockCharacters);
    assert.equal(stats.enabled, 0);
    assert.equal(stats.checkState, 'none');
  });

  test('4. 数据层报错回滚机制：失败坚决保留原状态，不假装成功', async () => {
    const state = useCharacterDisplayState();
    state.togglePreviewMode(true, mockCharacters);

    // 开启模拟失败测试
    state.simulateFailure.value = true;
    const initialEnabled = state.charMetaMap.value['char_1']?.enabled ?? true;

    // 尝试切换开启状态
    const ok = await state.toggleCharacterEnabled('char_1', !initialEnabled);
    assert.equal(ok, false); // 操作失败
    assert.equal(state.charMetaMap.value['char_1'].enabled, initialEnabled); // 坚决保留原状态
    assert.match(state.lastFeedback.value.message, /更新失败，已自动还原状态/);

    // 关闭模拟失败
    state.simulateFailure.value = false;
  });

  test('5. 主、次要角色界面使用同一套分类归属规则，升格独立于分类', async () => {
    const state = useCharacterDisplayState();
    state.togglePreviewMode(true, mockCharacters);

    await state.createCategory('公共区域');
    const pubCat = state.categories.value.find(c => c.name === '公共区域');
    assert.ok(pubCat);

    // 陈奶奶是次要角色，归入公共区域
    await state.moveCharacter('char_4', pubCat.id);
    assert.equal(state.charMetaMap.value['char_4'].categoryId, pubCat.id);

    // 模拟次要角色升格为主要角色（层级字段变更）
    const promotedChar4 = {
      ...mockCharacters.char_4,
      层级: '主要',
    };

    // 升格后重新读取
    const formatted = state.formatCharacterItem('char_4', promotedChar4);
    assert.equal(formatted.tier, '主要');
    // 分类归属完全保留不变
    assert.equal(formatted.categoryId, pubCat.id);
  });

  test('6. 搜索、超长姓名与空结果边界处理', async () => {
    const state = useCharacterDisplayState();
    state.togglePreviewMode(true, mockCharacters);

    // 将长姓名角色与陈奶奶归入未分类测试
    await state.moveCharacter('char_long_name', DEFAULT_CATEGORY_ID);
    await state.moveCharacter('char_4', DEFAULT_CATEGORY_ID);

    // 关键词搜索超长姓名
    const searchByName = state.getCategoryCharacters(DEFAULT_CATEGORY_ID, mockCharacters, {
      keyword: '超长姓名测试',
    });
    assert.equal(searchByName.some(c => c.id === 'char_long_name'), true);

    // 关键词搜索职业
    const searchByOccupation = state.getCategoryCharacters(DEFAULT_CATEGORY_ID, mockCharacters, {
      keyword: '街坊',
    });
    assert.equal(searchByOccupation.some(c => c.id === 'char_4'), true);

    // 搜索无结果
    const searchNoResult = state.getCategoryCharacters(DEFAULT_CATEGORY_ID, mockCharacters, {
      keyword: '完全不存在的人物名字XYZ',
    });
    assert.equal(searchNoResult.length, 0);

    // 空分类角色列表
    const emptyList = state.getCategoryCharacters('non_existent_category', mockCharacters);
    assert.deepEqual(emptyList, []);
  });
});

test('启停即刻显示目标状态且无进度提示，真实资料等待确认，失败撤销显示', async () => {
  const state = useCharacterDisplayState();
  const categories = [{ id: 'uncategorized', name: '未分类', isDefault: true }];
  const meta = { npc: { categoryId: 'uncategorized', order: 0, enabled: true } };
  let rejectSave;
  state.setContracts({
    getCategories: () => categories,
    getCharacterMetaMap: () => meta,
    toggleCharacterEnabled: () => new Promise((_, reject) => { rejectSave = reject; }),
  });
  state.syncManagement(categories, meta);
  try {
    const first = state.toggleCharacterEnabled('npc', false);
    assert.equal(state.operationPending.value['char:npc'], true);
    assert.equal(state.lastFeedback.value, null);
    assert.equal(state.charMetaMap.value.npc.enabled, false);
    assert.equal(state.confirmedCharMetaMap.value.npc.enabled, true);
    assert.equal(await state.toggleCharacterEnabled('npc', false), false);
    assert.equal(state.lastFeedback.value, null);
    rejectSave(Error('保存失败'));
    assert.equal(await first, false);
    assert.equal(state.charMetaMap.value.npc.enabled, true);
    assert.match(state.lastFeedback.value.message, /保存失败/);
    assert.equal(state.formatCharacterItem('npc', {}).statusState, 'idle');
  } finally { state.setContracts(null); }
});

test('移动立即出现在目标分类，失败回到原分类，确认后不闪回', async () => {
  const state = useCharacterDisplayState();
  const categories = [{ id: 'uncategorized', name: '未分类', isDefault: true }, { id: 'target', name: '朋友' }];
  const meta = { npc: { categoryId: 'uncategorized', order: 0, enabled: true } };
  let finish, fail;
  state.setContracts({
    getCategories: () => categories,
    getCharacterMetaMap: () => meta,
    moveCharacterToCategory: () => new Promise((resolve, reject) => { finish = resolve; fail = reject; }),
  });
  state.syncManagement(categories, meta);
  try {
    const failed = state.moveCharacter('npc', 'target');
    assert.equal(state.lastFeedback.value, null);
    assert.equal(state.charMetaMap.value.npc.categoryId, 'target');
    assert.equal(state.confirmedCharMetaMap.value.npc.categoryId, 'uncategorized');
    assert.equal(state.getCategoryCharacters('target', { npc: {} }).length, 1);
    assert.equal(state.getCategoryCharacters('uncategorized', { npc: {} }).length, 0);
    fail(Error('存储不可用'));
    assert.equal(await failed, false);
    assert.equal(state.charMetaMap.value.npc.categoryId, 'uncategorized');
    const saved = state.moveCharacter('npc', 'target');
    meta.npc.categoryId = 'target';
    finish();
    assert.equal(await saved, true);
    assert.equal(state.charMetaMap.value.npc.categoryId, 'target');
    assert.equal(state.formatCharacterItem('npc', {}).statusState, 'idle');
  } finally { state.setContracts(null); }
});

test('保存途中切换候选后撤销旧显示投影，迟到失败不改变新候选或新操作', async () => {
  const state = useCharacterDisplayState();
  const categories = [{ id: 'uncategorized', name: '未分类', isDefault: true }];
  let meta = { npc: { categoryId: 'uncategorized', order: 0, enabled: true } };
  const failures = [];
  state.setContracts({ getCategories: () => categories, getCharacterMetaMap: () => meta,
    toggleCharacterEnabled: () => new Promise((_, reject) => failures.push(reject)),
  });
  state.syncManagement(categories, meta, 'candidate-a');
  try {
    const old = state.toggleCharacterEnabled('npc', false);
    assert.equal(state.charMetaMap.value.npc.enabled, false);
    meta = { npc: { categoryId: 'uncategorized', order: 7, enabled: true } };
    state.syncManagement(categories, meta, 'candidate-b');
    assert.equal(state.charMetaMap.value.npc.enabled, true);
    const current = state.toggleCharacterEnabled('npc', false);
    failures[0](Error('旧请求失效'));
    assert.equal(await old, false);
    assert.equal(state.charMetaMap.value.npc.enabled, false);
    assert.equal(state.charMetaMap.value.npc.order, 7);
    assert.equal(state.operationPending.value['char:npc'], true);
    assert.equal(state.lastFeedback.value, null);
    failures[1](Error('新操作失败'));
    assert.equal(await current, false);
    assert.equal(state.charMetaMap.value.npc.enabled, true);
    assert.equal(state.charMetaMap.value.npc.order, 7);
  } finally { state.setContracts(null); }
});

test('批量开关立即显示整批目标状态，保存失败整批恢复且无成功提示', async () => {
  const state = useCharacterDisplayState();
  const categories = [{ id: 'uncategorized', name: '未分类', isDefault: true }];
  const meta = { a: { categoryId: 'uncategorized', order: 0, enabled: true }, b: { categoryId: 'uncategorized', order: 1, enabled: true } };
  let fail;
  state.setContracts({ getCategories: () => categories, getCharacterMetaMap: () => meta,
    batchToggleCategoryEnabled: () => new Promise((_, reject) => { fail = reject; }),
  });
  state.syncManagement(categories, meta);
  try {
    const pending = state.batchToggleCategory('uncategorized', { a: {}, b: {} }, false);
    assert.equal(state.getCategoryStats('uncategorized', { a: {}, b: {} }).checkState, 'none');
    assert.equal(state.confirmedCharMetaMap.value.a.enabled, true);
    assert.equal(state.confirmedCharMetaMap.value.b.enabled, true);
    assert.equal(state.lastFeedback.value, null);
    fail(Error('整批保存失败'));
    assert.equal(await pending, false);
    assert.equal(state.getCategoryStats('uncategorized', { a: {}, b: {} }).checkState, 'all');
    assert.equal(state.lastFeedback.value.type, 'error');
  } finally { state.setContracts(null); }
});

test('正式接入：分类批量开关覆盖全部层级，成功后采用数据层读回状态', async () => {
  const state = useCharacterDisplayState();
  const categories = [{ id: 'uncategorized', name: '未分类', isDefault: true }];
  const meta = {
    major: { categoryId: 'uncategorized', order: 0, enabled: true },
    minor: { categoryId: 'uncategorized', order: 1, enabled: false },
  };
  const characters = { major: { 层级: '主要' }, minor: { 层级: '次要' } };
  state.setContracts({
    getCategories: () => categories,
    getCharacterMetaMap: () => meta,
    batchToggleCategoryEnabled: async (category, enabled, ids) => {
      assert.deepEqual(ids.sort(), ['major', 'minor']);
      assert.equal(enabled, true);
      ids.forEach(id => { meta[id].enabled = enabled; });
    },
  });
  state.syncManagement(categories, meta);
  try {
    assert.equal(state.getCategoryStats('uncategorized', characters, '主要').checkState, 'mixed');
    assert.equal(await state.batchToggleCategory('uncategorized', characters, undefined, '主要'), true);
    assert.equal(state.charMetaMap.value.minor.enabled, true);
  } finally { state.setContracts(null); }
});
