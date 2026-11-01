<template>
  <div class="cw-organize-tab">
    <!-- 顶部状态栏与模式控制 -->
    <div class="cw-organize-top-bar">
      <div class="cw-top-bar-left">
        <!-- 搜索框 -->
        <div class="cw-search-box">
          <SvgIcon name="search" :size="14" />
          <input v-model="searchKeyword" type="text" placeholder="搜索角色姓名 / 身份..." class="cw-search-input" />
          <button v-if="searchKeyword" class="cw-clear-btn" @click="searchKeyword = ''">
            <SvgIcon name="close" :size="12" />
          </button>
        </div>

        <!-- 层级筛选 -->
        <div class="cw-pill-group">
          <button
            v-for="t in tierOptions"
            :key="t.key"
            type="button"
            class="cw-pill-btn"
            :class="{ active: currentTierFilter === t.key }"
            @click="currentTierFilter = t.key"
          >
            {{ t.label }}
          </button>
        </div>

        <!-- 启停状态筛选 -->
        <div class="cw-pill-group">
          <button
            v-for="s in statusOptions"
            :key="s.key"
            type="button"
            class="cw-pill-btn"
            :class="{ active: currentStatusFilter === s.key }"
            @click="currentStatusFilter = s.key"
          >
            {{ s.label }}
          </button>
        </div>
      </div>

      <div class="cw-top-bar-right">
        <!-- 新建分类按钮 -->
        <button class="cw-btn cw-btn-primary cw-btn-sm" @click="showAddCategoryDialog = true">
          <SvgIcon name="folderPlus" :size="14" />
          <span>新建分类</span>
        </button>

        <!-- 查看契约接口文档抽屉开关 -->
        <button
          v-if="!connected"
          class="cw-btn cw-btn-ghost cw-btn-sm"
          :class="{ active: showContractsDoc }"
          data-cw-tooltip="查看供功能实现者接入的标准化接口定义"
          @click="showContractsDoc = !showContractsDoc"
        >
          <SvgIcon name="terminal" :size="14" />
          <span>接口规范</span>
        </button>

        <!-- 开发预览交互模式开关 -->
        <div v-if="!connected" class="cw-dev-mode-pill" :class="{ 'is-active': isDevPreviewMode }">
          <label class="cw-dev-mode-label" data-cw-tooltip="开启后可使用独立隔离的数据完整测试增删改、拖拽与启停">
            <input
              type="checkbox"
              :checked="isDevPreviewMode"
              @change="togglePreviewMode(($event.target as HTMLInputElement).checked, characters)"
            />
            <span>开发交互预览</span>
          </label>
        </div>
      </div>
    </div>

    <!-- 开发预览模式控制副条（仅预览模式显示） -->
    <div v-if="isDevPreviewMode" class="cw-dev-banner">
      <div class="cw-dev-banner-left">
        <span class="cw-badge cw-badge-accent">🛠️ 交互预览模式已开启</span>
        <span class="cw-dev-hint">当前操作使用隔离的内存数据，不影响酒馆实际存档。</span>
      </div>
      <div class="cw-dev-banner-right">
        <label
          class="cw-simulate-fail-label"
          data-cw-tooltip="勾选后所有操作模拟失败，用于检验界面是否坚守失败保留原状态原则"
        >
          <input v-model="simulateFailure" type="checkbox" />
          <span>模拟数据层报错（测试状态回滚）</span>
        </label>
      </div>
    </div>

    <!-- 筛选锁定提示条 -->
    <div v-if="isFilterActive" class="cw-filter-locked-bar">
      <SvgIcon name="alertCircle" :size="14" />
      <span data-cw-tooltip="搜索或状态筛选期间锁定拖拽，避免打乱未显示角色的顺序；清除筛选后恢复。"
        >筛选中，拖拽已锁定</span
      >
      <button class="cw-btn cw-btn-ghost cw-btn-xs" @click="clearFilters">清除筛选</button>
    </div>

    <!-- 展开/折叠的后端接入接口规范面板 -->
    <div v-if="showContractsDoc" class="cw-contracts-card">
      <div class="cw-contracts-header">
        <div class="cw-contracts-title">
          <SvgIcon name="terminal" :size="16" />
          <strong>前端已就绪：供数据层与后台服务接入的标准化接口规范</strong>
        </div>
        <button class="cw-btn cw-btn-ghost cw-btn-xs" @click="showContractsDoc = false">收起</button>
      </div>
      <p class="cw-contracts-desc">
        前端界面严格遵守职责边界：未接入实际持久化前，不修改任何全局快照或冒充保存。功能实现者实现以下接口后即可无缝对接：
      </p>
      <div class="cw-contracts-grid">
        <div class="cw-contract-item">
          <span class="cw-code-tag">分类列表及顺序</span>
          <code>categories: CharacterCategory[] = [{ id, name, isDefault, collapsed }]</code>
        </div>
        <div class="cw-contract-item">
          <span class="cw-code-tag">角色归属与启停映射</span>
          <code>charMetaMap: Record&lt;charId, { categoryId, order, enabled }&gt;</code>
        </div>
        <div class="cw-contract-item">
          <span class="cw-code-tag">分类 CRUD 回调</span>
          <code>createCategory(name) / renameCategory(id, name) / deleteCategory(id) / reorderCategories(ids)</code>
        </div>
        <div class="cw-contract-item">
          <span class="cw-code-tag">角色移动与排序</span>
          <code>moveCharacterToCategory(charId, catId, index?) / reorderCharactersInCategory(catId, ids)</code>
        </div>
        <div class="cw-contract-item">
          <span class="cw-code-tag">单人与批量启停</span>
          <code>toggleCharacterEnabled(charId, enabled) / batchToggleCategoryEnabled(catId, enabled, charIds)</code>
        </div>
      </div>
    </div>

    <!-- 主体分类与角色网格 -->
    <div class="cw-organize-body">
      <div class="cw-category-lanes-container">
        <div
          v-for="(cat, catIndex) in categories"
          :key="cat.id"
          class="cw-category-lane"
          :class="{
            'is-drop-lane-active': dragOverLaneCatId === cat.id,
            'is-collapsed': cat.collapsed,
          }"
          @dragover.prevent="handleLaneDragOver($event, cat.id)"
          @dragleave="handleLaneDragLeave(cat.id)"
          @drop.prevent="handleLaneDrop($event, cat.id)"
        >
          <!-- 分类列顶栏 -->
          <div class="cw-lane-header">
            <!-- 分类重排拖拽手柄 -->
            <div
              v-if="!isFilterActive"
              class="cw-cat-drag-handle"
              draggable="true"
              data-cw-tooltip="按住拖拽以重排分类顺序"
              @dragstart="handleCatDragStart($event, cat.id, catIndex)"
              @dragend="handleCatDragEnd"
            >
              <SvgIcon name="gripVertical" :size="14" />
            </div>

            <div class="cw-lane-title-group" @click="cat.collapsed = !cat.collapsed">
              <span class="cw-lane-chevron" :class="{ 'is-collapsed': cat.collapsed }">
                <SvgIcon name="chevronDown" :size="12" />
              </span>
              <SvgIcon name="folder" :size="14" class="cw-lane-icon" />

              <!-- 行内重命名编辑态 -->
              <template v-if="editingCatId === cat.id">
                <input
                  ref="editCatInputRef"
                  v-model="editingCatName"
                  class="cw-cat-rename-input"
                  @click.stop
                  @keydown.enter="saveRenameCat(cat.id)"
                  @keydown.escape="editingCatId = null"
                />
                <button
                  class="cw-btn cw-btn-primary cw-btn-xs"
                  data-cw-tooltip="保存名称"
                  @click.stop="saveRenameCat(cat.id)"
                >
                  <SvgIcon name="check" :size="12" />
                </button>
                <button class="cw-btn cw-btn-ghost cw-btn-xs" data-cw-tooltip="取消" @click.stop="editingCatId = null">
                  <SvgIcon name="close" :size="12" />
                </button>
              </template>

              <!-- 常规标题呈现 -->
              <template v-else>
                <h4 class="cw-lane-name" :data-cw-tooltip="cat.name">{{ cat.name }}</h4>
                <button
                  v-if="!cat.isDefault"
                  class="cw-btn-icon-link"
                  data-cw-tooltip="重命名分类"
                  @click.stop="startRenameCat(cat)"
                >
                  <SvgIcon name="edit" :size="12" />
                </button>
              </template>

              <!-- 统计 Badge -->
              <span class="cw-badge" :data-cw-tooltip="getCategoryStatTitle(cat.id)">
                {{ getCategoryStatText(cat.id) }} 开启
              </span>
            </div>

            <!-- 分类操作按钮群 -->
            <div class="cw-lane-actions" @click.stop>
              <!-- 批量启停 -->
              <button
                type="button"
                class="cw-btn-batch"
                :data-cw-tooltip="getBatchToggleTooltip(cat.id)"
                :disabled="isCategoryEmpty(cat.id)"
                @click="triggerBatchToggle(cat.id)"
              >
                <SvgIcon
                  :name="
                    getCategoryStats(cat.id, characters, currentTierFilter).checkState === 'all'
                      ? 'checkSquare'
                      : getCategoryStats(cat.id, characters, currentTierFilter).checkState === 'mixed'
                        ? 'minusSquare'
                        : 'square'
                  "
                  :size="14"
                  :class="{
                    'is-on': getCategoryStats(cat.id, characters, currentTierFilter).checkState === 'all',
                    'is-mixed': getCategoryStats(cat.id, characters, currentTierFilter).checkState === 'mixed',
                  }"
                />
                <span>批量</span>
              </button>

              <!-- 移动分类次序（点击上移/下移，兼顾触屏） -->
              <button
                class="cw-btn-icon"
                data-cw-tooltip="分类左移"
                :disabled="catIndex === 0"
                @click="reorderCategories(catIndex, catIndex - 1)"
              >
                <SvgIcon name="arrowLeft" :size="12" />
              </button>

              <!-- 删除分类（未分类保留） -->
              <button
                v-if="!cat.isDefault"
                class="cw-btn-icon cw-btn-danger-hover"
                data-cw-tooltip="删除分类（内含角色归入未分类）"
                @click="confirmDeleteCat(cat)"
              >
                <SvgIcon name="trash" :size="13" />
              </button>
            </div>
          </div>

          <!-- 分类卡片内容 -->
          <div v-show="!cat.collapsed" class="cw-lane-content">
            <div
              v-for="(c, charIdx) in getCategoryCharacters(cat.id, characters, {
                tierFilter: currentTierFilter,
                statusFilter: currentStatusFilter,
                keyword: searchKeyword,
              })"
              :key="c.id"
              class="cw-organize-card"
              :aria-busy="c.statusState === 'pending'"
              :class="{
                'is-inactive': !c.enabled,
                'is-dragging': draggingCharId === c.id,
                'drop-above': charDropIndicator?.targetCharId === c.id && charDropIndicator?.position === 'above',
                'drop-below': charDropIndicator?.targetCharId === c.id && charDropIndicator?.position === 'below',
              }"
              @dragover.prevent="handleCardDragOver($event, cat.id, c.id, charIdx)"
              @dragleave="handleCardDragLeave(c.id)"
              @drop.prevent="handleCardDrop($event, cat.id, charIdx)"
            >
              <!-- 角色拖拽手柄 -->
              <div
                v-if="!isFilterActive"
                class="cw-card-drag-handle"
                draggable="true"
                data-cw-tooltip="按住拖拽以排序或跨分类移动"
                @dragstart="handleCardDragStart($event, c.id, cat.id)"
                @dragend="handleCardDragEnd"
                @click.stop
              >
                <SvgIcon name="gripVertical" :size="14" />
              </div>

              <div class="cw-card-avatar">
                <CharacterAvatar :name="c.name" :size="34" />
              </div>

              <div class="cw-card-body">
                <div class="cw-card-name-row">
                  <span class="cw-card-name" :data-cw-tooltip="c.name">{{ c.name }}</span>
                  <CwToggleSwitch
                    silent-pending
                    class="cw-name-switch"
                    :model-value="c.enabled"
                    :status="c.statusState"
                    size="sm"
                    @change="val => toggleCharacterEnabled(c.id, val)"
                  />
                </div>
                <div class="cw-character-meta">
                  <span>{{ c.tier }}</span>
                  <span v-if="c.age != null">{{ c.age }}岁</span>
                  <span v-if="!c.enabled" class="cw-badge cw-badge-muted">已停用</span>
                </div>
                <OccupationTags :value="c.occupation" compact />
                <div class="cw-card-actions" @click.stop>
                  <div class="cw-quick-move" data-cw-tooltip="移动到其他分类；也可使用左侧手柄拖拽">
                    <select
                      class="cw-quick-select"
                      :disabled="c.statusState === 'pending'"
                      :aria-label="`移动${c.name}到分类`"
                      :value="c.categoryId"
                      @change="moveCharacter(c.id, ($event.target as HTMLSelectElement).value)"
                      @click.stop
                    >
                      <option v-for="targetCat in categories" :key="targetCat.id" :value="targetCat.id">
                        {{ targetCat.name }}
                      </option>
                    </select>
                    <span>移动分类</span>
                    <SvgIcon name="chevronDown" :size="11" />
                  </div>
                  <button class="cw-btn cw-btn-ghost cw-btn-xs" @click="emit('inspectCharacter', c.id)">
                    <span>查看档案</span><SvgIcon name="chevronRight" :size="12" />
                  </button>
                </div>
              </div>
            </div>

            <!-- 空分类占位 / 拖拽提示 -->
            <div
              v-if="
                getCategoryCharacters(cat.id, characters, {
                  tierFilter: currentTierFilter,
                  statusFilter: currentStatusFilter,
                  keyword: searchKeyword,
                }).length === 0
              "
              class="cw-lane-empty-box"
            >
              <span>{{ isFilterActive ? '暂无匹配角色' : '暂无角色，可拖入此处整理' }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 新建分类弹窗 -->
    <div v-if="showAddCategoryDialog" class="cw-inline-modal-backdrop" @click.self="showAddCategoryDialog = false">
      <div class="cw-inline-modal-box">
        <div class="cw-inline-modal-header">
          <SvgIcon name="folderPlus" :size="16" />
          <h4>新建自定义角色分类</h4>
        </div>
        <div class="cw-inline-modal-body">
          <label class="cw-label">分类名称（如：学校、商业街、家庭、街坊等）：</label>
          <input
            v-model="newCategoryName"
            type="text"
            placeholder="请输入分类名称..."
            class="cw-modal-input"
            @keydown.enter="handleConfirmAddCat"
          />
          <span class="cw-modal-tip"
            >第一版采用单层主分类；分类仅用于个人资料归纳整理，不影响角色真实职业与地点设定。</span
          >
        </div>
        <div class="cw-inline-modal-actions">
          <button class="cw-btn cw-btn-ghost" @click="showAddCategoryDialog = false">取消</button>
          <button class="cw-btn cw-btn-primary" :disabled="!newCategoryName.trim()" @click="handleConfirmAddCat">
            确认新建
          </button>
        </div>
      </div>
    </div>

    <!-- 删除分类确认弹窗（明确说明角色安全转入未分类） -->
    <div v-if="targetDeleteCategory" class="cw-inline-modal-backdrop" @click.self="targetDeleteCategory = null">
      <div class="cw-inline-modal-box">
        <div class="cw-inline-modal-header cw-danger-header">
          <SvgIcon name="alertTriangle" :size="16" class="cw-danger" />
          <h4>确认删除分类：{{ targetDeleteCategory.name }}？</h4>
        </div>
        <div class="cw-inline-modal-body">
          <p class="cw-modal-desc">删除分类后，原属于该分类的角色将<strong>安全自动归入“未分类”</strong>。</p>
          <p class="cw-modal-desc cw-safe-note">
            依照规则，角色的启停状态、人设背景、记忆及关系网<strong>均完整保留，不删除也不关闭任何角色</strong>。
          </p>
        </div>
        <div class="cw-inline-modal-actions">
          <button class="cw-btn cw-btn-ghost" @click="targetDeleteCategory = null">取消</button>
          <button class="cw-btn cw-btn-danger" @click="handleExecuteDeleteCat">确认移除分类</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import SvgIcon from '../icons/SvgIcon.vue';
import CharacterAvatar from '../shared/CharacterAvatar.vue';
import OccupationTags from '../shared/OccupationTags.vue';
import CwToggleSwitch from './CwToggleSwitch.vue';
import { useCharacterDisplayState, DEFAULT_CATEGORY_ID } from './useCharacterDisplayState';
import type { CharacterCategory } from './category-types';

const props = defineProps<{
  characters: Record<string, any>;
}>();

const emit = defineEmits<{
  (e: 'inspectCharacter', charId: string): void;
  (e: 'feedback', message: string): void;
}>();

const {
  categories,
  connected,
  isDevPreviewMode,
  simulateFailure,
  togglePreviewMode,
  getCategoryCharacters,
  getCategoryStats,
  createCategory,
  renameCategory,
  deleteCategory,
  reorderCategories,
  moveCharacter,
  toggleCharacterEnabled,
  batchToggleCategory,
} = useCharacterDisplayState();

const searchKeyword = ref('');
const currentTierFilter = ref<'all' | '主要' | '次要'>('all');
const currentStatusFilter = ref<'all' | 'enabled' | 'disabled'>('all');
const showContractsDoc = ref(false);

const tierOptions = [
  { key: 'all' as const, label: '全部层级' },
  { key: '主要' as const, label: '主要角色' },
  { key: '次要' as const, label: '次要角色' },
];

const statusOptions = [
  { key: 'all' as const, label: '全部状态' },
  { key: 'enabled' as const, label: '仅已开启' },
  { key: 'disabled' as const, label: '仅已关闭' },
];

const isFilterActive = computed(() => {
  return searchKeyword.value.trim() !== '' || currentTierFilter.value !== 'all' || currentStatusFilter.value !== 'all';
});

function clearFilters() {
  searchKeyword.value = '';
  currentTierFilter.value = 'all';
  currentStatusFilter.value = 'all';
}

function getCategoryStatText(catId: string): string {
  const stats = getCategoryStats(catId, props.characters, currentTierFilter.value);
  return `${stats.enabled}/${stats.total}`;
}

function getCategoryStatTitle(catId: string): string {
  const stats = getCategoryStats(catId, props.characters, currentTierFilter.value);
  return `该分类共 ${stats.total} 位角色（开启 ${stats.enabled}，关闭 ${stats.disabled}）`;
}

function isCategoryEmpty(catId: string): boolean {
  const stats = getCategoryStats(catId, props.characters, currentTierFilter.value);
  return stats.total === 0;
}

function getBatchToggleTooltip(catId: string): string {
  const stats = getCategoryStats(catId, props.characters, currentTierFilter.value);
  if (stats.total === 0) return '分类暂无角色';
  if (stats.checkState === 'all') return `已全部开启（${stats.total}/${stats.total}），点击一键全部关闭`;
  if (stats.checkState === 'none') return `已全部关闭（0/${stats.total}），点击一键全部开启`;
  return `当前部分开启（${stats.enabled}/${stats.total}），点击一键全部开启`;
}

async function triggerBatchToggle(catId: string) {
  await batchToggleCategory(catId, props.characters, undefined, currentTierFilter.value);
}

// ========================== 新建 / 重命名 / 删除分类 ==========================
const showAddCategoryDialog = ref(false);
const newCategoryName = ref('');

async function handleConfirmAddCat() {
  if (!newCategoryName.value.trim()) return;
  const ok = await createCategory(newCategoryName.value);
  if (ok) {
    newCategoryName.value = '';
    showAddCategoryDialog.value = false;
  }
}

const editingCatId = ref<string | null>(null);
const editingCatName = ref('');
const editCatInputRef = ref<HTMLInputElement[] | null>(null);

function startRenameCat(cat: CharacterCategory) {
  editingCatId.value = cat.id;
  editingCatName.value = cat.name;
  nextTick(() => {
    editCatInputRef.value?.[0]?.focus();
  });
}

async function saveRenameCat(catId: string) {
  if (!editingCatName.value.trim()) return;
  await renameCategory(catId, editingCatName.value);
  editingCatId.value = null;
}

const targetDeleteCategory = ref<CharacterCategory | null>(null);

function confirmDeleteCat(cat: CharacterCategory) {
  targetDeleteCategory.value = cat;
}

async function handleExecuteDeleteCat() {
  if (!targetDeleteCategory.value) return;
  await deleteCategory(targetDeleteCategory.value.id);
  targetDeleteCategory.value = null;
}

// ========================== 拖拽整理交互 ==========================
// 1. 角色卡片拖拽
const draggingCharId = ref<string | null>(null);
const draggingCharCatId = ref<string | null>(null);
const charDropIndicator = ref<{ targetCharId: string; position: 'above' | 'below' } | null>(null);
const dragOverLaneCatId = ref<string | null>(null);

function handleCardDragStart(e: DragEvent, charId: string, catId: string) {
  if (isFilterActive.value) {
    e.preventDefault();
    return;
  }
  draggingCharId.value = charId;
  draggingCharCatId.value = catId;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'character', charId, sourceCategoryId: catId }));
  }
}

function handleCardDragEnd() {
  draggingCharId.value = null;
  draggingCharCatId.value = null;
  charDropIndicator.value = null;
  dragOverLaneCatId.value = null;
}

function handleLaneDragOver(e: DragEvent, catId: string) {
  if (isFilterActive.value || !draggingCharId.value) return;
  dragOverLaneCatId.value = catId;
}

function handleLaneDragLeave(catId: string) {
  if (dragOverLaneCatId.value === catId) {
    dragOverLaneCatId.value = null;
  }
}

async function handleLaneDrop(e: DragEvent, catId: string) {
  const charId = draggingCharId.value;
  if (!charId || isFilterActive.value) return;
  await moveCharacter(charId, catId);
  handleCardDragEnd();
}

function handleCardDragOver(e: DragEvent, catId: string, targetCharId: string, index: number) {
  if (isFilterActive.value || !draggingCharId.value || draggingCharId.value === targetCharId) return;

  const targetEl = e.currentTarget as HTMLElement;
  const rect = targetEl.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  const position = e.clientY < midY ? 'above' : 'below';

  charDropIndicator.value = { targetCharId, position };
}

function handleCardDragLeave(charId: string) {
  if (charDropIndicator.value?.targetCharId === charId) {
    charDropIndicator.value = null;
  }
}

async function handleCardDrop(e: DragEvent, catId: string, targetIndex: number) {
  const charId = draggingCharId.value;
  if (!charId || isFilterActive.value) return;

  const pos = charDropIndicator.value?.position;
  const finalIndex = pos === 'below' ? targetIndex + 1 : targetIndex;

  await moveCharacter(charId, catId, finalIndex);
  handleCardDragEnd();
}

// 2. 分类顺序拖拽
const draggingCatId = ref<string | null>(null);
const draggingCatIndex = ref<number | null>(null);

function handleCatDragStart(e: DragEvent, catId: string, index: number) {
  if (isFilterActive.value) {
    e.preventDefault();
    return;
  }
  draggingCatId.value = catId;
  draggingCatIndex.value = index;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'category', categoryId: catId }));
  }
}

function handleCatDragEnd() {
  draggingCatId.value = null;
  draggingCatIndex.value = null;
}
</script>

<style scoped lang="scss">
.cw-organize-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
  overflow: hidden;
}

/* 顶部操作条 */
.cw-organize-top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 14px;
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius);

  .cw-top-bar-left {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    flex: 1;
  }

  .cw-top-bar-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
}

.cw-search-box {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: var(--cw-radius);
  border: 1px solid var(--cw-border);
  background: var(--cw-bg-surface);
  min-width: 180px;

  &:focus-within {
    border-color: var(--cw-accent);
  }

  .cw-search-input {
    border: none;
    background: transparent;
    outline: none;
    font-size: 13px;
    color: var(--cw-text-primary);
    width: 100%;
  }

  .cw-clear-btn {
    background: none;
    border: none;
    color: var(--cw-text-muted);
    cursor: pointer;
    padding: 0;
  }
}

.cw-pill-group {
  display: flex;
  background: var(--cw-bg-surface);
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius-sm);
  padding: 2px;
  gap: 2px;

  .cw-pill-btn {
    padding: 3px 8px;
    border: none;
    background: transparent;
    border-radius: 4px;
    font-size: 12px;
    color: var(--cw-text-secondary);
    cursor: pointer;
    transition: all 0.15s;

    &:hover {
      color: var(--cw-text-primary);
    }

    &.active {
      background: var(--cw-accent-bg);
      color: var(--cw-accent);
      font-weight: 600;
    }
  }
}

.cw-dev-mode-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: var(--cw-radius);
  border: 1px solid var(--cw-border);
  background: var(--cw-bg-surface);
  font-size: 12px;

  &.is-active {
    border-color: var(--cw-accent);
    background: var(--cw-accent-bg);
  }

  .cw-dev-mode-label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    color: var(--cw-text-primary);
    font-weight: 500;
  }
}

.cw-dev-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
  border-radius: var(--cw-radius-sm);
  background: var(--cw-accent-bg);
  border: 1px solid var(--cw-accent-border);
  font-size: 12px;
  flex-wrap: wrap;

  .cw-dev-banner-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .cw-dev-hint {
    color: var(--cw-text-secondary);
  }

  .cw-simulate-fail-label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    color: var(--cw-danger);
    font-weight: 500;
  }
}

.cw-filter-locked-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: var(--cw-radius-sm);
  background: var(--cw-warning-bg);
  border: 1px solid rgba(217, 130, 43, 0.3);
  color: var(--cw-warning);
  font-size: 12px;
}

/* 接口规范卡片 */
.cw-contracts-card {
  padding: 12px 16px;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-panel);
  border: 1px solid var(--cw-accent-border);
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;

  .cw-contracts-header {
    display: flex;
    align-items: center;
    justify-content: space-between;

    .cw-contracts-title {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--cw-accent);
    }
  }

  .cw-contracts-desc {
    margin: 0;
    color: var(--cw-text-secondary);
    line-height: 1.4;
  }

  .cw-contracts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 6px;

    .cw-contract-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 6px 8px;
      background: var(--cw-bg-surface);
      border-radius: var(--cw-radius-sm);
      border: 1px solid var(--cw-border);

      .cw-code-tag {
        font-weight: 600;
        color: var(--cw-text-primary);
        font-size: 11px;
      }

      code {
        font-family: monospace;
        font-size: 11px;
        color: var(--cw-accent);
        word-break: break-all;
      }
    }
  }
}

/* 主体栏目容器 */
.cw-organize-body {
  flex: 1;
  overflow-y: auto;
}

.cw-category-lanes-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cw-category-lane {
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius);
  background: var(--cw-bg-surface);
  overflow: hidden;
  transition: all 0.2s;

  &.is-drop-lane-active {
    border-color: var(--cw-accent);
    box-shadow: 0 0 0 2px var(--cw-accent-bg);
  }

  .cw-lane-header {
    padding: 10px 14px;
    background: var(--cw-bg-card-subtle);
    border-bottom: 1px solid var(--cw-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;

    .cw-cat-drag-handle {
      cursor: grab;
      color: var(--cw-text-muted);
      padding: 2px;

      &:hover {
        color: var(--cw-accent);
      }
      &:active {
        cursor: grabbing;
      }
    }

    .cw-lane-title-group {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      min-width: 0;
      cursor: pointer;

      .cw-lane-chevron {
        color: var(--cw-text-muted);
        transition: transform 0.2s;
        display: flex;
        align-items: center;

        &.is-collapsed {
          transform: rotate(-90deg);
        }
      }

      .cw-lane-icon {
        color: var(--cw-accent);
      }

      .cw-lane-name {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        color: var(--cw-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .cw-cat-rename-input {
        padding: 2px 6px;
        font-size: 13px;
        border: 1px solid var(--cw-accent);
        border-radius: var(--cw-radius-sm);
        background: var(--cw-bg-surface);
        color: var(--cw-text-primary);
        outline: none;
      }
    }

    .cw-lane-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }
  }

  .cw-lane-content {
    padding: 10px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
    gap: 8px;

    @media (max-width: 640px) {
      grid-template-columns: 1fr;
    }
  }
}

.cw-organize-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card);
  border: 1px solid var(--cw-border);
  transition: all 0.15s;
  position: relative;
  min-height: 52px;
  box-sizing: border-box;

  &:hover {
    border-color: var(--cw-border-hover);
    box-shadow: var(--cw-shadow-sm);
  }

  &.is-inactive {
    opacity: 0.62;
    background: var(--cw-bg-card-subtle);

    .cw-card-name {
      color: var(--cw-text-muted);
    }
  }

  &.is-dragging {
    opacity: 0.35;
  }

  &.drop-above {
    border-top: 2px solid var(--cw-accent) !important;
  }
  &.drop-below {
    border-bottom: 2px solid var(--cw-accent) !important;
  }

  .cw-card-drag-handle {
    cursor: grab;
    color: var(--cw-text-muted);
    padding: 4px 2px;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
      color: var(--cw-accent);
    }
    &:active {
      cursor: grabbing;
    }
  }

  .cw-card-avatar {
    flex-shrink: 0;
  }

  .cw-card-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;

    .cw-card-name-row {
      display: flex;
      align-items: center;
      gap: 6px;

      .cw-card-name {
        font-size: 13px;
        font-weight: 600;
        color: var(--cw-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }

    .cw-card-meta {
      display: flex;
      align-items: center;
      gap: 6px;

      .cw-card-age {
        font-size: 11px;
        color: var(--cw-text-muted);
      }
    }
  }

  .cw-card-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    margin-top: 5px;
    justify-content: space-between;
  }

  .cw-quick-move {
    position: relative;
    width: auto;
    gap: 4px;
    padding: 0 4px;
    font-size: 11px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--cw-radius-sm);
    border: 1px solid var(--cw-border);
    color: var(--cw-text-muted);

    &:hover {
      border-color: var(--cw-accent);
      color: var(--cw-accent);
    }

    .cw-quick-select {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      cursor: pointer;
    }
  }
}

.cw-btn-batch {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  font-size: 12px;
  border-radius: var(--cw-radius-sm);
  border: 1px solid var(--cw-border);
  background: var(--cw-bg-surface);
  color: var(--cw-text-secondary);
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: var(--cw-accent);
    color: var(--cw-accent);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .is-on {
    color: var(--cw-success);
  }
  .is-mixed {
    color: var(--cw-warning);
  }
}

.cw-btn-icon {
  background: none;
  border: 1px solid transparent;
  color: var(--cw-text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--cw-radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover:not(:disabled) {
    border-color: var(--cw-border);
    color: var(--cw-text-primary);
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  &.cw-btn-danger-hover:hover {
    border-color: var(--cw-danger);
    color: var(--cw-danger);
  }
}

.cw-btn-icon-link {
  background: none;
  border: none;
  color: var(--cw-text-muted);
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;

  &:hover {
    color: var(--cw-accent);
  }
}

.cw-lane-empty-box {
  grid-column: 1 / -1;
  padding: 20px;
  text-align: center;
  font-size: 12px;
  color: var(--cw-text-muted);
  border: 1px dashed var(--cw-border);
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card-subtle);
}

/* 行内弹窗 */
.cw-inline-modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--cw-bg-backdrop);
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
}

.cw-inline-modal-box {
  width: 440px;
  max-width: 100%;
  background: var(--cw-bg-surface);
  border-radius: var(--cw-radius-lg);
  border: 1px solid var(--cw-border);
  box-shadow: var(--cw-shadow-modal);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.cw-inline-modal-header {
  padding: 14px 18px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--cw-border);
  background: var(--cw-bg-card-subtle);

  h4 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }

  &.cw-danger-header h4 {
    color: var(--cw-danger);
  }
}

.cw-inline-modal-body {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;

  .cw-label {
    font-size: 13px;
    color: var(--cw-text-secondary);
    font-weight: 500;
  }

  .cw-modal-input {
    padding: 8px 12px;
    border-radius: var(--cw-radius);
    border: 1px solid var(--cw-border);
    background: var(--cw-bg-input);
    font-size: 13px;
    color: var(--cw-text-primary);
    outline: none;

    &:focus {
      border-color: var(--cw-accent);
    }
  }

  .cw-modal-tip {
    font-size: 11px;
    color: var(--cw-text-muted);
    line-height: 1.4;
  }

  .cw-modal-desc {
    margin: 0;
    font-size: 13px;
    color: var(--cw-text-primary);
    line-height: 1.5;

    &.cw-safe-note {
      color: var(--cw-text-muted);
      font-size: 12px;
    }
  }
}

.cw-inline-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 20px;
  border-top: 1px solid var(--cw-border);
  background: var(--cw-bg-card-subtle);
}

.cw-badge-info {
  background: var(--cw-info-bg);
  color: var(--cw-info);
  border-color: rgba(61, 122, 184, 0.3);
}

.cw-badge-muted {
  background: var(--cw-bg-card-subtle);
  color: var(--cw-text-muted);
  border-color: var(--cw-border);
}

.cw-name-switch {
  margin-left: auto;
}
.cw-character-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--cw-text-muted);
}
.cw-character-meta > span {
  white-space: nowrap;
}
.cw-quick-move:focus-within {
  outline: 2px solid var(--cw-accent);
  outline-offset: 2px;
}
.cw-organize-card .cw-quick-move {
  flex-shrink: 0;
  white-space: nowrap;
}
.cw-organize-card .cw-card-actions {
  flex-wrap: wrap;
  .cw-btn {
    font-size: 11px;
    padding: 3px 4px;
    white-space: nowrap;
    gap: 3px;
  }
}
.cw-filter-locked-bar {
  flex-shrink: 0;
  > span {
    flex: 1;
  }
  > button {
    flex-shrink: 0;
    white-space: nowrap;
  }
}
</style>
