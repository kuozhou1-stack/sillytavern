<template>
  <div class="cw-tab-pane cw-settings-theme-pane">
    <div class="cw-callout cw-callout-info cw-theme-notice">
      <SvgIcon name="info" :size="15" class="cw-callout-icon" />
      <div class="cw-callout-body">
        <p>切换整套前端色彩主题。主题样式覆盖正文背景、对话框、顶栏、手机应用、所有居中弹窗与控件。</p>
      </div>
    </div>

    <div class="cw-theme-grid">
      <div
        v-for="t in themes"
        :key="t.key"
        class="cw-theme-card"
        :class="{ active: currentTheme === t.key }"
        @click="selectTheme(t.key)"
      >
        <div class="cw-theme-preview" :style="{ background: t.bg, borderColor: t.border }">
          <div class="cw-preview-bar" :style="{ background: t.bar }"></div>
          <div class="cw-preview-bubble" :style="{ background: t.card, borderColor: t.border }">
            <div class="cw-preview-line" :style="{ background: t.text }"></div>
            <div class="cw-preview-line cw-line-short" :style="{ background: t.accent }"></div>
          </div>
        </div>

        <div class="cw-theme-info">
          <div class="cw-theme-name-row">
            <span class="cw-theme-name">{{ t.name }}</span>
            <span v-if="currentTheme === t.key" class="cw-badge cw-badge-accent">当前选用</span>
          </div>
          <span class="cw-theme-desc">{{ t.desc }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import SvgIcon from '../icons/SvgIcon.vue';

const props = defineProps<{
  initialTheme?: string;
}>();

const emit = defineEmits<{
  (e: 'changeTheme', theme: string): void;
}>();

const currentTheme = ref(props.initialTheme || 'warm');

const themes = [
  {
    key: 'warm',
    name: '谐振暖调日常',
    desc: '温暖米白与琥珀色调，温馨宜人，适合长时间沉浸式日常阅读。',
    bg: '#f8f6f0',
    bar: '#f5f3ec',
    card: '#ffffff',
    text: '#2d2822',
    accent: '#c4783c',
    border: '#dcd6c8',
  },
  {
    key: 'clean',
    name: '纯净现代晴蓝',
    desc: '明亮清爽的冷白与蔚蓝点缀，极简现代，富有科技感与秩序感。',
    bg: '#f0f4f8',
    bar: '#e8eef5',
    card: '#ffffff',
    text: '#1a2533',
    accent: '#2176c7',
    border: '#c5d5e6',
  },
  {
    key: 'dark',
    name: '暗夜海潮深色',
    desc: '深邃夜空黑蓝与荧光天蓝，极佳弱光夜间对比度，护眼深沉。',
    bg: '#12161c',
    bar: '#1a212b',
    card: '#1c2530',
    text: '#e6edf5',
    accent: '#3894f2',
    border: '#2a3b4f',
  },
  {
    key: 'book',
    name: '薄暮秋水书页',
    desc: '仿羊皮纸与古旧书卷色泽，深墨色文字，古典文艺，质感典雅。',
    bg: '#f4eee2',
    bar: '#ebe3d3',
    card: '#faf6ee',
    text: '#34271a',
    accent: '#925327',
    border: '#d4c5ab',
  },
];

function selectTheme(key: string) {
  currentTheme.value = key;
  emit('changeTheme', key);
}
</script>

<style scoped lang="scss">
.cw-settings-theme-pane {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cw-pane-desc {
  font-size: 13px;
  color: var(--cw-text-muted);
  line-height: 1.5;
}

.cw-theme-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
    gap: 10px;
  }
}

.cw-theme-card {
  padding: 14px;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card);
  border: 2px solid var(--cw-border);
  display: flex;
  flex-direction: column;
  gap: 10px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: var(--cw-border-hover);
    transform: translateY(-2px);
    box-shadow: var(--cw-shadow-sm);
  }

  &.active {
    border-color: var(--cw-accent);
    background: var(--cw-accent-bg);
    box-shadow: var(--cw-shadow);
  }

  .cw-theme-preview {
    height: 70px;
    border-radius: var(--cw-radius-sm);
    border: 1px solid transparent;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;

    .cw-preview-bar {
      height: 10px;
      border-radius: 4px;
    }

    .cw-preview-bubble {
      flex: 1;
      border-radius: 6px;
      border: 1px solid transparent;
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 4px;

      .cw-preview-line {
        height: 6px;
        border-radius: 3px;
        width: 85%;
      }
      .cw-line-short {
        width: 45%;
      }
    }
  }

  .cw-theme-info {
    display: flex;
    flex-direction: column;
    gap: 3px;

    .cw-theme-name-row {
      display: flex;
      align-items: center;
      justify-content: space-between;

      .cw-theme-name {
        font-size: 14px;
        font-weight: 600;
        color: var(--cw-text-primary);
      }
    }

    .cw-theme-desc {
      font-size: 12px;
      color: var(--cw-text-secondary);
      line-height: 1.4;
    }
  }
}
</style>
