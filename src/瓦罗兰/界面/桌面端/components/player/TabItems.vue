<template>
  <div class="cw-tab-pane cw-player-items-pane">
    <!-- 物品分类筛选 -->
    <div class="cw-category-filter">
      <button
        v-for="cat in categories"
        :key="cat.key"
        class="cw-cat-btn"
        :class="{ active: currentCategory === cat.key }"
        @click="currentCategory = cat.key"
      >
        <span>{{ cat.label }}</span>
        <span class="cw-cat-count">({{ getCategoryCount(cat.key) }})</span>
      </button>
    </div>

    <!-- 物品列表网格 -->
    <div v-if="filteredItems.length > 0" class="cw-items-grid">
      <div v-for="item in filteredItems" :key="item.id" class="cw-item-card">
        <div class="cw-item-header">
          <div class="cw-item-title-group">
            <span class="cw-item-name">{{ item.名称 || item.id }}</span>
            <span class="cw-badge" :class="getCategoryBadgeClass(item.类别)">{{ item.类别 || '其他' }}</span>
          </div>
          <span v-if="item.数量 !== null && item.数量 !== undefined" class="cw-item-qty">
            {{ item.数量 }} {{ item.单位 ?? '单位未知' }}
          </span>
          <span v-else class="cw-item-qty">数量未知</span>
        </div>

        <p class="cw-item-desc">{{ item.描述 || '暂无详细说明' }}</p>

        <div class="cw-item-footer">
          <span class="cw-item-meta">位置：{{ place(item.存放地点id ?? (item.持有人id ? state.角色[item.持有人id]?.当前地点id : state.玩家.当前状态.当前地点id)) }} · 持有人：{{ holder(item.持有人id ?? state.玩家.id) }}</span>
          <button class="cw-btn cw-btn-xs cw-btn-primary" @click="emit('useItem', item)">
            <SvgIcon name="bolt" :size="12" />
            <span>使用</span>
          </button>
        </div>
      </div>
    </div>
    <div v-else class="cw-empty-backdrop">
      <SvgIcon name="backpack" :size="36" class="cw-empty-icon" />
      <div class="cw-empty-title">该分类下暂无物品</div>
      <div class="cw-empty-desc">当前随身背包与物品栏在此分类中没有任何收录。</div>
      <button v-if="currentCategory !== 'all'" class="cw-btn cw-btn-ghost cw-btn-xs cw-empty-action" @click="currentCategory = 'all'">
        查看全部物品 ({{ rawItems.length }})
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useWorldState, locationName } from '../../utils/context';
const state = useWorldState();
const place = (id: any) => locationName(state?.value, id);
const holder = (id: string) =>
  id === state.value.玩家.id ? (state.value.玩家.姓名 ?? '玩家') : (state.value.角色[id]?.姓名 ?? '未知');
import { ref, computed } from 'vue';
import SvgIcon from '../icons/SvgIcon.vue';

const props = defineProps<{
  player: any;
}>();

const emit = defineEmits<{
  (e: 'useItem', item: any): void;
}>();

const categories = [
  { key: 'all', label: '全部' },
  { key: '消耗品', label: '消耗品' },
  { key: '工具与设备', label: '工具与设备' },
  { key: '穿戴用品', label: '穿戴用品' },
  { key: '资料与凭证', label: '资料与凭证' },
  { key: '其他非消耗品', label: '其他非消耗品' },
];

const currentCategory = ref('all');

const rawItems = computed(() => {
  const inventory = props.player?.物品栏;
  if (!inventory || typeof inventory !== 'object') return [];
  return Object.entries(inventory).map(([id, val]: [string, any]) => ({
    id,
    ...val,
  }));
});

function getCategoryCount(catKey: string) {
  if (catKey === 'all') return rawItems.value.length;
  return rawItems.value.filter(item => {
    const cat = item.类别 || '其他非消耗品';
    return (
      cat === catKey || (catKey === '其他非消耗品' && !['消耗品', '工具与设备', '穿戴用品', '资料与凭证'].includes(cat))
    );
  }).length;
}

const filteredItems = computed(() => {
  if (currentCategory.value === 'all') return rawItems.value;
  return rawItems.value.filter(item => {
    const cat = item.类别 || '其他非消耗品';
    if (currentCategory.value === '其他非消耗品') {
      return !['消耗品', '工具与设备', '穿戴用品', '资料与凭证'].includes(cat);
    }
    return cat === currentCategory.value;
  });
});

function getCategoryBadgeClass(category?: string) {
  switch (category) {
    case '消耗品':
      return 'cw-badge-warning';
    case '工具与设备':
      return 'cw-badge-accent';
    case '穿戴用品':
      return 'cw-badge-success';
    case '资料与凭证':
      return 'cw-badge-info';
    default:
      return '';
  }
}
</script>

<style scoped lang="scss">
.cw-player-items-pane {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1 0 auto;
  min-height: 0;
  container-type: inline-size;
  container-name: items-pane;
}

.cw-category-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  .cw-cat-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 5px 12px;
    border-radius: var(--cw-radius-full);
    border: 1px solid var(--cw-border);
    background: var(--cw-bg-card);
    color: var(--cw-text-secondary);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s;

    &:hover {
      background: var(--cw-bg-card-hover);
      color: var(--cw-text-primary);
    }

    &.active {
      background: var(--cw-accent-bg);
      color: var(--cw-accent);
      border-color: var(--cw-accent-border);
      font-weight: 600;
    }

    .cw-cat-count {
      font-size: 11px;
      opacity: 0.8;
    }
  }
}

.cw-items-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

@container items-pane (max-width: 540px) {
  .cw-items-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }
}

@media (max-width: 640px) {
  .cw-items-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }
}

.cw-item-card {
  min-width: 0;
  overflow-wrap: anywhere;
  padding: 12px 14px;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card);
  border: 1px solid var(--cw-border);
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: all 0.15s ease;

  &:hover {
    border-color: var(--cw-border-hover);
    box-shadow: var(--cw-shadow-sm);
  }

  .cw-item-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 6px 10px;

    .cw-item-title-group {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      flex: 1 1 auto;
      flex-wrap: wrap;
    }

    .cw-item-name {
      font-weight: 600;
      font-size: 14px;
      color: var(--cw-text-primary);
    }

    .cw-item-qty {
      flex-shrink: 0;
      white-space: nowrap;
      font-family: monospace, sans-serif;
      font-weight: 700;
      font-size: 13px;
      color: var(--cw-accent);
    }
  }

  .cw-item-desc {
    font-size: 12px;
    color: var(--cw-text-secondary);
    line-height: 1.5;
    margin: 0;
    flex: 1;
  }

  .cw-item-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px 12px;
    padding-top: 8px;
    border-top: 1px dashed var(--cw-border);

    .cw-item-meta {
      flex: 1 1 160px;
      min-width: 0;
      font-size: 11.5px;
      line-height: 1.5;
      color: var(--cw-text-muted);
    }

    .cw-btn {
      flex-shrink: 0;
      white-space: nowrap;
      margin-left: auto;
    }
  }
  .cw-item-meta {
    font-size: 11.5px;
    line-height: 1.6;
    color: var(--cw-text-muted);
    white-space: pre-wrap;
  }
}

.cw-empty-tip {
  padding: 40px 0;
  text-align: center;
  color: var(--cw-text-muted);
  font-size: 13px;
}

.cw-empty-backdrop {
  flex: 1 0 auto;
  width: 100%;
  min-height: 0;
  box-sizing: border-box;
  margin: 0;
  padding: 36px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  border: none;
  border-radius: 0;
  background: transparent;

  .cw-empty-icon {
    color: var(--cw-text-muted);
    opacity: 0.35;
    margin-bottom: 12px;
  }

  .cw-empty-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--cw-text-secondary);
    margin-bottom: 6px;
  }

  .cw-empty-desc {
    font-size: 12px;
    color: var(--cw-text-muted);
    line-height: 1.6;
    max-width: 260px;
  }

  .cw-empty-action {
    margin-top: 14px;
  }
}
</style>
