import { computed, ref, shallowRef } from 'vue';
import type {
  CharacterCategory,
  CharacterItemData,
  CategoryStats,
  CharacterManagementContracts,
} from './category-types';

/** 系统内置保留的默认分类 */
export const DEFAULT_CATEGORY_ID = 'uncategorized';
export const DEFAULT_CATEGORY: CharacterCategory = {
  id: DEFAULT_CATEGORY_ID,
  name: '未分类',
  isDefault: true,
  collapsed: false,
};

/** 全局共享响应式状态实例，确保主、次要角色界面及角色管理使用同一套分类归属与排序规则 */
const globalCategories = ref<CharacterCategory[]>([{ ...DEFAULT_CATEGORY }]);

/** 角色元数据映射：Record<charId, { categoryId: string; order: number; enabled: boolean }> */
type CharacterMetaMap = Record<string, { categoryId: string; order: number; enabled: boolean }>;
const globalCharMetaMap = ref<CharacterMetaMap>({});
// UI-only intent. Never written into stat_data or used as an acknowledgement.
const immediateMeta = ref<CharacterMetaMap>({});
const displayedMeta = computed(() => ({ ...globalCharMetaMap.value, ...immediateMeta.value }));
let contractVersion = 0;
let managementScope: string | undefined;

/** 是否处于开发交互预览模式（用于隔离验证拖拽、分类与启停交互） */
const isDevPreviewMode = ref<boolean>(false);

/** 预览模式下是否模拟请求失败（用于验证数据层失败时保留原状态，不假装成功） */
const simulateFailure = ref<boolean>(false);

/** 正在处理中的操作标记：Record<actionKey, boolean> */
const operationPending = ref<Record<string, boolean>>({});

/** 最近一次操作的提示反馈信息 */
const lastFeedback = ref<{ type: 'info' | 'success' | 'warning' | 'error'; message: string; timestamp: number } | null>(
  null,
);

/** 数据层外部接入契约回调存储 */
const activeContracts = shallowRef<CharacterManagementContracts | null>(null);

export function useCharacterDisplayState() {
  function setContracts(contracts: CharacterManagementContracts | null) {
    if (activeContracts.value !== contracts) {
      contractVersion++;
      managementScope = undefined;
      immediateMeta.value = {};
      operationPending.value = {};
      lastFeedback.value = null;
    }
    activeContracts.value = contracts;
    if (contracts) isDevPreviewMode.value = false;
  }

  function syncManagement(
    categories: CharacterCategory[],
    meta: Record<string, { categoryId: string; order: number; enabled: boolean }>,
    scope?: string,
  ) {
    if (isDevPreviewMode.value) return;
    if (scope !== undefined && scope !== managementScope) {
      if (managementScope !== undefined) {
        contractVersion++;
        immediateMeta.value = {};
        operationPending.value = {};
      }
      managementScope = scope;
    }
    const collapsed = new Map(globalCategories.value.map(c => [c.id, c.collapsed]));
    globalCategories.value = categories.map(c => ({ ...c, collapsed: collapsed.get(c.id) ?? false }));
    globalCharMetaMap.value = JSON.parse(JSON.stringify(meta));
  }

  async function persisted(
    key: string,
    action: (contracts: CharacterManagementContracts) => Promise<unknown>,
    message = '已保存',
    project?: (meta: CharacterMetaMap) => CharacterMetaMap,
  ): Promise<boolean> {
    if (Object.values(operationPending.value).some(Boolean)) {
      if (!operationPending.value[key]) setFeedback('warning', '上一项操作尚未保存，请稍后重试');
      return false;
    }
    const contracts = activeContracts.value!;
    const version = contractVersion;
    const isCurrent = () => activeContracts.value === contracts && version === contractVersion;
    const readback = async () => {
      if (contracts.getCategories && contracts.getCharacterMetaMap) {
        const [categories, meta] = await Promise.all([contracts.getCategories(), contracts.getCharacterMetaMap()]);
        if (isCurrent()) syncManagement(categories, meta);
      }
    };
    operationPending.value[key] = true;
    lastFeedback.value = null;
    try {
      if (project) immediateMeta.value = project(globalCharMetaMap.value);
      const result = await action(contracts);
      if (result === false) throw Error('操作未被数据层确认');
      if (!isCurrent()) return false;
      await readback();
      if (!isCurrent()) return false;
      setFeedback('success', message);
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      // The bridge has already refreshed any rollback or newly selected branch.
      try {
        await readback();
      } catch {
        /* Keep the last confirmed projection. */
      }
      if (isCurrent()) setFeedback('error', `操作未保存，已恢复当前存档状态：${String(error)}`);
      return false;
    } finally {
      if (isCurrent()) {
        operationPending.value[key] = false;
        immediateMeta.value = {};
      }
    }
  }

  function setFeedback(type: 'info' | 'success' | 'warning' | 'error', message: string) {
    lastFeedback.value = { type, message, timestamp: Date.now() };
  }

  /**
   * 初始化/同步角色数据到本地视图投影
   * @param rawCharacters 从运行服务或 props 传入的角色字典
   */
  function syncCharacters(rawCharacters: Record<string, any>) {
    if (!rawCharacters || typeof rawCharacters !== 'object') return;
    const currentMeta = { ...globalCharMetaMap.value };
    let hasChanges = false;
    let autoOrder = Object.keys(currentMeta).length;

    for (const [id, c] of Object.entries(rawCharacters)) {
      if (!currentMeta[id]) {
        // 从现有角色可能包含的字段中读取已有分类或开启状态，若无则使用默认
        const existingCat = c._管理?.分类id || c.分类id || DEFAULT_CATEGORY_ID;
        const existingEnabled = c._管理?.停用 === true || c.已停用 === true ? false : true;
        currentMeta[id] = {
          categoryId: existingCat,
          order: autoOrder++,
          enabled: existingEnabled,
        };
        hasChanges = true;
      }
    }

    if (hasChanges) {
      globalCharMetaMap.value = currentMeta;
    }
  }

  /**
   * 初始化开发预览数据集（构建学校、商业街、家庭与未分类及多位角色的示例）
   */
  function initDevPreviewData(existingCharacters?: Record<string, any>) {
    globalCategories.value = [
      { id: 'cat_school', name: '学院与学园', isDefault: false, collapsed: false },
      { id: 'cat_commercial', name: '商业街与职场', isDefault: false, collapsed: false },
      { id: 'cat_family', name: '家庭与邻里', isDefault: false, collapsed: false },
      { ...DEFAULT_CATEGORY },
    ];

    const meta: Record<string, { categoryId: string; order: number; enabled: boolean }> = {};
    const catKeys = ['cat_school', 'cat_commercial', 'cat_family', DEFAULT_CATEGORY_ID];
    const charIds = Object.keys(existingCharacters || {});

    if (charIds.length > 0) {
      charIds.forEach((id, index) => {
        meta[id] = {
          categoryId: catKeys[index % catKeys.length],
          order: index,
          enabled: index % 4 !== 0, // 部分模拟停用
        };
      });
    } else {
      // 模拟测试数据（含超长姓名、不同层级与开启状态）
      const mockChars = [
        { id: 'mock_su_lin', cat: 'cat_school', enabled: true, order: 0 },
        { id: 'mock_luo_luo', cat: 'cat_school', enabled: true, order: 1 },
        { id: 'mock_bai_ya', cat: 'cat_commercial', enabled: false, order: 0 },
        { id: 'mock_manager_zhang', cat: 'cat_commercial', enabled: true, order: 1 },
        { id: 'mock_grandma_chen', cat: 'cat_family', enabled: true, order: 0 },
        { id: 'mock_neighbor_long_name', cat: 'uncategorized', enabled: false, order: 0 },
      ];
      mockChars.forEach(m => {
        meta[m.id] = { categoryId: m.cat, order: m.order, enabled: m.enabled };
      });
    }

    globalCharMetaMap.value = meta;
    setFeedback('info', '已载入开发交互预览数据，可完整测试分类拖拽与启停操作。');
  }

  /** 切换开发交互预览模式 */
  function togglePreviewMode(enable?: boolean, characters?: Record<string, any>) {
    if (activeContracts.value) return;
    isDevPreviewMode.value = enable !== undefined ? enable : !isDevPreviewMode.value;
    if (isDevPreviewMode.value) {
      initDevPreviewData(characters);
    } else {
      // 退出预览模式，重置回基础分类
      globalCategories.value = [{ ...DEFAULT_CATEGORY }];
      if (characters) syncCharacters(characters);
      setFeedback('info', '已返回正式状态模式（数据层未接入时操作受保护禁用）。');
    }
  }

  /**
   * 组装指定角色列表并结合元数据排序
   */
  function formatCharacterItem(id: string, raw: any): CharacterItemData {
    const meta = displayedMeta.value[id] || {
      categoryId: DEFAULT_CATEGORY_ID,
      order: 999,
      enabled: true,
    };

    return {
      id,
      name: raw.基础信息?.姓名 || raw.姓名 || id,
      gender: raw.基础信息?.性别 || raw.性别,
      age: raw.基础信息?.年龄 !== undefined ? raw.基础信息.年龄 : raw.年龄,
      occupation: (typeof raw.身份 === 'string' ? raw.身份 : null) || raw.身份?.身份 || raw.基础信息?.职业,
      tier: raw.层级 === '次要' ? '次要' : '主要',
      categoryId: meta.categoryId,
      order: meta.order,
      enabled: meta.enabled,
      statusState:
        operationPending.value[`char:${id}`] || operationPending.value[`cat:${meta.categoryId}`] ? 'pending' : 'idle',
      raw,
    };
  }

  /**
   * 获取某个分类下的角色列表（支持层级筛选、状态筛选、关键词搜索与独立排序）
   */
  function getCategoryCharacters(
    categoryId: string,
    allCharacters: Record<string, any>,
    options: {
      tierFilter?: 'all' | '主要' | '次要';
      statusFilter?: 'all' | 'enabled' | 'disabled';
      keyword?: string;
    } = {},
  ): CharacterItemData[] {
    const { tierFilter = 'all', statusFilter = 'all', keyword = '' } = options;
    const kw = keyword.trim().toLowerCase();

    const result: CharacterItemData[] = [];

    for (const [id, raw] of Object.entries(allCharacters || {})) {
      const item = formatCharacterItem(id, raw);
      if (item.categoryId !== categoryId) continue;
      if (tierFilter !== 'all' && item.tier !== tierFilter) continue;
      if (statusFilter === 'enabled' && !item.enabled) continue;
      if (statusFilter === 'disabled' && item.enabled) continue;

      if (kw) {
        const nameMatch = item.name.toLowerCase().includes(kw);
        const occStr = typeof item.occupation === 'string' ? item.occupation : JSON.stringify(item.occupation || '');
        const occMatch = occStr.toLowerCase().includes(kw);
        if (!nameMatch && !occMatch) continue;
      }

      result.push(item);
    }

    // 按 order 升序排序
    return result.sort((a, b) => a.order - b.order);
  }

  /**
   * 计算指定分类的统计信息（总数、开启数、批量开关勾选状态）
   */
  function getCategoryStats(
    categoryId: string,
    allCharacters: Record<string, any>,
    tierFilter: 'all' | '主要' | '次要' = 'all',
  ): CategoryStats {
    // 分类跨主要／次要层级；正式开关始终汇总整类，列表筛选只影响显示。
    if (activeContracts.value && !isDevPreviewMode.value) tierFilter = 'all';
    let total = 0;
    let enabled = 0;

    for (const [id, raw] of Object.entries(allCharacters || {})) {
      const item = formatCharacterItem(id, raw);
      if (item.categoryId !== categoryId) continue;
      if (tierFilter !== 'all' && item.tier !== tierFilter) continue;

      total++;
      if (item.enabled) enabled++;
    }

    let checkState: 'all' | 'none' | 'mixed' = 'none';
    if (total > 0) {
      if (enabled === total) checkState = 'all';
      else if (enabled === 0) checkState = 'none';
      else checkState = 'mixed';
    }

    return {
      categoryId,
      total,
      enabled,
      disabled: total - enabled,
      checkState,
    };
  }

  // ========================== 交互动作执行器 ==========================

  /** 新建分类 */
  async function createCategory(name: string): Promise<boolean> {
    if (activeContracts.value && !isDevPreviewMode.value)
      return persisted('categories', c => c.createCategory!(name), '分类已保存');
    const trimmed = name.trim();
    if (!trimmed) {
      setFeedback('warning', '分类名称不能为空');
      return false;
    }
    if (globalCategories.value.some(c => c.name === trimmed)) {
      setFeedback('warning', `已存在名为“${trimmed}”的分类`);
      return false;
    }

    // 正式模式且无后端接口时的保护
    if (!isDevPreviewMode.value && !activeContracts.value?.createCategory) {
      setFeedback(
        'warning',
        '【数据层未接入】新建分类需要后台持久化支持。您可在角色管理中开启【开发预览模式】体验交互。',
      );
      return false;
    }

    const newId = `cat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newCategory: CharacterCategory = { id: newId, name: trimmed, isDefault: false, collapsed: false };

    if (isDevPreviewMode.value) {
      // 插入在“未分类”之前
      const uncategorizedIdx = globalCategories.value.findIndex(c => c.id === DEFAULT_CATEGORY_ID);
      if (uncategorizedIdx >= 0) {
        globalCategories.value.splice(uncategorizedIdx, 0, newCategory);
      } else {
        globalCategories.value.push(newCategory);
      }
      setFeedback('success', `分类“${trimmed}”创建成功`);
      return true;
    }

    try {
      const res = await activeContracts.value!.createCategory!(trimmed);
      globalCategories.value.push(res || newCategory);
      setFeedback('success', `分类“${trimmed}”创建成功`);
      return true;
    } catch (e) {
      setFeedback('error', `新建分类失败: ${String(e)}`);
      return false;
    }
  }

  /** 重命名分类 */
  async function renameCategory(categoryId: string, newName: string): Promise<boolean> {
    if (activeContracts.value && !isDevPreviewMode.value)
      return persisted('categories', c => c.renameCategory!(categoryId, newName), '分类名称已保存');
    const trimmed = newName.trim();
    if (!trimmed) return false;
    const cat = globalCategories.value.find(c => c.id === categoryId);
    if (!cat) return false;
    if (cat.isDefault) {
      setFeedback('warning', '系统默认“未分类”不支持重命名');
      return false;
    }

    if (!isDevPreviewMode.value && !activeContracts.value?.renameCategory) {
      setFeedback('warning', '【数据层未接入】分类重命名需要后台持久化支持。');
      return false;
    }

    const oldName = cat.name;
    if (isDevPreviewMode.value) {
      cat.name = trimmed;
      setFeedback('success', `已重命名为“${trimmed}”`);
      return true;
    }

    try {
      await activeContracts.value!.renameCategory!(categoryId, trimmed);
      cat.name = trimmed;
      setFeedback('success', `已重命名为“${trimmed}”`);
      return true;
    } catch (e) {
      cat.name = oldName;
      setFeedback('error', `重命名失败: ${String(e)}`);
      return false;
    }
  }

  /**
   * 删除分类（核心要求：删除分类时，角色归入“未分类”，不删除或关闭角色）
   */
  async function deleteCategory(categoryId: string): Promise<boolean> {
    if (activeContracts.value && !isDevPreviewMode.value)
      return persisted('categories', c => c.deleteCategory!(categoryId), '分类已删除，成员已移至未分类');
    const catIdx = globalCategories.value.findIndex(c => c.id === categoryId);
    if (catIdx < 0) return false;
    const cat = globalCategories.value[catIdx];
    if (cat.isDefault) {
      setFeedback('warning', '系统内置的“未分类”不能删除');
      return false;
    }

    if (!isDevPreviewMode.value && !activeContracts.value?.deleteCategory) {
      setFeedback('warning', '【数据层未接入】删除分类需要后台持久化支持。');
      return false;
    }

    // 统计移入未分类的角色数量
    let movedCount = 0;
    const updatedMeta = { ...globalCharMetaMap.value };
    for (const meta of Object.values(updatedMeta)) {
      if (meta.categoryId === categoryId) {
        meta.categoryId = DEFAULT_CATEGORY_ID;
        movedCount++;
      }
    }

    if (isDevPreviewMode.value) {
      globalCategories.value.splice(catIdx, 1);
      globalCharMetaMap.value = updatedMeta;
      setFeedback('info', `已删除分类“${cat.name}”，其中的 ${movedCount} 位角色已安全归入“未分类”`);
      return true;
    }

    try {
      await activeContracts.value!.deleteCategory!(categoryId);
      globalCategories.value.splice(catIdx, 1);
      globalCharMetaMap.value = updatedMeta;
      setFeedback('info', `已删除分类“${cat.name}”，关联角色已安全移入未分类`);
      return true;
    } catch (e) {
      setFeedback('error', `删除分类失败: ${String(e)}`);
      return false;
    }
  }

  /** 分类排序 */
  async function reorderCategories(fromIndex: number, toIndex: number): Promise<boolean> {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return false;
    const list = [...globalCategories.value];
    const [moved] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, moved);
    if (activeContracts.value && !isDevPreviewMode.value)
      return persisted('categories', c => c.reorderCategories!(list.map(item => item.id)));

    if (!isDevPreviewMode.value && !activeContracts.value?.reorderCategories) {
      setFeedback('warning', '【数据层未接入】分类排序尚未连接持久化接口。');
      return false;
    }

    if (isDevPreviewMode.value) {
      globalCategories.value = list;
      return true;
    }

    try {
      await activeContracts.value!.reorderCategories!(list.map(c => c.id));
      globalCategories.value = list;
      return true;
    } catch (e) {
      setFeedback('error', `排序分类失败: ${String(e)}`);
      return false;
    }
  }

  /** 移动角色至目标分类（支持指定位置，兼顾拖拽与选择框交互） */
  async function moveCharacter(charId: string, targetCategoryId: string, targetIndex?: number): Promise<boolean> {
    if (activeContracts.value && !isDevPreviewMode.value)
      return persisted(
        `char:${charId}`,
        c => c.moveCharacterToCategory!(charId, targetCategoryId, targetIndex),
        '角色位置已保存',
        meta => {
          if (!meta[charId] || !globalCategories.value.some(c => c.id === targetCategoryId))
            throw Error('角色或分类已变化');
          const ids = Object.keys(meta)
            .filter(id => id !== charId && meta[id].categoryId === targetCategoryId)
            .sort((a, b) => meta[a].order - meta[b].order);
          ids.splice(Math.max(0, Math.min(targetIndex ?? ids.length, ids.length)), 0, charId);
          return Object.fromEntries(ids.map((id, order) => [id, { ...meta[id], categoryId: targetCategoryId, order }]));
        },
      );
    const meta = globalCharMetaMap.value[charId];
    if (!meta) return false;
    if (meta.categoryId === targetCategoryId && targetIndex === undefined) return true;

    if (!isDevPreviewMode.value && !activeContracts.value?.moveCharacterToCategory) {
      setFeedback('warning', '【数据层未接入】移动角色需要后台持久化支持。');
      return false;
    }

    const oldCategoryId = meta.categoryId;
    const oldOrder = meta.order;

    if (isDevPreviewMode.value) {
      meta.categoryId = targetCategoryId;
      if (targetIndex !== undefined) {
        meta.order = targetIndex;
      }
      setFeedback('success', '角色位置已更新');
      return true;
    }

    try {
      await activeContracts.value!.moveCharacterToCategory!(charId, targetCategoryId, targetIndex);
      meta.categoryId = targetCategoryId;
      if (targetIndex !== undefined) meta.order = targetIndex;
      return true;
    } catch (e) {
      meta.categoryId = oldCategoryId;
      meta.order = oldOrder;
      setFeedback('error', `移动角色失败，已还原: ${String(e)}`);
      return false;
    }
  }

  /** 分类内角色重新排序 */
  async function reorderCharacters(categoryId: string, orderedCharIds: string[]): Promise<boolean> {
    if (activeContracts.value && !isDevPreviewMode.value)
      return persisted(`cat:${categoryId}`, c => c.reorderCharactersInCategory!(categoryId, orderedCharIds));
    if (!orderedCharIds.length) return false;

    if (!isDevPreviewMode.value && !activeContracts.value?.reorderCharactersInCategory) {
      setFeedback('warning', '【数据层未接入】角色排序需要后台持久化支持。');
      return false;
    }

    const previousOrders: Record<string, number> = {};
    orderedCharIds.forEach((id, idx) => {
      if (globalCharMetaMap.value[id]) {
        previousOrders[id] = globalCharMetaMap.value[id].order;
        globalCharMetaMap.value[id].order = idx;
      }
    });

    if (isDevPreviewMode.value) {
      return true;
    }

    try {
      await activeContracts.value!.reorderCharactersInCategory!(categoryId, orderedCharIds);
      return true;
    } catch (e) {
      // 还原原有排序
      for (const [id, ord] of Object.entries(previousOrders)) {
        if (globalCharMetaMap.value[id]) globalCharMetaMap.value[id].order = ord;
      }
      setFeedback('error', `排序保存失败，已还原: ${String(e)}`);
      return false;
    }
  }

  /**
   * 单人启停切换
   * 界面立即切换；完整快照和活动状态仍由后台保存，失败撤销显示投影。
   */
  async function toggleCharacterEnabled(charId: string, targetEnabled?: boolean): Promise<boolean> {
    if (activeContracts.value && !isDevPreviewMode.value) {
      const enabled = targetEnabled ?? !globalCharMetaMap.value[charId]?.enabled;
      return persisted(
        `char:${charId}`,
        c => c.toggleCharacterEnabled!(charId, enabled),
        enabled ? '已恢复关闭时资料' : '已保存快照并关闭角色',
        meta => ({ [charId]: { ...meta[charId], enabled } }),
      );
    }
    const meta = globalCharMetaMap.value[charId];
    if (!meta) return false;

    const nextState = targetEnabled !== undefined ? targetEnabled : !meta.enabled;
    const prevState = meta.enabled;
    const actionKey = `char:${charId}`;

    operationPending.value[actionKey] = true;

    // 预览模式下的模拟逻辑（支持可选的模拟失败机制以验证回滚）
    if (isDevPreviewMode.value) {
      await new Promise(r => setTimeout(r, 260)); // 模拟轻微网络/异步延迟
      operationPending.value[actionKey] = false;

      if (simulateFailure.value) {
        meta.enabled = prevState; // 保持原状
        setFeedback('error', `模拟测试：角色启停更新失败，已自动还原状态`);
        return false;
      }

      meta.enabled = nextState;
      setFeedback('success', `角色档案已${nextState ? '开启' : '关闭（已停用，可随时恢复）'}`);
      return true;
    }

    // 正式模式：若无后端实现接入，坚决不假装成功，提示未接入并保持原状态
    if (!activeContracts.value?.toggleCharacterEnabled) {
      operationPending.value[actionKey] = false;
      setFeedback('warning', '【数据层未接入】角色启停持久化接口未绑定。界面保持原状态，未冒充已保存。');
      return false;
    }

    try {
      const ok = await activeContracts.value.toggleCharacterEnabled(charId, nextState);
      operationPending.value[actionKey] = false;
      if (ok !== false) {
        meta.enabled = nextState;
        setFeedback('success', `已成功${nextState ? '启用' : '停用'}角色`);
        return true;
      } else {
        meta.enabled = prevState;
        setFeedback('error', '操作未被数据层确认，已保留原状态');
        return false;
      }
    } catch (e) {
      operationPending.value[actionKey] = false;
      meta.enabled = prevState;
      setFeedback('error', `启停操作失败: ${String(e)}`);
      return false;
    }
  }

  /**
   * 分类批量启停
   * 部分开启时点击转为全开；全开时点击转为全关
   */
  async function batchToggleCategory(
    categoryId: string,
    allCharacters: Record<string, any>,
    targetEnabled?: boolean,
    tierFilter: 'all' | '主要' | '次要' = 'all',
  ): Promise<boolean> {
    if (activeContracts.value && !isDevPreviewMode.value) tierFilter = 'all';
    const stats = getCategoryStats(categoryId, allCharacters, tierFilter);
    if (stats.total === 0) return false;

    // 若未显式传入 targetEnabled，根据 checkState 推导：部分或全关 -> 全开；全开 -> 全关
    const nextState = targetEnabled !== undefined ? targetEnabled : stats.checkState !== 'all';
    const targetCharIds: string[] = [];

    for (const [id, raw] of Object.entries(allCharacters || {})) {
      const item = formatCharacterItem(id, raw);
      if (item.categoryId !== categoryId) continue;
      if (tierFilter !== 'all' && item.tier !== tierFilter) continue;
      targetCharIds.push(id);
    }

    const actionKey = `cat:${categoryId}`;
    if (activeContracts.value && !isDevPreviewMode.value)
      return persisted(
        actionKey,
        c => c.batchToggleCategoryEnabled!(categoryId, nextState, targetCharIds),
        `已确认 ${targetCharIds.length} 位角色${nextState ? '开启' : '关闭'}（整批保存）`,
        meta => Object.fromEntries(targetCharIds.map(id => [id, { ...meta[id], enabled: nextState }])),
      );
    operationPending.value[actionKey] = true;

    if (isDevPreviewMode.value) {
      await new Promise(r => setTimeout(r, 300));
      operationPending.value[actionKey] = false;

      if (simulateFailure.value) {
        setFeedback('error', '模拟测试：批量操作失败，已还原全部角色状态');
        return false;
      }

      targetCharIds.forEach(id => {
        if (globalCharMetaMap.value[id]) globalCharMetaMap.value[id].enabled = nextState;
      });
      setFeedback('success', `已批量${nextState ? '开启' : '关闭'}该分类下 ${targetCharIds.length} 位角色`);
      return true;
    }

    if (!activeContracts.value?.batchToggleCategoryEnabled) {
      operationPending.value[actionKey] = false;
      setFeedback('warning', '【数据层未接入】批量启停接口尚未接入后台服务。');
      return false;
    }

    try {
      await activeContracts.value.batchToggleCategoryEnabled(categoryId, nextState, targetCharIds);
      operationPending.value[actionKey] = false;
      targetCharIds.forEach(id => {
        if (globalCharMetaMap.value[id]) globalCharMetaMap.value[id].enabled = nextState;
      });
      setFeedback('success', `批量${nextState ? '开启' : '关闭'}完成`);
      return true;
    } catch (e) {
      operationPending.value[actionKey] = false;
      setFeedback('error', `批量操作失败: ${String(e)}`);
      return false;
    }
  }

  return {
    categories: globalCategories,
    charMetaMap: displayedMeta,
    confirmedCharMetaMap: globalCharMetaMap,
    isDevPreviewMode,
    simulateFailure,
    operationPending,
    lastFeedback,
    setContracts,
    syncManagement,
    connected: computed(() => !!activeContracts.value),
    setFeedback,
    syncCharacters,
    initDevPreviewData,
    togglePreviewMode,
    formatCharacterItem,
    getCategoryCharacters,
    getCategoryStats,
    createCategory,
    renameCategory,
    deleteCategory,
    reorderCategories,
    moveCharacter,
    reorderCharacters,
    toggleCharacterEnabled,
    batchToggleCategory,
  };
}
