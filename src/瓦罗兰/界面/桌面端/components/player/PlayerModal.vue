<template>
  <div class="cw-modal-backdrop" @click.self="emit('close')">
    <div class="cw-modal-box cw-player-modal cw-gameplay-panel" :style="gameplayModalSize">
      <!-- 弹窗顶栏 -->
      <div class="cw-modal-header">
        <div class="cw-header-title">
          <SvgIcon name="user" :size="20" class="cw-header-icon" />
          <span>玩家档案与状态中心</span>
        </div>
        <button class="cw-btn cw-btn-ghost cw-close-btn cw-gameplay-close" aria-label="关闭玩家档案" @click="emit('close')">
          <SvgIcon name="close" :size="18" />
        </button>
      </div>

      <!-- 档案 Tab 导航 -->
      <div class="cw-modal-tabs">
        <button
          v-for="t in tabs"
          :key="t.key"
          class="cw-modal-tab-btn"
          :class="{ active: currentTab === t.key }"
          :aria-pressed="currentTab === t.key"
          @click="currentTab = t.key"
        >
          <SvgIcon :name="t.icon" :size="15" />
          <span>{{ t.label }}</span>
        </button>
      </div>

      <!-- Tab 主体内容 -->
      <div class="cw-modal-body" :class="{ 'cw-items-body': currentTab === 'items' }">
        <TabInfo v-if="currentTab === 'info'" :player="player" />
        <TabStatus v-else-if="currentTab === 'status'" :player="player" />
        <TabSkills v-else-if="currentTab === 'skills'" :player="player" />
        <TabRecords v-else-if="currentTab === 'records'" :player="player" />
        <TabItems v-else-if="currentTab === 'items'" :player="player" @use-item="item => emit('useItem', item)" />
        <TabGoals v-else-if="currentTab === 'goals'" :player="player" :world-covenants="worldCovenants" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { gameplayModalSize } from '../../utils/gameplay-modal-size';
import SvgIcon from '../icons/SvgIcon.vue';
import TabInfo from './TabInfo.vue';
import TabStatus from './TabStatus.vue';
import TabSkills from './TabSkills.vue';
import TabRecords from './TabRecords.vue';
import TabItems from './TabItems.vue';
import TabGoals from './TabGoals.vue';

const props = defineProps<{
  player: any;
  initialTab?: string;
  worldCovenants?: Record<string, any>;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'useItem', item: any): void;
}>();

const tabs = [
  { key: 'info', label: '信息', icon: 'user' },
  { key: 'status', label: '状态', icon: 'heart' },
  { key: 'skills', label: '技能', icon: 'bolt' },
  { key: 'records', label: '记录与认知', icon: 'bookmark' },
  { key: 'items', label: '物品', icon: 'backpack' },
  { key: 'goals', label: '目标与约定', icon: 'target' },
];

const currentTab = ref(props.initialTab || 'info');
</script>

<style scoped lang="scss">
.cw-modal-header {
  padding: 16px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--cw-border);
  background: var(--cw-bg-card-subtle);

  .cw-header-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 16px;
    font-weight: 600;
    color: var(--cw-text-primary);
  }

  .cw-header-icon {
    color: var(--cw-accent);
  }
}

.cw-modal-tabs {
  display: flex;
  gap: 8px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--cw-border);
  background: var(--cw-bg-surface);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }

  .cw-modal-tab-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: var(--cw-radius);
    border: 1px solid transparent;
    background: transparent;
    color: var(--cw-text-secondary);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
    flex-shrink: 0;

    &:hover {
      background: var(--cw-bg-card-subtle);
      color: var(--cw-text-primary);
    }

    &.active {
      background: var(--cw-accent-bg);
      color: var(--cw-accent);
      border-color: var(--cw-accent-border);
      font-weight: 600;
    }
  }
}

.cw-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

.cw-items-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

@media (max-width: 640px) {
  .cw-modal-header {
    padding: 8px 12px;
    min-height: 36px;

    .cw-header-title {
      font-size: 13.5px;
      gap: 6px;
    }

    .cw-close-btn {
      padding: 2px;
    }
  }

  .cw-modal-tabs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    padding: 6px 10px;
    gap: 2px 4px;

    .cw-modal-tab-btn {
      justify-content: center;
      min-height: 28px;
      padding: 3px 2px;
      font-size: 11.5px;
    }
  }

  .cw-modal-body {
    padding: 10px 12px;
  }
}
</style>
