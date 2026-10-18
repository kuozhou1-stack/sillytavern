<template>
  <div class="cw-step-pane">
    <div class="cw-step-header">
      <h3 class="cw-step-title">第三步：身份背景与生活经历</h3>
      <p class="cw-step-subtitle">设定您的身份、成长背景与重要经历。</p>
    </div>

    <div class="cw-form-grid">
      <div class="cw-form-item">
        <label class="cw-label">成长背景：</label
        ><textarea v-model="draft.成长背景" class="cw-textarea" rows="2" placeholder="未填保持未知" />
      </div>
      <div class="cw-form-item">
        <label class="cw-label">家庭背景：</label
        ><textarea v-model="draft.家庭背景" class="cw-textarea" rows="2" placeholder="未填保持未知" />
      </div>
      <div class="cw-form-item">
        <label class="cw-label">身份：</label>
        <input v-model="draft.身份" placeholder="例如：自由摄影师 / 独立文案策划 / 咖啡师" class="cw-input" />
        <span class="cw-hint">主要工作生活来源与社会分工标签。</span>
      </div>

      <div class="cw-form-item cw-item-full">
        <label class="cw-label">重要过往经历：</label>
        <textarea
          v-model="draft.重要过往"
          rows="3"
          placeholder="例如：毕业后从事了两年广告设计，因喜欢瓦罗兰的音乐与街区生活搬来定居，在艺文居住区租下一间公寓，开始独立拍摄与创作……"
          class="cw-textarea"
        ></textarea>
        <span class="cw-hint">记录影响您当前生活的重要经历。</span>
      </div>

      <div class="cw-form-item cw-item-full">
        <label class="cw-label">当前生活现状描述：</label>
        <textarea
          v-model="draft.当前生活背景"
          rows="2"
          placeholder="例如：日常靠承接独立画册拍摄和商业产品图谋生，生活作息自由但也略显漂泊..."
          class="cw-textarea"
        ></textarea>
        <span class="cw-hint">开局阶段的经济与生活节奏概述。</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: {
    成长背景?: string;
    家庭背景?: string;
    身份: string;
    重要过往: string;
    当前生活背景: string;
  };
}>();
import { useVModel } from '@vueuse/core';
const emit = defineEmits<{ (e: 'update:modelValue', value: typeof props.modelValue): void }>();
const draft = useVModel(props, 'modelValue', emit, { passive: true, deep: true, clone: true });
</script>

<style scoped lang="scss">
.cw-step-pane {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.cw-step-header {
  border-bottom: 1px solid var(--cw-border);
  padding-bottom: 12px;

  .cw-step-title {
    margin: 0 0 6px;
    font-size: 17px;
    font-weight: 700;
    color: var(--cw-text-primary);
  }

  .cw-step-subtitle {
    margin: 0;
    font-size: 13px;
    color: var(--cw-text-secondary);
    line-height: 1.6;
  }
}

.cw-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px 20px;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
    gap: 14px;
  }
}

.cw-form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;

  &.cw-item-full {
    grid-column: 1 / -1;
  }

  .cw-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--cw-text-primary);
  }

  .cw-input,
  .cw-textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 14px;
    border-radius: var(--cw-radius);
    border: 1px solid var(--cw-border);
    background: var(--cw-bg-input);
    color: var(--cw-text-primary);
    font-size: 14px;
    outline: none;
    transition: all 0.2s ease;

    &:focus {
      border-color: var(--cw-accent);
      box-shadow: 0 0 0 2px var(--cw-accent-bg);
    }
  }

  .cw-textarea {
    resize: vertical;
    line-height: 1.6;
  }

  .cw-hint {
    font-size: 12px;
    color: var(--cw-text-muted);
    line-height: 1.4;
  }
}
</style>
