<template>
  <div class="cw-step-pane">
    <div class="cw-step-header">
      <h3 class="cw-step-title">第二步：外貌特质与身形</h3>
      <p class="cw-step-subtitle">勾勒角色在现实视线中的形象特征、穿搭风貌与第一印象。数值项留空将保持为【未知】。</p>
    </div>

    <div class="cw-form-grid">
      <div class="cw-form-item">
        <label class="cw-label">身高 (cm)：</label>
        <input v-model.number="draft.身高" type="number" min="50" max="250" placeholder="例如：178" class="cw-input" />
        <span class="cw-hint">净身高厘米数；未填写将保持未知，不填入 0。</span>
      </div>

      <div class="cw-form-item">
        <label class="cw-label">体重 (kg)：</label>
        <input v-model.number="draft.体重" type="number" min="20" max="300" placeholder="例如：68" class="cw-input" />
        <span class="cw-hint">体重公斤数；未填写将保持未知。</span>
      </div>

      <div class="cw-form-item">
        <label class="cw-label">体型概况：</label>
        <input v-model="draft.体型" placeholder="例如：身形匀称偏瘦，步态挺拔" class="cw-input" />
        <span class="cw-hint">整体骨骼骨架与肌肉形态简述。</span>
      </div>

      <div class="cw-form-item">
        <label class="cw-label">发型特征：</label>
        <input v-model="draft.发型" placeholder="例如：短碎发略带微卷，自然黑" class="cw-input" />
        <span class="cw-hint">日常头发长度、发色与打理习惯。</span>
      </div>

      <div class="cw-form-item cw-item-full">
        <label class="cw-label">面容与显著面部特征：</label>
        <input v-model="draft.显著特征" placeholder="例如：常戴一副细黑框眼镜，眼角有一颗浅褐泪痣" class="cw-input" />
        <span class="cw-hint">易于被初识者注意到的显著个人特征。</span>
      </div>

      <div class="cw-form-item cw-item-full">
        <label class="cw-label">整体穿搭风格与外貌印象：</label>
        <textarea
          v-model="draft.整体外貌描述"
          rows="3"
          placeholder="例如：习惯穿着洗旧质感的纯棉或亚麻衬衫，背着帆布相机包，给人沉稳温和且略带距离感的初次印象..."
          class="cw-textarea"
        ></textarea>
        <span class="cw-hint">供 AI 在面对面对话与视线交互中自然调用的肖像侧写。</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: {
    身高: number | null;
    体重: number | null;
    体型: string;
    发型: string;
    显著特征: string;
    整体外貌描述: string;
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
  grid-template-columns: repeat(2, 1fr);
  gap: 18px 20px;
}

.cw-form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;

  &.cw-item-full {
    grid-column: span 2;
  }

  .cw-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--cw-text-primary);
  }

  .cw-input,
  .cw-textarea {
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

@media (max-width: 640px) {
  .cw-form-grid {
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .cw-form-item.cw-item-full {
    grid-column: span 1;
  }
}
</style>
