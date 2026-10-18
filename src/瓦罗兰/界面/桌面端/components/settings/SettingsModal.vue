<template>
  <div class="cw-modal-backdrop" @click.self="emit('close')">
    <div class="cw-modal-box cw-settings-modal">
      <!-- 顶栏 -->
      <div class="cw-modal-header">
        <div class="cw-header-title">
          <SvgIcon name="settings" :size="20" class="cw-header-icon" />
          <span>系统与外观设置</span>
        </div>
        <button class="cw-btn cw-btn-ghost cw-close-btn" @click="emit('close')">
          <SvgIcon name="close" :size="18" />
        </button>
      </div>

      <!-- 设置 Tab 导航 (四项四字文案、等宽等高栅格布局) -->
      <div class="cw-modal-tabs" role="tablist" aria-label="系统与外观设置导航">
        <button
          v-for="t in tabs"
          :key="t.key"
          type="button"
          role="tab"
          class="cw-modal-tab-btn"
          :class="{ active: currentTab === t.key }"
          :aria-selected="currentTab === t.key"
          @click="switchTab(t.key)"
        >
          <SvgIcon :name="t.icon" :size="15" />
          <span>{{ t.label }}</span>
        </button>
      </div>

      <!-- 主体内容 (使用 v-show 保持各 Tab 状态存活，避免切页丢失未保存输入) -->
      <div ref="modalBodyRef" class="cw-modal-body">
        <TabTheme
          v-show="currentTab === 'theme'"
          :initial-theme="currentTheme"
          @change-theme="t => emit('changeTheme', t)"
        />
        <TabFont
          v-show="currentTab === 'font'"
          :initial-font="currentFont"
          :initial-font-size="currentFontSize"
          :initial-ui-scale="currentUiScale"
          :initial-line-height="currentLineHeight"
          :initial-letter-spacing="currentLetterSpacing"
          :initial-paragraph-spacing="currentParagraphSpacing"
          @change-font="f => emit('changeFont', f)"
          @change-font-size="s => emit('changeFontSize', s)"
          @change-ui-scale="sc => emit('changeUiScale', sc)"
          @change-line-height="v => emit('changeLineHeight', v)"
          @change-letter-spacing="v => emit('changeLetterSpacing', v)"
          @change-paragraph-spacing="v => emit('changeParagraphSpacing', v)"
        />
        <TabApiSettings
          v-show="currentTab === 'api'"
          :initial-section="initialSection"
          @feedback="msg => emit('feedback', msg)"
        />
        <TabRosterAndKnowledge
          ref="rosterKnowledgeRef"
          v-show="currentTab === 'roster_knowledge'"
          :active="currentTab === 'roster_knowledge'"
          :initial-sub-tab="initialSubTab"
          @feedback="msg => emit('feedback', msg)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue';
import type { ApiChannel } from '../../../../运行/settings';
import SvgIcon from '../icons/SvgIcon.vue';
import TabTheme from './TabTheme.vue';
import TabFont from './TabFont.vue';
import TabApiSettings from './TabApiSettings.vue';
import TabRosterAndKnowledge, { type SubTabKey } from './TabRosterAndKnowledge.vue';

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}

const props = defineProps<{
  currentTheme?: string;
  currentFont?: string;
  currentFontSize?: number;
  currentUiScale?: number;
  currentLineHeight?: number;
  currentLetterSpacing?: number;
  currentParagraphSpacing?: number;
  initialTab?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'changeTheme', theme: string): void;
  (e: 'changeFont', font: string): void;
  (e: 'changeFontSize', size: number): void;
  (e: 'changeUiScale', scale: number): void;
  (e: 'changeLineHeight', value: number): void;
  (e: 'changeLetterSpacing', value: number): void;
  (e: 'changeParagraphSpacing', value: number): void;
  (e: 'feedback', msg: string): void;
}>();

// 统一四项四字文案
const tabs = [
  { key: 'theme', label: '色彩主题', icon: 'smile' },
  { key: 'font', label: '字体排版', icon: 'edit' },
  { key: 'api', label: '接口配置', icon: 'settings' },
  { key: 'roster_knowledge', label: '资料调度', icon: 'users' },
];

function normalizeTab(t?: string): string {
  if (!t) return 'theme';
  if (['api', 'auxApi', 'selectionApi'].includes(t)) return 'api';
  if (['characters', 'information', 'roster_knowledge'].includes(t)) return 'roster_knowledge';
  return t;
}

const currentTab = ref(normalizeTab(props.initialTab));

// 深层路由映射：旧 initialTab 映射到对应 API 分区或资料子页
const initialSection = computed<ApiChannel | undefined>(() => {
  if (props.initialTab === 'api') return 'variable';
  if (props.initialTab === 'auxApi') return 'phone';
  if (props.initialTab === 'selectionApi') return 'information';
  return undefined;
});

const initialSubTab = computed<SubTabKey | undefined>(() => {
  if (props.initialTab === 'characters') return 'roster';
  if (props.initialTab === 'information') return 'locations';
  return undefined;
});

const modalBodyRef = ref<HTMLElement | null>(null);
const rosterKnowledgeRef = ref<InstanceType<typeof TabRosterAndKnowledge> | null>(null);

// 顶层 Tab 滚动位置记忆
const tabScrollPositions: Record<string, number> = {
  theme: 0,
  font: 0,
  api: 0,
  roster_knowledge: 0,
};
let isSwitchingTab = false;

async function switchTab(target: string) {
  if (currentTab.value === target) return;
  if (currentTab.value === 'roster_knowledge') {
    rosterKnowledgeRef.value?.saveCurrentScroll();
  } else if (modalBodyRef.value) {
    tabScrollPositions[currentTab.value] = modalBodyRef.value.scrollTop;
  }
  isSwitchingTab = true;
  currentTab.value = target;
  await nextTick();
  if (modalBodyRef.value) {
    if (target === 'roster_knowledge') {
      rosterKnowledgeRef.value?.restoreScroll();
    } else {
      modalBodyRef.value.scrollTop = tabScrollPositions[target] ?? 0;
    }
  }
  setTimeout(() => {
    isSwitchingTab = false;
  }, 50);
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  const el = modalBodyRef.value;
  if (!el) return;
  const onScroll = () => {
    if (!isSwitchingTab && currentTab.value !== 'roster_knowledge') {
      tabScrollPositions[currentTab.value] = el.scrollTop;
    }
  };
  el.addEventListener('scroll', onScroll, { passive: true });
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>

<style scoped lang="scss">
.cw-settings-modal {
  width: 680px;
  height: 600px;
  max-width: 96vw;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
}

.cw-modal-header {
  padding: 16px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--cw-border);
  background: var(--cw-bg-card-subtle);
  flex-shrink: 0;

  .cw-header-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 16px;
    font-weight: 600;
  }
}

/* 等宽、等高、固定栅格的顶层 Tab 导航条 */
.cw-modal-tabs {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--cw-border);
  background: var(--cw-bg-surface);
  flex-shrink: 0;
  box-sizing: border-box;

  .cw-modal-tab-btn {
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
    gap: 6px;
    padding: 0 8px;
    border-radius: var(--cw-radius);
    border: 1px solid transparent;
    background: transparent;
    color: var(--cw-text-secondary);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    box-sizing: border-box;
    transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;

    &:hover {
      background: var(--cw-bg-card-subtle);
      color: var(--cw-text-primary);
    }

    &.active {
      background: var(--cw-accent-bg);
      color: var(--cw-accent);
      border-color: var(--cw-accent-border);
      font-weight: 500;
      box-shadow: var(--cw-shadow-sm);
    }
  }
}

.cw-modal-body {
  flex: 1;
  overflow-y: auto;
  scrollbar-gutter: stable;
  padding: 20px 24px;
}

@media (max-width: 640px) {
  .cw-settings-modal {
    width: 100% !important;
    height: 100% !important;
    border-radius: 0;
  }

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
    padding: 6px 8px;
    gap: 4px;

    .cw-modal-tab-btn {
      height: 32px;
      padding: 0 4px;
      font-size: 11.5px;
      gap: 4px;
    }
  }

  .cw-modal-body {
    padding: 12px 10px;
  }
}
</style>
