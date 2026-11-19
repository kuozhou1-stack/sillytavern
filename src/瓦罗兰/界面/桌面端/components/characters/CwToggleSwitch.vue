<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :disabled="disabled || loading || status === 'pending' || status === 'disabled'"
    class="cw-toggle-switch"
    :class="[
      `cw-switch-${size}`,
      {
        'is-checked': modelValue,
        'is-loading': !silentPending && (loading || status === 'pending'),
        'is-disabled': disabled || status === 'disabled',
        'is-failed': status === 'failed',
      },
    ]"
    :data-cw-tooltip="computedTitle"
    :aria-label="computedTitle"
    @click.stop="handleClick"
    @keydown.enter.stop
    @keydown.space.stop
  >
    <span class="cw-switch-track">
      <span class="cw-switch-thumb">
        <span v-if="!silentPending && (loading || status === 'pending')" class="cw-switch-spinner"></span>
      </span>
    </span>
    <span v-if="showLabel" class="cw-switch-label">
      {{ modelValue ? activeText || '开启' : inactiveText || '关闭' }}
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    disabled?: boolean;
    loading?: boolean;
    silentPending?: boolean;
    status?: 'idle' | 'pending' | 'success' | 'failed' | 'disabled';
    size?: 'sm' | 'md';
    showLabel?: boolean;
    activeText?: string;
    inactiveText?: string;
    title?: string;
  }>(),
  {
    disabled: false,
    loading: false,
    silentPending: false,
    status: 'idle',
    size: 'sm',
    showLabel: false,
    activeText: '开启',
    inactiveText: '关闭',
    title: '',
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'change', value: boolean): void;
}>();

const computedTitle = computed(() => {
  if (props.title) return props.title;
  if (props.status === 'disabled' || props.disabled) return '当前不可操作（数据层未接入或处于锁定状态）';
  if (!props.silentPending && (props.loading || props.status === 'pending')) return '状态更新中...';
  if (props.status === 'failed') return '操作失败，已还原原有状态';
  return props.modelValue ? '当前已开启，点击关闭（停用该角色）' : '当前已关闭，点击重新开启';
});

function handleClick() {
  if (props.disabled || props.loading || props.status === 'disabled' || props.status === 'pending') return;
  const next = !props.modelValue;
  emit('update:modelValue', next);
  emit('change', next);
}
</script>

<style scoped lang="scss">
.cw-toggle-switch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  outline: none;
  user-select: none;
  transition: opacity 0.2s;
  flex-shrink: 0;

  &:focus-visible .cw-switch-track {
    box-shadow:
      0 0 0 2px var(--cw-bg-surface),
      0 0 0 4px var(--cw-accent);
  }

  &.is-disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  &.is-loading {
    cursor: wait;
  }

  &.is-failed .cw-switch-track {
    border-color: var(--cw-danger);
    animation: cwShake 0.3s ease-in-out;
  }
}

.cw-switch-track {
  position: relative;
  display: inline-block;
  background-color: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius-full);
  transition:
    background-color 0.2s,
    border-color 0.2s;
}

.cw-switch-thumb {
  position: absolute;
  top: 1px;
  left: 1px;
  background-color: var(--cw-text-secondary);
  border-radius: 50%;
  transition:
    transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    background-color 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

/* 尺寸规格 */
.cw-switch-sm .cw-switch-track {
  width: 32px;
  height: 18px;
}
.cw-switch-sm .cw-switch-thumb {
  width: 14px;
  height: 14px;
}
.cw-switch-sm.is-checked .cw-switch-thumb {
  transform: translateX(14px);
}

.cw-switch-md .cw-switch-track {
  width: 40px;
  height: 22px;
}
.cw-switch-md .cw-switch-thumb {
  width: 18px;
  height: 18px;
}
.cw-switch-md.is-checked .cw-switch-thumb {
  transform: translateX(18px);
}

/* 开启状态色彩 */
.is-checked {
  .cw-switch-track {
    background-color: var(--cw-success-bg, rgba(63, 143, 107, 0.15));
    border-color: var(--cw-success, #3f8f6b);
  }
  .cw-switch-thumb {
    background-color: var(--cw-success, #3f8f6b);
  }
}

.cw-switch-spinner {
  width: 8px;
  height: 8px;
  border: 1.5px solid transparent;
  border-top-color: #fff;
  border-radius: 50%;
  animation: cwSpin 0.7s linear infinite;
}

.cw-switch-label {
  font-size: 12px;
  color: var(--cw-text-secondary);
  font-weight: 500;
}

@keyframes cwSpin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes cwShake {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-3px);
  }
  75% {
    transform: translateX(3px);
  }
}
</style>
