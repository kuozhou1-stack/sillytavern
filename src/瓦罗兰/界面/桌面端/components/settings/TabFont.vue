<template>
  <div class="cw-tab-pane cw-settings-font-pane">
    <div class="cw-callout cw-callout-info cw-font-notice">
      <SvgIcon name="info" :size="15" class="cw-callout-icon" />
      <div class="cw-callout-body">
        <p>定制阅读正文字体、字号与全局界面缩放比例。正文字号仅调整楼层正文阅读大小；整体缩放按百分比调整整个前端视口。</p>
      </div>
    </div>

    <!-- 字体选择卡片 -->
    <div class="cw-set-card">
      <h4 class="cw-set-title">
        <SvgIcon name="edit" :size="15" />
        <span>界面与阅读字体</span>
      </h4>

      <div class="cw-font-options-grid">
        <div
          v-for="f in fontOptions"
          :key="f.key"
          class="cw-font-opt-item"
          :class="{ active: currentFont === f.key }"
          @click="selectFont(f.key)"
        >
          <span class="cw-font-sample" :style="{ fontFamily: f.sampleFont }">瓦洛兰</span>
          <div class="cw-font-meta">
            <span class="cw-font-name">{{ f.name }}</span>
            <span v-if="currentFont === f.key" class="cw-badge">使用中</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 正文字号控制 (px) -->
    <div class="cw-set-card">
      <div class="cw-slider-header">
        <div class="cw-slider-label">
          <span class="cw-set-title">正文阅读字号</span>
          <span class="cw-sub-note">以 px 为基准，仅调整楼层对话正文大小</span>
        </div>
        <span class="cw-slider-val-badge">{{ fontSize }} px</span>
      </div>

      <div class="cw-slider-row">
        <span class="cw-scale-min">13px</span>
        <input
          v-model.number="fontSize"
          type="range"
          min="13"
          max="24"
          step="1"
          class="cw-range-slider"
          @input="emit('changeFontSize', fontSize)"
        />
        <span class="cw-scale-max">24px</span>
      </div>

    </div>

    <div class="cw-set-card">
      <h4 class="cw-set-title">正文排版调节</h4>
      <label class="cw-slider-header">行高 <span>{{ lineHeight.toFixed(2) }} 倍</span></label>
      <input v-model.number="lineHeight" class="cw-range-slider" type="range" min="1.2" max="2.6" step="0.05" aria-label="正文行高" @input="emit('changeLineHeight', lineHeight)" />
      <label class="cw-slider-header">字间距 <span>{{ letterSpacing.toFixed(2) }} em</span></label>
      <input v-model.number="letterSpacing" class="cw-range-slider" type="range" min="-0.05" max="0.2" step="0.01" aria-label="正文字间距" @input="emit('changeLetterSpacing', letterSpacing)" />
      <label class="cw-slider-header">段落间距 <span>{{ paragraphSpacing.toFixed(1) }} em</span></label>
      <input v-model.number="paragraphSpacing" class="cw-range-slider" type="range" min="0" max="2" step="0.1" aria-label="正文段落间距" @input="emit('changeParagraphSpacing', paragraphSpacing)" />
      <button class="cw-btn cw-btn-ghost cw-btn-xs" @click="resetTypography">恢复默认排版</button>
    </div>

    <!-- 动态排版实时预览卡片 (解决问题 19) -->
    <div class="cw-set-card cw-preview-set-card">
      <div class="cw-preview-card-header">
        <h4 class="cw-set-title">
          <SvgIcon name="eye" :size="15" />
          <span>正文排版实时动态预览</span>
        </h4>
        <span class="cw-preview-badge">实时效果</span>
      </div>
      <div
        class="cw-typography-preview-box"
        :style="{
          fontFamily: currentFontFamily,
          fontSize: `${fontSize}px`,
          lineHeight: lineHeight,
          letterSpacing: `${letterSpacing}em`,
        }"
      >
        <h5 class="cw-preview-scene-title" :style="{ marginBottom: `${paragraphSpacing * 0.6}em` }">
          上海中央广场 · 午后微风
        </h5>
        <p class="cw-preview-narrative" :style="{ marginBottom: `${paragraphSpacing}em` }">
          阳光穿过梧桐叶，街角咖啡店打开了白色遮阳棚。地铁到站的提示声从路口传来，骑车的人沿着街道经过，空气中弥漫着烘焙糕点的甜香。
        </p>
        <div class="cw-preview-dialogue" :style="{ marginBottom: `${paragraphSpacing}em` }">
          <span class="cw-preview-speaker">朋友：</span>
          <span class="cw-preview-speech">“今天的天气真舒坦，要不要去虹泉路韩国街看看新到的手作饰品？”</span>
        </div>
        <p class="cw-preview-aside" :style="{ marginBottom: `${paragraphSpacing * 0.5}em` }">
          （她微微转过头，金色的眼眸中闪烁着狡黠与好奇的光芒，等待着您的回应。）
        </p>
      </div>
    </div>

    <!-- 全局整体缩放控制 (%) -->
    <div class="cw-set-card">
      <div class="cw-slider-header">
        <div class="cw-slider-label">
          <span class="cw-set-title">整体界面缩放</span>
          <span class="cw-sub-note">等比缩放整个桌面端（含弹窗、手机与控件）</span>
        </div>
        <span class="cw-slider-val-badge">{{ uiScale }} %</span>
      </div>

      <div class="cw-slider-row">
        <span class="cw-scale-min">80%</span>
        <input
          v-model.number="uiScale"
          type="range"
          min="80"
          max="125"
          step="5"
          class="cw-range-slider"
          @input="emit('changeUiScale', uiScale)"
        />
        <span class="cw-scale-max">125%</span>
      </div>

      <div class="cw-quick-scale-btns">
        <button class="cw-btn cw-btn-xs" @click="setQuickScale(90)">90% (紧凑)</button>
        <button class="cw-btn cw-btn-xs" @click="setQuickScale(100)">100% (标准)</button>
        <button class="cw-btn cw-btn-xs" @click="setQuickScale(110)">110% (大屏)</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import SvgIcon from '../icons/SvgIcon.vue';

const props = withDefaults(
  defineProps<{
    initialFont?: string;
    initialFontSize?: number;
    initialUiScale?: number;
    initialLineHeight?: number;
    initialLetterSpacing?: number;
    initialParagraphSpacing?: number;
  }>(),
  {
    initialFont: 'sans',
    initialFontSize: 16,
    initialUiScale: 100,
    initialLineHeight: 1.8,
    initialLetterSpacing: 0.02,
    initialParagraphSpacing: 0.8,
  },
);

const emit = defineEmits<{
  (e: 'changeFont', font: string): void;
  (e: 'changeFontSize', size: number): void;
  (e: 'changeUiScale', scale: number): void;
  (e: 'changeLineHeight', value: number): void;
  (e: 'changeLetterSpacing', value: number): void;
  (e: 'changeParagraphSpacing', value: number): void;
}>();

const currentFont = ref(props.initialFont);
const fontSize = ref(props.initialFontSize);
const uiScale = ref(props.initialUiScale);
const lineHeight = ref(props.initialLineHeight);
const letterSpacing = ref(props.initialLetterSpacing);
const paragraphSpacing = ref(props.initialParagraphSpacing);
function resetTypography() {
  lineHeight.value = 1.8; letterSpacing.value = 0.02; paragraphSpacing.value = 0.8;
  emit('changeLineHeight', lineHeight.value);
  emit('changeLetterSpacing', letterSpacing.value);
  emit('changeParagraphSpacing', paragraphSpacing.value);
}

const fontOptions = [
  { key: 'system', name: '系统默认', sampleFont: 'system-ui, sans-serif' },
  { key: 'sans', name: '思源黑体', sampleFont: '"Source Han Sans SC", sans-serif' },
  { key: 'serif', name: '思源宋体', sampleFont: '"Source Han Serif SC", serif' },
  { key: 'kaiti', name: '霞鹜文楷', sampleFont: '"LXGW WenKai", cursive, serif' },
];

const currentFontFamily = computed(() => {
  const opt = fontOptions.find(f => f.key === currentFont.value);
  return opt ? opt.sampleFont : 'system-ui, sans-serif';
});

function selectFont(fontKey: string) {
  currentFont.value = fontKey;
  emit('changeFont', fontKey);
}

function setQuickScale(val: number) {
  uiScale.value = val;
  emit('changeUiScale', val);
}
</script>

<style scoped lang="scss">
.cw-settings-font-pane {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cw-pane-desc {
  font-size: 13px;
  color: var(--cw-text-muted);
  line-height: 1.5;
}

/* 排版实时预览卡片 (解决问题 19) */
.cw-preview-set-card {
  border-color: var(--cw-accent-border, var(--cw-accent));
  background: var(--cw-bg-card);

  .cw-preview-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;

    .cw-preview-badge {
      font-size: 11px;
      padding: 1px 8px;
      border-radius: var(--cw-radius-full);
      background: var(--cw-accent-bg);
      border: 1px solid var(--cw-accent-border);
      color: var(--cw-accent);
      font-weight: 500;
    }
  }

  .cw-typography-preview-box {
    padding: 14px 16px;
    background: var(--cw-bg-card-subtle);
    border: 1px solid var(--cw-border);
    border-radius: var(--cw-radius);
    color: var(--cw-text-primary);
    transition: all 0.15s ease;

    .cw-preview-scene-title {
      margin: 0;
      font-size: 1.08em;
      font-weight: 700;
      color: var(--cw-accent);
    }

    .cw-preview-narrative {
      margin: 0;
      color: var(--cw-text-primary);
    }

    .cw-preview-dialogue {
      margin: 0;
      padding: 6px 10px;
      border-radius: var(--cw-radius-sm);
      background: var(--cw-bg-card);
      border-left: 3px solid var(--cw-accent);

      .cw-preview-speaker {
        font-weight: 700;
        color: var(--cw-accent);
      }
      .cw-preview-speech {
        color: var(--cw-text-primary);
      }
    }

    .cw-preview-aside {
      margin: 0;
      color: var(--cw-text-muted);
      font-size: 0.95em;
      font-style: italic;
    }
  }
}

.cw-set-card {
  padding: 16px 18px;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card);
  border: 1px solid var(--cw-border);
  display: flex;
  flex-direction: column;
  gap: 12px;

  .cw-set-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--cw-text-primary);
  }
}

.cw-font-options-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }

  .cw-font-opt-item {
    padding: 12px 14px;
    border-radius: var(--cw-radius);
    background: var(--cw-bg-card-subtle);
    border: 1px solid var(--cw-border);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 6px;
    transition: all 0.15s;

    &:hover {
      border-color: var(--cw-border-hover);
    }

    &.active {
      border-color: var(--cw-accent);
      background: var(--cw-accent-bg);

      .cw-font-name {
        color: var(--cw-accent);
        font-weight: 700;
      }
    }

    .cw-font-sample {
      font-size: 18px;
      color: var(--cw-text-primary);
    }

    .cw-font-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;

      .cw-font-name {
        font-size: 12px;
        color: var(--cw-text-secondary);
      }
    }
  }
}

.cw-slider-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px 10px;

  .cw-slider-label {
    display: flex;
    flex-direction: column;
    gap: 2px;

    .cw-sub-note {
      font-size: 11px;
      color: var(--cw-text-muted);
    }
  }

  .cw-slider-val-badge {
    font-family: monospace, sans-serif;
    font-size: 14px;
    font-weight: 700;
    color: var(--cw-accent);
    padding: 3px 8px;
    background: var(--cw-accent-bg);
    border-radius: var(--cw-radius-sm);
    flex-shrink: 0;
  }
}

.cw-slider-row {
  display: flex;
  align-items: center;
  gap: 12px;

  .cw-scale-min,
  .cw-scale-max {
    font-size: 11px;
    color: var(--cw-text-muted);
    width: 36px;
  }

  .cw-range-slider {
    flex: 1;
    accent-color: var(--cw-accent);
    cursor: pointer;
  }
}

.cw-typo-preset-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 2px;
}

.cw-quick-scale-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}
</style>
