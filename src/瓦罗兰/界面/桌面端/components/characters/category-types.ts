/**
 * 瓦洛兰 角色自定义分类、拖拽整理与启停管理接口契约与数据模型定义
 * 前端仅负责交互呈现、状态流转与回调接口定义；不直接写入运行时持久化变量。
 */

/** 单层主分类定义 */
export interface CharacterCategory {
  /** 分类唯一 ID，系统内置保留分类为 'uncategorized' */
  id: string;
  /** 分类显示名称（如：学校、商业街、家庭、街坊邻里等） */
  name: string;
  /** 是否系统保留分类（如 '未分类'，不可删除） */
  isDefault?: boolean;
  /** UI 折叠状态 */
  collapsed?: boolean;
}

/** 角色在分类与启停中的视图模型 */
export interface CharacterItemData {
  /** 角色唯一 ID */
  id: string;
  /** 角色显示姓名 */
  name: string;
  /** 角色性别 */
  gender?: string;
  /** 角色年龄 */
  age?: number | null;
  /** 角色身份 / 职业标签 */
  occupation?: any;
  /** 角色层级：主要角色或次要角色（与分类独立） */
  tier: '主要' | '次要';
  /** 所属主分类 ID，未分配时为 'uncategorized' */
  categoryId: string;
  /** 分类内的显示排序权重 */
  order: number;
  /** 是否处于启用状态（true: 开启, false: 关闭/停用） */
  enabled: boolean;
  /** 交互即时状态反馈 */
  statusState?: 'idle' | 'pending' | 'success' | 'failed' | 'disabled';
  /** 操作失败提示信息 */
  errorMessage?: string;
  /** 原始角色对象引用（只读透传，严禁直接修改） */
  raw: any;
}

/** 分类统计信息 */
export interface CategoryStats {
  categoryId: string;
  total: number;
  enabled: number;
  disabled: number;
  /** 批量启停勾选状态：全开、全关或部分开启混合状态 */
  checkState: 'all' | 'none' | 'mixed';
}

/** 筛选器参数 */
export interface CharacterFilterOptions {
  /** 启停筛选：全部 / 已开启 / 已关闭 */
  statusFilter: 'all' | 'enabled' | 'disabled';
  /** 姓名或职业搜索关键词 */
  keyword: string;
  /** 层级筛选：全部 / 主要 / 次要（默认根据宿主弹窗自动确定） */
  tierFilter?: 'all' | '主要' | '次要';
}

/** 拖拽事件载荷 */
export interface CharacterDragPayload {
  type: 'character';
  charId: string;
  sourceCategoryId: string;
}

export interface CategoryDragPayload {
  type: 'category';
  categoryId: string;
}

/**
 * 前后端职责边界契约：提供给后台数据层/功能实现者的标准化接口规范
 * 实际功能接入时，后台服务实现本接口并注入前端即可完成真实持久化。
 */
export interface CharacterManagementContracts {
  /**
   * 1. 获取分类列表及其顺序
   */
  getCategories?: () => CharacterCategory[] | Promise<CharacterCategory[]>;

  /**
   * 2. 获取角色分类归属、排序及启停映射
   * Record<charId, { categoryId: string; order: number; enabled: boolean }>
   */
  getCharacterMetaMap?: () =>
    | Record<string, { categoryId: string; order: number; enabled: boolean }>
    | Promise<Record<string, { categoryId: string; order: number; enabled: boolean }>>;

  /**
   * 3. 新建分类
   * @param name 分类名称
   * @returns 创建成功后的分类对象
   */
  createCategory?: (name: string) => Promise<CharacterCategory>;

  /**
   * 4. 重命名分类
   * @param categoryId 分类 ID
   * @param newName 新名称
   */
  renameCategory?: (categoryId: string, newName: string) => Promise<void>;

  /**
   * 5. 删除分类
   * 删除后，该分类下所有角色安全移入 'uncategorized'（未分类），不删除或关闭角色
   * @param categoryId 分类 ID
   */
  deleteCategory?: (categoryId: string) => Promise<void>;

  /**
   * 6. 分类全局重新排序
   * @param orderedCategoryIds 排序后的分类 ID 数组
   */
  reorderCategories?: (orderedCategoryIds: string[]) => Promise<void>;

  /**
   * 7. 移动角色到指定分类（支持跨分类移动与可选指定位置）
   * @param charId 角色 ID
   * @param targetCategoryId 目标分类 ID
   * @param targetIndex 目标分类内的插入位置索引（可选）
   */
  moveCharacterToCategory?: (charId: string, targetCategoryId: string, targetIndex?: number) => Promise<void>;

  /**
   * 8. 分类内角色重新排序
   * @param categoryId 分类 ID
   * @param orderedCharIds 分类内排序后的角色 ID 数组
   */
  reorderCharactersInCategory?: (categoryId: string, orderedCharIds: string[]) => Promise<void>;

  /**
   * 9. 单位角色启停切换
   * 界面可即时呈现目标状态；保存确认后才报告成功，失败撤销显示投影。
   * @param charId 角色 ID
   * @param enabled 目标开启状态 (true: 开启, false: 关闭)
   * @returns 是否执行成功
   */
  toggleCharacterEnabled?: (charId: string, enabled: boolean) => Promise<boolean>;

  /**
   * 10. 分类批量启停
   * 将指定分类下（或符合条件）的角色全部开启或全部关闭
   * @param categoryId 分类 ID
   * @param enabled 目标开启状态
   * @param charIds 作用的角色 ID 列表
   */
  batchToggleCategoryEnabled?: (categoryId: string, enabled: boolean, charIds: string[]) => Promise<void>;
}
