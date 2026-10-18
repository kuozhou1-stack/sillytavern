<template>
  <div ref="rootRef" class="cw-roster-knowledge-view">
    <!-- 二级分段导航控制器 (四字等宽等高导航，避免徽章挤压宽度) -->
    <div class="cw-subnav-bar" role="tablist" aria-label="资料与调度分类导航">
      <button
        v-for="item in subTabs"
        :key="item.key"
        type="button"
        role="tab"
        class="cw-subnav-btn"
        :class="{ active: currentSubTab === item.key }"
        :aria-selected="currentSubTab === item.key"
        @click="switchSubTab(item.key)"
      >
        <SvgIcon :name="item.icon" :size="15" />
        <span class="cw-subnav-label">{{ item.label }}</span>
      </button>
    </div>

    <!-- 独立统计指标区 (从 Tab 按钮中抽离，保证导航绝对稳定不抖动) -->
    <div class="cw-knowledge-summary-bar" aria-label="资料与调度全局统计" aria-live="polite">
      <div class="cw-summary-chip">
        <SvgIcon name="users" :size="13" />
        <span>主要角色 <strong>{{ majorActiveCount }}</strong> 席活跃 (共 {{ totalActiveCount }} 人)</span>
      </div>
      <div class="cw-summary-divider"></div>
      <div class="cw-summary-chip">
        <SvgIcon name="mapPin" :size="13" />
        <span>地点已展开 <strong>{{ locExpanded }}</strong> / {{ locCount }} 处</span>
      </div>
      <div class="cw-summary-divider"></div>
      <div class="cw-summary-chip">
        <SvgIcon name="shield" :size="13" />
        <span>组织已展开 <strong>{{ orgExpanded }}</strong> / {{ orgCount }} 个</span>
      </div>
    </div>

    <!-- 子视口展示区 (使用 v-show 保持各 Tab 实例存活，结合 scrollPositions 保留滚动与未保存状态) -->
    <div class="cw-subnav-content">
      <!-- 1. 角色调度 -->
      <TabCharacterRoster
        v-show="currentSubTab === 'roster'"
        @feedback="msg => emit('feedback', msg)"
      />

      <!-- 2. 地点调度 (kind 严格受外层 Tab 驱动，无内层混杂切换) -->
      <TabWorldInformation
        v-show="currentSubTab === 'locations'"
        kind="地点"
        @feedback="msg => emit('feedback', msg)"
      />

      <!-- 3. 组织调度 (kind 严格受外层 Tab 驱动，无内层混杂切换) -->
      <TabWorldInformation
        v-show="currentSubTab === 'organizations'"
        kind="组织"
        @feedback="msg => emit('feedback', msg)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { RuntimeKey, type Runtime } from '../../../../运行/host';
import { effectiveInformationIds } from '../../../../运行/knowledge-context';
import SvgIcon from '../icons/SvgIcon.vue';
import TabCharacterRoster from './TabCharacterRoster.vue';
import TabWorldInformation from './TabWorldInformation.vue';

export type SubTabKey = 'roster' | 'locations' | 'organizations';

const props = withDefaults(
  defineProps<{
    initialSubTab?: SubTabKey;
    active?: boolean;
  }>(),
  {
    active: true,
  },
);
const emit = defineEmits<{ (e: 'feedback', msg: string): void }>();
const runtime = inject<Runtime | null>(RuntimeKey, null);

const rootRef = ref<HTMLElement | null>(null);
const currentSubTab = ref<SubTabKey>(props.initialSubTab || 'roster');

// 滚动位置记忆表，解决切页时高度变化导致 scrollTop 被浏览器自动清零的问题
const subScrollPositions: Record<SubTabKey, number> = {
  roster: 0,
  locations: 0,
  organizations: 0,
};
let isSwitchingSubTab = false;

function saveCurrentScroll() {
  const container = rootRef.value?.closest('.cw-modal-body');
  if (container) {
    subScrollPositions[currentSubTab.value] = container.scrollTop;
  }
}

async function switchSubTab(target: SubTabKey) {
  if (currentSubTab.value === target) return;
  saveCurrentScroll();
  isSwitchingSubTab = true;
  currentSubTab.value = target;
  await nextTick();
  const container = rootRef.value?.closest('.cw-modal-body');
  if (container) {
    container.scrollTop = subScrollPositions[target] ?? 0;
  }
  setTimeout(() => {
    isSwitchingSubTab = false;
  }, 50);
}

function restoreScroll() {
  const container = rootRef.value?.closest('.cw-modal-body');
  if (container) {
    isSwitchingSubTab = true;
    container.scrollTop = subScrollPositions[currentSubTab.value] ?? 0;
    setTimeout(() => {
      isSwitchingSubTab = false;
    }, 50);
  }
}

defineExpose({ restoreScroll, switchSubTab, saveCurrentScroll });

watch(() => props.initialSubTab, val => {
  if (val && val !== currentSubTab.value) {
    switchSubTab(val);
  }
});

onMounted(() => {
  const container = rootRef.value?.closest('.cw-modal-body');
  if (!container) return;
  const onScroll = () => {
    if (!props.active || isSwitchingSubTab) return;
    subScrollPositions[currentSubTab.value] = container.scrollTop;
  };
  container.addEventListener('scroll', onScroll, { passive: true });
  onBeforeUnmount(() => {
    container.removeEventListener('scroll', onScroll);
  });
});

const state = computed(() => runtime?.view.data);

// 统计数据：主要角色活跃席位、地点与组织已展开数
const majorActiveCount = computed(() =>
  Object.values(state.value?.角色 ?? {}).filter(r => r.层级 === '主要').length,
);
const totalActiveCount = computed(() =>
  Object.keys(state.value?.角色 ?? {}).length,
);
const locCount = computed(() => Object.keys(state.value?.地点 ?? {}).length);
const orgCount = computed(() => Object.keys(state.value?.组织 ?? {}).length);
const locExpanded = computed(() => state.value ? effectiveInformationIds(state.value, '地点').size : 0);
const orgExpanded = computed(() => state.value ? effectiveInformationIds(state.value, '组织').size : 0);

// 三项统一为四字文案
const subTabs = [
  {
    key: 'roster' as SubTabKey,
    label: '角色调度',
    icon: 'users',
  },
  {
    key: 'locations' as SubTabKey,
    label: '地点调度',
    icon: 'mapPin',
  },
  {
    key: 'organizations' as SubTabKey,
    label: '组织调度',
    icon: 'shield',
  },
];
</script>

<style scoped lang="scss">
.cw-roster-knowledge-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 等宽、等高、固定栅格的二级导航条，杜绝切页宽度抖动 */
.cw-subnav-bar {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  padding: 4px;
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius);
  flex-shrink: 0;
  box-sizing: border-box;

  .cw-subnav-btn {
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 10px;
    border-radius: var(--cw-radius-sm, 6px);
    border: 1px solid transparent;
    background: transparent;
    color: var(--cw-text-secondary);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    box-sizing: border-box;
    transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;

    &:hover {
      background: var(--cw-bg-card);
      color: var(--cw-text-primary);
    }

    &.active {
      background: var(--cw-bg-surface);
      border-color: var(--cw-border);
      color: var(--cw-accent);
      font-weight: 500;
      box-shadow: var(--cw-shadow-sm);
    }
  }
}

/* 独立统计指标条 */
.cw-knowledge-summary-bar {
  display: flex;
  align-items: center;
  justify-content: space-around;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 12px;
  background: var(--cw-bg-surface);
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius-sm, 8px);
  font-size: 12px;
  color: var(--cw-text-secondary);

  .cw-summary-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;

    strong {
      color: var(--cw-accent);
      font-weight: 600;
    }
  }

  .cw-summary-divider {
    width: 1px;
    height: 12px;
    background: var(--cw-border);
  }
}

.cw-subnav-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

@media (max-width: 640px) {
  .cw-knowledge-summary-bar {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;

    .cw-summary-divider {
      display: none;
    }
  }
}
</style>
