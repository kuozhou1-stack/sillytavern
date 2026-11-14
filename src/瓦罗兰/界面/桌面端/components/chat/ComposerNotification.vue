<template>
  <div v-if="hasNotification" class="cw-composer-notification-wrap">
    <!-- 单行折叠状态条 -->
    <div
      class="cw-notif-bar"
      :class="{
        'is-error': isError,
        'is-busy': isBusy,
        'is-info': !isError && !isBusy,
      }"
      role="status"
    >
      <button
        type="button"
        class="cw-notif-content"
        :aria-expanded="isExpanded"
        :aria-label="isError && !canResend ? '查看未完成操作的原因与恢复选项' : '展开通知全文'"
        @click="toggleExpand"
      >
        <SvgIcon
          :name="isError ? 'alertCircle' : isBusy ? 'refresh' : 'info'"
          :size="14"
          :class="{ 'cw-spin': isBusy }"
          class="cw-notif-icon"
        />

        <span
          ref="marqueeContainerRef"
          class="cw-notif-marquee-container"
          :class="{ 'is-paused': isPaused || isExpanded }"
          :title="isError && !canResend ? '点击展开错误原因并处理' : displayText + (isOverflowing ? ' (触碰或悬停暂停滚动，点击展开详情)' : ' (点击展开详情)')"
          @mouseenter="isPaused = true"
          @mouseleave="isPaused = false"
          @touchstart.passive="isPaused = true"
          @touchend.passive="isPaused = false"
          @touchcancel.passive="isPaused = false"
        >
          <span
            ref="marqueeTextRef"
            class="cw-notif-text"
            :class="{ 'is-scrolling': isOverflowing }"
            :style="isOverflowing ? { '--cw-marquee-distance': `-${overflowDistance}px` } : undefined"
          >
            {{ displayText }}
          </span>
        </span>
      </button>

      <!-- 右侧快捷操作与展开按钮 -->
      <div class="cw-notif-actions">
        <button
          type="button"
          class="cw-notif-toggle-btn"
          :title="isExpanded ? '收起详情' : '展开查看详情'"
          :aria-label="isExpanded ? '收起详情' : isError && !canResend ? '查看错误原因与恢复操作' : '展开通知详情'"
          :aria-expanded="isExpanded"
          @click.stop="toggleExpand"
        >
          <span v-if="isError">{{ isExpanded ? '收起' : canResend ? '详情' : '处理' }}</span>
          <SvgIcon :name="isExpanded ? 'chevronDown' : 'chevronRight'" :size="13" />
        </button>

        <button
          v-if="toastMessage && !isError && !isBusy"
          type="button"
          class="cw-notif-close-btn"
          title="关闭提示"
          aria-label="关闭提示"
          @click.stop="emit('closeToast')"
        >
          <SvgIcon name="close" :size="12" />
        </button>
      </div>
    </div>

    <!-- 展开后的静止详情面板 (保留可发现的恢复入口与失败原因) -->
    <transition name="cw-fade">
      <div v-if="isExpanded" class="cw-notif-detail-panel">
        <div class="cw-detail-header">
          <span class="cw-detail-title">{{ canResend ? '请求详情' : isError ? '异常详情与恢复' : '任务进度详情' }}</span>
          <button class="cw-btn-text-xs" @click="isExpanded = false">收起详情</button>
        </div>
        <p class="cw-detail-body" :role="isError ? 'alert' : undefined">
          {{ fullDetailText }}
        </p>
        <div v-if="isError && !canResend" class="cw-detail-footer">
          <button
            class="cw-btn cw-btn-xs cw-btn-primary"
            :disabled="isActing"
            @click="emit('retryUpdate')"
          >
            <SvgIcon name="refresh" :size="12" />
            <span>立即重试</span>
          </button>
          <button
            class="cw-btn cw-btn-xs"
            :disabled="isActing"
            @click="emit('discardPending')"
          >
            取消待处理请求
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import SvgIcon from '../icons/SvgIcon.vue';

const props = defineProps<{
  toastMessage?: string | null;
  errorText?: string | null;
  updateFailed?: boolean;
  canResend?: boolean;
  isGenerating?: boolean;
  isUpdatingVariables?: boolean;
  busyHint?: string;
  isActing?: boolean;
}>();

const emit = defineEmits<{
  (e: 'closeToast'): void;
  (e: 'retryUpdate'): void;
  (e: 'discardPending'): void;
}>();

const isExpanded = ref(false);
const marqueeContainerRef = ref<HTMLElement | null>(null);
const marqueeTextRef = ref<HTMLElement | null>(null);
const overflowDistance = ref(0);
const isPaused = ref(false);

const isError = computed(() => !!props.updateFailed || !!props.errorText);
const isBusy = computed(
  () => (!!props.isGenerating || !!props.isUpdatingVariables || !!props.busyHint) && !isError.value,
);

const hasNotification = computed(() => isError.value || isBusy.value || !!props.toastMessage);

// F02：失败时保留固定简明摘要，不要将长错误放进跑马灯
const displayText = computed(() => {
  if (isError.value) {
    if (props.canResend) return '原请求已失效，可重新发送';
    return props.busyHint ? `${props.busyHint} · 点击处理` : '操作未完成 · 点击处理';
  }
  if (props.busyHint) return props.busyHint;
  if (props.isUpdatingVariables) {
    return '正在更新剧情变量与世界状态…';
  }
  if (props.isGenerating) {
    return '正在生成剧情回复…';
  }
  return props.toastMessage || '';
});

// 完整详细信息在展开面板中静止呈现
const fullDetailText = computed(() => {
  if (isError.value) {
    const reason = (
      props.errorText ||
      '操作未完成，可能是由于模型响应格式异常或网络超时。您可以重试本次操作，或取消待处理请求恢复到上一稳定状态。'
    );
    return props.busyHint ? `${props.busyHint}。\n${reason}` : reason;
  }
  return displayText.value;
});

// F01：根据实际 scrollWidth 与 clientWidth 测量溢出量
const isOverflowing = computed(() => !isError.value && overflowDistance.value > 0);

function measureOverflow() {
  if (!marqueeContainerRef.value || !marqueeTextRef.value) {
    overflowDistance.value = 0;
    return;
  }
  const containerW = marqueeContainerRef.value.clientWidth;
  const textW = marqueeTextRef.value.scrollWidth;
  const diff = textW - containerW;
  overflowDistance.value = Math.max(0, Math.ceil(diff));
}

// 根节点按通知有无重建，因此跟随实际模板 ref 绑定，不能只在首次挂载时观察。
watch(
  [marqueeContainerRef, marqueeTextRef],
  ([container, text], _, onCleanup) => {
    isPaused.value = false;
    measureOverflow();
    if (!container || !text || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measureOverflow);
    observer.observe(container);
    observer.observe(text);
    onCleanup(() => observer.disconnect());
  },
  { flush: 'post' },
);
watch(displayText, measureOverflow, { flush: 'post' });
watch(hasNotification, visible => {
  if (!visible) isExpanded.value = false;
});

function toggleExpand() {
  isExpanded.value = !isExpanded.value;
}

// 错误出现时若用户未展开，仍保持单行紧凑；如果发生新错误，更新文本
watch(
  () => props.errorText,
  err => {
    if (err) isExpanded.value = false;
  },
);
</script>

<style scoped lang="scss">
.cw-composer-notification-wrap {
  width: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.cw-notif-bar {
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 0 10px;
  border-radius: var(--cw-radius);
  font-size: 12px;
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);
  box-sizing: border-box;
  user-select: none;
  overflow: hidden;
  transition: all 0.2s ease;

  &.is-error {
    background: var(--cw-danger-bg);
    border-color: rgba(239, 68, 68, 0.35);
    color: var(--cw-danger);
  }

  &.is-busy {
    background: var(--cw-accent-bg);
    border-color: rgba(14, 165, 233, 0.3);
    color: var(--cw-accent);
  }

  &.is-info {
    background: var(--cw-bg-card-subtle);
    border-color: var(--cw-border);
    color: var(--cw-text-secondary);
  }
}

.cw-notif-content {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  overflow: hidden;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
}

.cw-notif-icon {
  flex-shrink: 0;
}

.cw-notif-marquee-container {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  position: relative;

  &:hover .cw-notif-text,
  &.is-paused .cw-notif-text {
    animation-play-state: paused;
  }
}

.cw-notif-text {
  display: inline-block;
  white-space: nowrap;
  font-weight: 500;
  will-change: transform;

  &.is-scrolling {
    animation: cwMarquee 12s cubic-bezier(0.25, 1, 0.5, 1) infinite;
  }
}

@keyframes cwMarquee {
  0%,
  20% {
    transform: translateX(0);
  }
  65%,
  80% {
    transform: translateX(var(--cw-marquee-distance, 0px));
  }
  100% {
    transform: translateX(0);
  }
}

.cw-notif-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin-left: 8px;
}

.cw-notif-toggle-btn,
.cw-notif-close-btn {
  background: none;
  border: none;
  color: inherit;
  opacity: 0.7;
  cursor: pointer;
  font: inherit;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--cw-radius-sm);
  transition: opacity 0.15s;

  &:hover {
    opacity: 1;
    background: rgba(0, 0, 0, 0.05);
  }
}

.cw-notif-detail-panel {
  padding: 8px 10px;
  margin-top: 4px;
  background: var(--cw-bg-surface);
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius);
  font-size: 12px;
  box-shadow: var(--cw-shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cw-detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  font-weight: 600;
  color: var(--cw-text-muted);
}

.cw-btn-text-xs {
  background: none;
  border: none;
  color: var(--cw-accent);
  cursor: pointer;
  padding: 0;
  font-size: 11px;

  &:hover {
    text-decoration: underline;
  }
}

.cw-detail-body {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cw-text-primary);
  max-height: 80px;
  overflow-y: auto;
  word-break: break-all;
}

.cw-detail-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 4px;
  border-top: 1px solid var(--cw-border-subtle, rgba(0, 0, 0, 0.04));
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
