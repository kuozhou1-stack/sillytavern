<template>
  <div class="cw-input-area">
    <!-- 主输入框与发送/停止状态按钮并排 (无第二行操作栏) -->
    <div
      class="cw-input-row"
      :class="{
        'is-focused': isFocused,
        'is-blocked': blocked,
        'has-error': updateFailed,
      }"
    >
      <textarea
        ref="textareaRef"
        v-model="inputContent"
        class="cw-input-textarea"
        :placeholder="placeholderText"
        rows="1"
        :disabled="blocked"
        @focus="isFocused = true"
        @blur="isFocused = false"
        @input="adjustHeight"
        @keydown="handleKeydown"
      ></textarea>

      <!-- 并排状态按钮：生成/更新中展示“停止”，闲置时展示“发送” -->
      <button
        v-if="isGenerating || isUpdatingVariables || canStop"
        type="button"
        class="cw-btn cw-btn-danger cw-status-btn"
        :disabled="!canStop && !isGenerating && !isUpdatingVariables"
        :title="isUpdatingVariables ? '停止当前变量更新' : '停止当前生成'"
        @click="(canStop || isGenerating || isUpdatingVariables) && emit('stopGeneration')"
      >
        <SvgIcon name="stop" :size="14" />
        <span>{{ isUpdatingVariables ? '停止更新' : '停止' }}</span>
      </button>

      <button
        v-else
        type="button"
        class="cw-btn cw-btn-primary cw-status-btn"
        :disabled="
          blocked ||
          isSubmitting ||
          updateFailed ||
          inputContent.trim().length === 0
        "
        :title="
          updateFailed
            ? '请先处理未完成请求'
            : inputContent.trim().length === 0
              ? '请输入行动或对话内容'
              : '发送行动 (Enter)'
        "
        @click="handleSend"
      >
        <SvgIcon
          :name="isSubmitting ? 'refresh' : 'send'"
          :size="14"
          :class="{ 'cw-spin': isSubmitting }"
        />
        <span>{{ isSubmitting ? '发送中…' : '发送' }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick, computed } from 'vue';
import { useResizeObserver } from '@vueuse/core';
import SvgIcon from '../icons/SvgIcon.vue';

const props = defineProps<{
  isGenerating?: boolean;
  isUpdatingVariables?: boolean;
  canStop?: boolean;
  updateFailed?: boolean;
  errorText?: string;
  blocked?: boolean;
  busyHint?: string;
  isActing?: boolean;
}>();

const emit = defineEmits<{
  (e: 'send', content: string, done: (saved: boolean) => void): void;
  (e: 'stopGeneration'): void;
  (e: 'manualRetryUpdate'): void;
  (e: 'discardPending'): void;
}>();

const inputContent = ref('');
const isSubmitting = ref(false);
const isFocused = ref(false);
const textareaRef = ref<HTMLTextAreaElement | null>(null);

const placeholderText = computed(() => {
  if (props.isGenerating) return '正在生成回复…可点击右侧停止按钮';
  if (props.isUpdatingVariables) return '正在更新变量…';
  if (props.updateFailed) return '请求未完成，请在上方的通知中重试或取消…';
  return '输入行动或对话...（Enter 发送，Shift+Enter 换行）';
});

function adjustHeight() {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = 'auto';
  const scrollHeight = el.scrollHeight;
  // 文本从一行（约 36px）增长至约三行（约 78px）后内部滚动
  const maxHeight = 78;
  const minHeight = 36;
  const clampedHeight = Math.min(maxHeight, Math.max(minHeight, scrollHeight));
  el.style.height = `${clampedHeight}px`;
  el.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
}

watch(inputContent, () => {
  nextTick(adjustHeight);
});

onMounted(() => {
  nextTick(adjustHeight);
});

let textareaWidth = 0;
useResizeObserver(textareaRef, ([entry]) => {
  if (!entry || entry.contentRect.width === textareaWidth) return;
  textareaWidth = entry.contentRect.width;
  nextTick(adjustHeight);
});

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  if (!event.repeat) handleSend();
}

function handleSend() {
  if (
    props.blocked ||
    isSubmitting.value ||
    props.isGenerating ||
    props.isUpdatingVariables ||
    props.updateFailed
  )
    return;
  const text = inputContent.value;
  if (!text.trim()) return;
  const original = inputContent.value;
  isSubmitting.value = true;
  emit('send', text, saved => {
    isSubmitting.value = false;
    if (saved && inputContent.value === original) {
      inputContent.value = '';
      nextTick(adjustHeight);
    }
  });
}
</script>

<style scoped lang="scss">
.cw-input-area {
  width: 100%;
  box-sizing: border-box;
}

.cw-input-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  width: 100%;
  padding: 4px 6px;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-input);
  border: 1px solid var(--cw-border);
  box-sizing: border-box;
  transition: all 0.2s ease;

  &.is-focused {
    border-color: var(--cw-accent);
    box-shadow: 0 0 0 2px var(--cw-accent-bg);
  }

  &.has-error {
    border-color: var(--cw-danger);
  }

  &.is-blocked {
    opacity: 0.7;
  }
}

.cw-input-textarea {
  flex: 1;
  min-width: 0;
  min-height: 36px;
  max-height: 78px;
  border: none;
  background: transparent;
  padding: 7px 8px;
  color: var(--cw-text-primary);
  font-family: inherit;
  font-size: 13.5px;
  line-height: 1.5;
  resize: none;
  outline: none;
  box-sizing: border-box;
  overflow-y: hidden;

  &::placeholder {
    color: var(--cw-text-muted);
    font-size: 12.5px;
  }
}

.cw-status-btn {
  height: 36px;
  min-width: 66px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border-radius: var(--cw-radius-sm);
  font-size: 13px;
  font-weight: 600;
  padding: 0 12px;
  box-sizing: border-box;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.cw-spin {
  animation: cwSpin 1.4s linear infinite;
}

@keyframes cwSpin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>

