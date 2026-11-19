<template>
  <div class="cw-char-category-sidebar">
    <!-- 1. 顶部检索与快速状态筛选 -->
    <div class="cw-sidebar-top">
      <div class="cw-sidebar-search">
        <SvgIcon name="search" :size="14" />
        <input
          v-model="searchKeyword"
          type="text"
          placeholder="搜索姓名 / 身份..."
          class="cw-search-input"
          aria-label="搜索角色"
        />
        <button v-if="searchKeyword" class="cw-clear-search-btn" data-cw-tooltip="清除搜索" @click="searchKeyword = ''">
          <SvgIcon name="close" :size="12" />
        </button>
      </div>

      <!-- 启停状态筛选标签栏 -->
      <div class="cw-status-filter-bar">
        <button
          v-for="f in filterTabs"
          :key="f.key"
          type="button"
          class="cw-filter-tab-btn"
          :class="{ active: currentStatusFilter === f.key }"
          @click="currentStatusFilter = f.key"
        >
          <span>{{ f.label }}</span>
          <span class="cw-filter-count">({{ f.count }})</span>
        </button>
      </div>
    </div>

    <!-- 筛选生效时的拖拽锁定提示 -->
    <div v-if="isFilterActive" class="cw-drag-locked-hint">
      <SvgIcon name="info" :size="12" />
      <span>筛选生效中已锁定拖拽排序，防止未显示角色位置错乱。</span>
    </div>

    <!-- 2. 分类折叠列表主体 -->
    <div class="cw-category-scroll-container">
      <div
        v-for="cat in visibleCategories"
        :key="cat.id"
        class="cw-category-block"
        :class="{
          'is-drop-target': dragTargetCatId === cat.id,
          'is-collapsed': cat.collapsed,
        }"
        @dragover.prevent="handleCatDragOver($event, cat.id)"
        @dragleave="handleCatDragLeave(cat.id)"
        @drop.prevent="handleCatDrop($event, cat.id)"
      >
        <!-- 分类表头 -->
        <div
          class="cw-category-header"
          role="button"
          tabindex="0"
          :data-cw-tooltip="`点击${cat.collapsed ? '展开' : '折叠'}分类`"
          @click="toggleCatCollapse(cat.id)"
          @keydown.enter.self.prevent="toggleCatCollapse(cat.id)"
          @keydown.space.self.prevent="toggleCatCollapse(cat.id)"
        >
          <div class="cw-cat-header-left">
            <span class="cw-cat-chevron" :class="{ 'is-collapsed': cat.collapsed }">
              <SvgIcon name="chevronDown" :size="13" />
            </span>
            <SvgIcon name="folder" :size="14" class="cw-cat-icon" />
            <span class="cw-cat-title" :data-cw-tooltip="cat.name">{{ cat.name }}</span>
            <span class="cw-cat-stat-badge" :data-cw-tooltip="getCategoryStatTitle(cat.id)">
              {{ getCategoryStatText(cat.id) }}
            </span>
          </div>

          <div class="cw-cat-header-right" @click.stop>
            <!-- 分类批量启停按钮 -->
            <button
              type="button"
              class="cw-btn-batch-toggle"
              :data-cw-tooltip="getBatchToggleTooltip(cat.id)"
              :disabled="isCategoryEmpty(cat.id)"
              @click.stop="triggerBatchToggle(cat.id)"
            >
              <SvgIcon
                :name="
                  getCategoryStats(cat.id, characters, tier).checkState === 'all'
                    ? 'checkSquare'
                    : getCategoryStats(cat.id, characters, tier).checkState === 'mixed'
                      ? 'minusSquare'
                      : 'square'
                "
                :size="14"
                :class="{
                  'is-all-on': getCategoryStats(cat.id, characters, tier).checkState === 'all',
                  'is-mixed': getCategoryStats(cat.id, characters, tier).checkState === 'mixed',
                }"
              />
              <span class="cw-batch-label">批量</span>
            </button>
          </div>
        </div>

        <!-- 分类内角色列表 -->
        <div v-show="!cat.collapsed" class="cw-category-char-list">
          <div
            v-for="(c, index) in getCategoryCharacters(cat.id, characters, {
              tierFilter: tier,
              statusFilter: currentStatusFilter,
              keyword: searchKeyword,
            })"
            :key="c.id"
            class="cw-char-item"
            :aria-busy="c.statusState === 'pending'"
            :class="{
              active: selectedId === c.id,
              'is-disabled-char': !c.enabled,
              'is-dragging': draggingCharId === c.id,
              'drop-above': dropIndicator?.targetCharId === c.id && dropIndicator?.position === 'above',
              'drop-below': dropIndicator?.targetCharId === c.id && dropIndicator?.position === 'below',
            }"
            role="button"
            tabindex="0"
            @click="emit('select', c.id)"
            @keydown.enter.self="emit('select', c.id)"
            @keydown.space.self.prevent="emit('select', c.id)"
            @dragover.prevent="handleItemDragOver($event, cat.id, c.id, index)"
            @dragleave="handleItemDragLeave(c.id)"
            @drop.prevent="handleItemDrop($event, cat.id, index)"
          >
            <!-- 拖拽专用手柄（独立区域，彻底杜绝点击详情与拖拽冲突） -->
            <div
              v-if="!isFilterActive"
              class="cw-drag-handle"
              draggable="true"
              data-cw-tooltip="按住拖拽以重排或跨组移动"
              @dragstart="handleItemDragStart($event, c.id, cat.id)"
              @dragend="handleItemDragEnd"
              @click.stop
            >
              <SvgIcon name="gripVertical" :size="14" />
            </div>

            <!-- 头像 -->
            <div class="cw-item-avatar">
              <CharacterAvatar :name="c.name" :size="28" />
            </div>

            <div class="cw-item-info">
              <div class="cw-item-name-row">
                <span class="cw-item-name" :data-cw-tooltip="c.name">{{ c.name }}</span>
                <CwToggleSwitch
                  silent-pending
                  class="cw-name-switch"
                  :model-value="c.enabled"
                  :status="c.statusState"
                  size="sm"
                  @change="val => handleSingleToggle(c.id, val)"
                />
              </div>

              <!-- 紧凑副行：年龄、简短职业、停用状态与轻量移组 -->
              <div class="cw-item-sub-row">
                <span v-if="c.age != null" class="cw-meta-pill">{{ c.age }}岁</span>
                <span v-if="c.gender" class="cw-meta-pill">{{ c.gender }}</span>
                <span
                  v-if="getShortOccupation(c.occupation)"
                  class="cw-short-occupation"
                  :data-cw-tooltip="getShortOccupation(c.occupation)"
                >
                  {{ getShortOccupation(c.occupation) }}
                </span>
                <span v-if="!c.enabled" class="cw-badge cw-badge-muted">已停用</span>

                <div class="cw-move-select-wrapper" data-cw-tooltip="移动到其他分类；也可使用左侧手柄拖拽" @click.stop>
                  <select
                    class="cw-move-select"
                    :disabled="c.statusState === 'pending'"
                    :aria-label="`移动${c.name}到分类`"
                    :value="c.categoryId"
                    @change="handleQuickMove(c.id, ($event.target as HTMLSelectElement).value)"
                    @click.stop
                  >
                    <option v-for="targetCat in categories" :key="targetCat.id" :value="targetCat.id">
                      {{ targetCat.name }}
                    </option>
                  </select>
                  <SvgIcon name="folder" :size="11" />
                  <span class="cw-move-text">移组</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 分类内空状态提示（也是有效的拖拽释放区域） -->
          <div
            v-if="
              getCategoryCharacters(cat.id, characters, {
                tierFilter: tier,
                statusFilter: currentStatusFilter,
                keyword: searchKeyword,
              }).length === 0
            "
            class="cw-category-empty-placeholder"
          >
            <span>{{ isFilterActive ? '无符合筛选条件的角色' : '分类暂无角色，可拖入此处' }}</span>
          </div>
        </div>
      </div>

      <!-- 全局未检索到任何角色 -->
      <div v-if="totalFilteredCount === 0" class="cw-empty-result-tip">
        <SvgIcon name="search" :size="24" />
        <strong>未找到匹配角色</strong>
        <p>试着调整筛选或搜索关键词</p>
        <button class="cw-btn cw-btn-sm" @click="resetFilters">重置筛选</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import SvgIcon from '../icons/SvgIcon.vue';
import CharacterAvatar from '../shared/CharacterAvatar.vue';
import OccupationTags from '../shared/OccupationTags.vue';
import CwToggleSwitch from './CwToggleSwitch.vue';
import { useCharacterDisplayState, DEFAULT_CATEGORY_ID } from './useCharacterDisplayState';
import type { CharacterCategory, CharacterItemData } from './category-types';

const props = withDefaults(
  defineProps<{
    characters: Record<string, any>;
    selectedId?: string;
    tier?: 'all' | '主要' | '次要';
  }>(),
  {
    selectedId: '',
    tier: 'all',
  },
);

const emit = defineEmits<{
  (e: 'select', charId: string): void;
  (e: 'feedback', message: string): void;
}>();

function getShortOccupation(occupation: any): string {
  if (!occupation) return '';
  if (typeof occupation === 'string') return occupation;
  if (Array.isArray(occupation)) {
    const first = occupation.find(item => item != null && String(item).trim());
    return first ? String(first).trim() : '';
  }
  if (typeof occupation === 'object') {
    return (
      occupation.身份 ||
      occupation.职业 ||
      occupation.社会身份 ||
      Object.values(occupation).find(v => typeof v === 'string' && v.trim()) ||
      ''
    );
  }
  return String(occupation);
}

const {
  categories,
  charMetaMap,
  syncCharacters,
  getCategoryCharacters,
  getCategoryStats,
  moveCharacter,
  reorderCharacters,
  toggleCharacterEnabled,
  batchToggleCategory,
} = useCharacterDisplayState();

onMounted(() => {
  syncCharacters(props.characters);
});
watch(
  () => props.characters,
  val => syncCharacters(val),
  { deep: true },
);

const searchKeyword = ref('');
const currentStatusFilter = ref<'all' | 'enabled' | 'disabled'>('all');

const isFilterActive = computed(() => {
  return searchKeyword.value.trim() !== '' || currentStatusFilter.value !== 'all';
});

// 计算状态筛选数量
const filterTabs = computed(() => {
  let all = 0;
  let enabled = 0;
  let disabled = 0;

  for (const [id, c] of Object.entries(props.characters || {})) {
    const rawTier = c.层级 === '次要' ? '次要' : '主要';
    if (props.tier !== 'all' && rawTier !== props.tier) continue;
    const meta = charMetaMap.value[id];
    const isEn = meta ? meta.enabled : !(c._管理?.停用 === true || c.已停用 === true);
    all++;
    if (isEn) enabled++;
    else disabled++;
  }

  return [
    { key: 'all' as const, label: '全部', count: all },
    { key: 'enabled' as const, label: '已开启', count: enabled },
    { key: 'disabled' as const, label: '已关闭', count: disabled },
  ];
});

// 总过滤条目计数
const totalFilteredCount = computed(() => {
  let count = 0;
  for (const cat of categories.value) {
    count += getCategoryCharacters(cat.id, props.characters, {
      tierFilter: props.tier,
      statusFilter: currentStatusFilter.value,
      keyword: searchKeyword.value,
    }).length;
  }
  return count;
});

// 筛选后仅展示非空的分类，或者无筛选时展示全部分类
const visibleCategories = computed(() => {
  return categories.value;
});

function toggleCatCollapse(catId: string) {
  const cat = categories.value.find(c => c.id === catId);
  if (cat) cat.collapsed = !cat.collapsed;
}

function getCategoryStatText(catId: string): string {
  const stats = getCategoryStats(catId, props.characters, props.tier);
  return `${stats.enabled}/${stats.total}`;
}

function getCategoryStatTitle(catId: string): string {
  const stats = getCategoryStats(catId, props.characters, props.tier);
  return `该分类共 ${stats.total} 位角色，当前开启 ${stats.enabled} 位，关闭 ${stats.disabled} 位`;
}

function isCategoryEmpty(catId: string): boolean {
  const stats = getCategoryStats(catId, props.characters, props.tier);
  return stats.total === 0;
}

function getBatchToggleTooltip(catId: string): string {
  const stats = getCategoryStats(catId, props.characters, props.tier);
  if (stats.total === 0) return '该分类暂无角色';
  if (stats.checkState === 'all') return `已全部开启（${stats.total}/${stats.total}），点击一键全部关闭`;
  if (stats.checkState === 'none') return `已全部关闭（0/${stats.total}），点击一键全部开启`;
  return `当前部分开启（${stats.enabled}/${stats.total}），点击一键全部开启`;
}

async function triggerBatchToggle(catId: string) {
  await batchToggleCategory(catId, props.characters, undefined, props.tier);
}

async function handleSingleToggle(charId: string, nextState: boolean) {
  await toggleCharacterEnabled(charId, nextState);
}

async function handleQuickMove(charId: string, targetCatId: string) {
  if (!targetCatId) return;
  await moveCharacter(charId, targetCatId);
}

function resetFilters() {
  searchKeyword.value = '';
  currentStatusFilter.value = 'all';
}

// ========================== 拖拽交互引擎 ==========================
const draggingCharId = ref<string | null>(null);
const draggingSourceCatId = ref<string | null>(null);
const dragTargetCatId = ref<string | null>(null);
const dropIndicator = ref<{ targetCharId: string; position: 'above' | 'below' } | null>(null);

function handleItemDragStart(e: DragEvent, charId: string, catId: string) {
  if (isFilterActive.value) {
    e.preventDefault();
    return;
  }
  draggingCharId.value = charId;
  draggingSourceCatId.value = catId;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'character', charId, sourceCategoryId: catId }));
  }
}

function handleItemDragEnd() {
  draggingCharId.value = null;
  draggingSourceCatId.value = null;
  dragTargetCatId.value = null;
  dropIndicator.value = null;
}

function handleCatDragOver(e: DragEvent, catId: string) {
  if (isFilterActive.value || !draggingCharId.value) return;
  dragTargetCatId.value = catId;
}

function handleCatDragLeave(catId: string) {
  if (dragTargetCatId.value === catId) {
    dragTargetCatId.value = null;
  }
}

async function handleCatDrop(e: DragEvent, catId: string) {
  const charId = draggingCharId.value;
  if (!charId || isFilterActive.value) return;

  // 如果是在末尾释放或空分类释放
  await moveCharacter(charId, catId);
  handleItemDragEnd();
}

function handleItemDragOver(e: DragEvent, catId: string, targetCharId: string, index: number) {
  if (isFilterActive.value || !draggingCharId.value) return;
  if (draggingCharId.value === targetCharId) return;

  const targetEl = e.currentTarget as HTMLElement;
  const rect = targetEl.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  const position = e.clientY < midY ? 'above' : 'below';

  dropIndicator.value = { targetCharId, position };
}

function handleItemDragLeave(charId: string) {
  if (dropIndicator.value?.targetCharId === charId) {
    dropIndicator.value = null;
  }
}

async function handleItemDrop(e: DragEvent, catId: string, targetIndex: number) {
  const charId = draggingCharId.value;
  if (!charId || isFilterActive.value) return;

  const pos = dropIndicator.value?.position;
  const finalIndex = pos === 'below' ? targetIndex + 1 : targetIndex;

  await moveCharacter(charId, catId, finalIndex);
  handleItemDragEnd();
}
</script>

<style scoped lang="scss">
.cw-char-category-sidebar {
  width: 290px;
  border-right: 1px solid var(--cw-border);
  display: flex;
  flex-direction: column;
  background: var(--cw-bg-surface);
  flex-shrink: 0;
  height: 100%;
  overflow: hidden;
  box-sizing: border-box;

  @media (max-width: 680px) {
    width: 100%;
    border-right: none;
  }
}

/* 顶部检索区 */
.cw-sidebar-top {
  padding: 10px 12px;
  border-bottom: 1px solid var(--cw-border);
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--cw-bg-card-subtle);
}

.cw-sidebar-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: var(--cw-radius);
  border: 1px solid var(--cw-border);
  background: var(--cw-bg-surface);
  color: var(--cw-text-muted);

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

    &::placeholder {
      color: var(--cw-text-muted);
    }
  }

  .cw-clear-search-btn {
    background: none;
    border: none;
    color: var(--cw-text-muted);
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
      color: var(--cw-text-primary);
    }
  }
}

/* 状态筛选 Tabs */
.cw-status-filter-bar {
  display: flex;
  gap: 4px;

  .cw-filter-tab-btn {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 4px 6px;
    font-size: 11px;
    border-radius: var(--cw-radius-sm);
    border: 1px solid transparent;
    background: transparent;
    color: var(--cw-text-secondary);
    cursor: pointer;
    transition: all 0.15s;

    &:hover {
      background: var(--cw-bg-surface);
      color: var(--cw-text-primary);
    }

    &.active {
      background: var(--cw-bg-surface);
      border-color: var(--cw-border);
      color: var(--cw-accent);
      font-weight: 600;
      box-shadow: var(--cw-shadow-sm);
    }

    .cw-filter-count {
      font-size: 10px;
      opacity: 0.8;
    }
  }
}

.cw-drag-locked-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--cw-warning-bg, rgba(217, 130, 43, 0.1));
  border-bottom: 1px solid rgba(217, 130, 43, 0.2);
  color: var(--cw-warning, #d9822b);
  font-size: 11px;
  line-height: 1.3;
}

/* 滚动列表 */
.cw-category-scroll-container {
  flex: 1;
  overflow-y: auto;
  padding: 8px 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cw-category-block {
  flex-shrink: 0;
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius);
  background: var(--cw-bg-surface);
  overflow: hidden;
  transition: border-color 0.15s;

  &.is-drop-target {
    border-color: var(--cw-accent);
    background: var(--cw-accent-bg);
  }
}

.cw-category-header {
  padding: 8px 10px;
  background: var(--cw-bg-card-subtle);
  border-bottom: 1px solid var(--cw-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
  font-size: 13px;

  &:hover {
    background: var(--cw-bg-panel);
  }

  .cw-cat-header-left {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    flex: 1;

    .cw-cat-chevron {
      color: var(--cw-text-muted);
      transition: transform 0.2s;
      display: flex;
      align-items: center;

      &.is-collapsed {
        transform: rotate(-90deg);
      }
    }

    .cw-cat-icon {
      color: var(--cw-accent);
      flex-shrink: 0;
    }

    .cw-cat-title {
      font-weight: 600;
      color: var(--cw-text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12px;
    }

    .cw-cat-stat-badge {
      font-size: 10px;
      padding: 1px 5px;
      border-radius: var(--cw-radius-full);
      background: var(--cw-bg-surface);
      border: 1px solid var(--cw-border);
      color: var(--cw-text-secondary);
      flex-shrink: 0;
    }
  }

  .cw-cat-header-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
}

.cw-btn-batch-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  font-size: 11px;
  border-radius: var(--cw-radius-sm);
  border: 1px solid var(--cw-border);
  background: var(--cw-bg-surface);
  color: var(--cw-text-secondary);
  cursor: pointer;
  transition: all 0.15s;

  &:hover:not(:disabled) {
    border-color: var(--cw-accent);
    color: var(--cw-accent);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .is-all-on {
    color: var(--cw-success, #3f8f6b);
  }
  .is-mixed {
    color: var(--cw-warning, #d9822b);
  }

  .cw-batch-label {
    font-size: 10px;
  }
}

.cw-category-char-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
}

.cw-char-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px;
  border-radius: var(--cw-radius-sm);
  border: 1px solid transparent;
  cursor: pointer;
  transition:
    background-color 0.15s,
    border-color 0.15s;
  user-select: none;
  min-height: 48px;
  box-sizing: border-box;

  &:hover {
    background: var(--cw-bg-card-subtle);
  }

  &.active {
    background: var(--cw-accent-bg);
    border-color: var(--cw-accent-border);

    .cw-item-name {
      color: var(--cw-accent);
    }
  }

  &.is-disabled-char {
    opacity: 0.65;
    filter: grayscale(0.2);

    .cw-item-name {
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

  .cw-drag-handle {
    cursor: grab;
    color: var(--cw-text-muted);
    padding: 4px 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.45;
    transition: opacity 0.15s;

    &:hover {
      opacity: 1;
      color: var(--cw-accent);
    }
    &:active {
      cursor: grabbing;
    }
  }

  .cw-item-avatar {
    flex-shrink: 0;
  }

  .cw-item-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    overflow: hidden;

    .cw-item-name-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      overflow: hidden;

      .cw-item-name {
        font-size: 13px;
        font-weight: 600;
        color: var(--cw-text-primary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .cw-name-switch {
        flex-shrink: 0;
      }
    }

    .cw-item-sub-row {
      display: flex;
      align-items: center;
      gap: 5px;
      overflow: hidden;
      font-size: 11px;
      color: var(--cw-text-muted);
      line-height: 1.3;

      .cw-meta-pill {
        flex-shrink: 0;
        color: var(--cw-text-secondary);
      }

      .cw-short-occupation {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        background: var(--cw-bg-surface);
        border: 1px solid var(--cw-border);
        border-radius: var(--cw-radius-xs, 3px);
        padding: 0 4px;
        font-size: 10px;
        color: var(--cw-accent);
        max-width: 80px;
        flex-shrink: 1;
      }

      .cw-move-select-wrapper {
        margin-left: auto;
        flex-shrink: 0;
      }
    }
  }

  .cw-move-select-wrapper {
    position: relative;
    width: auto;
    gap: 3px;
    padding: 1px 5px;
    font-size: 10px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--cw-text-muted);
    border-radius: var(--cw-radius-xs, 3px);
    border: 1px solid transparent;

    &:hover {
      border-color: var(--cw-border);
      color: var(--cw-text-primary);
      background: var(--cw-bg-surface);
    }

    .cw-move-select {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      cursor: pointer;
    }

    .cw-move-text {
      font-size: 10px;
      white-space: nowrap;
    }
  }
}

.cw-badge-muted {
  background: var(--cw-bg-card-subtle);
  color: var(--cw-text-muted);
  border-color: var(--cw-border);
  font-size: 10px;
  padding: 1px 4px;
}

.cw-badge-sm {
  font-size: 10px;
  padding: 1px 4px;
}

.cw-category-empty-placeholder {
  padding: 12px 10px;
  text-align: center;
  font-size: 11px;
  color: var(--cw-text-muted);
  border: 1px dashed var(--cw-border);
  border-radius: var(--cw-radius-sm);
  margin: 4px;
  background: var(--cw-bg-card-subtle);
}

.cw-empty-result-tip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 30px 16px;
  text-align: center;
  color: var(--cw-text-secondary);

  p {
    margin: 0;
    font-size: 12px;
    color: var(--cw-text-muted);
  }
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
.cw-move-select-wrapper:focus-within {
  outline: 2px solid var(--cw-accent);
  outline-offset: 2px;
}
</style>
