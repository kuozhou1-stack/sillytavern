<template>
  <div class="cw-step-pane">
    <div class="cw-step-header">
      <h3 class="cw-step-title">第一步：基本信息</h3>
      <p class="cw-step-subtitle">
        请设定您在瓦罗兰的姓名、日常称呼、种族、性别与年龄。
      </p>
    </div>

    <div class="cw-form-grid">
      <div class="cw-form-item">
        <label class="cw-label"><span class="cw-required">*</span> 姓名：</label>
        <input v-model="draft.姓名" placeholder="例如：江予安" class="cw-input" />
        <span class="cw-hint">您在瓦罗兰生活时使用的正式姓名。</span>
      </div>

      <div class="cw-form-item">
        <label class="cw-label">日常称呼 / 自称：</label>
        <input v-model="draft.称呼" placeholder="例如：予安 / 小江" class="cw-input" />
        <span class="cw-hint">熟人或亲友日常可能对您的称呼。</span>
      </div>

      <div class="cw-form-item">
        <label class="cw-label"><span class="cw-required">*</span> 性别：</label>
        <select v-model="selectedGenderType" class="cw-select" aria-label="选择性别">
          <option value="" disabled>请选择性别</option>
          <option value="男">男</option>
          <option value="女">女</option>
          <option value="其他">其他</option>
        </select>
        <input
          v-if="selectedGenderType === '其他'"
          v-model="customGender"
          placeholder="填写具体性别设定 (如：跨性别/无性别/自定义)"
          class="cw-input cw-custom-gender-input"
          aria-label="自定义性别设定"
        />
        <span class="cw-hint">用于人际称谓与社交档案。</span>
      </div>

      <div class="cw-form-item">
        <label class="cw-label">年龄 (岁)：</label>
        <input
          v-model.number="draft.年龄"
          type="number"
          min="1"
          max="120"
          placeholder="留空表示开局未知，例如：26"
          class="cw-input"
        />
        <span class="cw-hint">自主填写；留空将保持为【未知】，不会被误处理为 0 岁。</span>
      </div>

      <div class="cw-form-item cw-item-full">
        <label class="cw-label">种族：</label>
        <input v-model="draft.种族" placeholder="例如：人类、瓦斯塔亚、约德尔人，或自定义种族" class="cw-input" />
        <span class="cw-hint">按您的设定填写，不限制种族类型。</span>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useVModel } from '@vueuse/core';

const props = defineProps<{
  modelValue: {
    姓名: string;
    称呼: string;
    性别: string;
    种族: string;
    年龄: number | null;
  };
}>();
const emit = defineEmits<{ (e: 'update:modelValue', value: typeof props.modelValue): void }>();
const draft = useVModel(props, 'modelValue', emit, { passive: true, deep: true, clone: true });

const selectedGenderType = ref<'男' | '女' | '其他' | ''>(
  draft.value.性别 === '男' ? '男' : draft.value.性别 === '女' ? '女' : draft.value.性别 ? '其他' : '',
);
const customGender = ref(
  draft.value.性别 && draft.value.性别 !== '男' && draft.value.性别 !== '女' ? draft.value.性别 : '',
);

watch(
  () => draft.value.性别,
  newVal => {
    // 自定义输入的回写不能被当成外部选项切换（例如输入“男性机器人”的首字）。
    if (selectedGenderType.value === '其他' && newVal === (customGender.value.trim() || '其他')) return;
    if (newVal === '男' || newVal === '女') {
      selectedGenderType.value = newVal;
      customGender.value = '';
    } else if (newVal) {
      selectedGenderType.value = '其他';
      customGender.value = newVal;
    } else {
      selectedGenderType.value = '';
      customGender.value = '';
    }
  },
);

watch(selectedGenderType, type => {
  if (type === '男' || type === '女') {
    draft.value.性别 = type;
  } else if (type === '其他') {
    draft.value.性别 = customGender.value.trim() || '其他';
  } else {
    draft.value.性别 = '';
  }
});

watch(customGender, val => {
  if (selectedGenderType.value === '其他') {
    draft.value.性别 = val.trim() || '其他';
  }
});
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

    .cw-required {
      color: var(--cw-danger);
      margin-right: 2px;
    }
  }

  .cw-input,
  .cw-select {
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
