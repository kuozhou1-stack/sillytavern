<template>
  <button
    type="button"
    ref="triggerRef"
    class="cw-phone-trigger"
    :style="{ top: `${position.y}px`, right: `${position.x}px` }"
    title="点击打开智能手机（拖动可调整位置，双击或右键可重置位置）"
    aria-label="智能手机入口"
    @mousedown="handleMouseDown"
    @click="handleClick"
    @dblclick="resetPosition"
    @contextmenu.prevent="resetPosition"
  >
    <div class="cw-trigger-inner">
      <SvgIcon name="phone" :size="22" />
      <span v-if="unreadCount > 0" class="cw-unread-badge">{{ unreadCount }}</span>
    </div>
    <span class="cw-trigger-label">智能手机</span>
  </button>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import SvgIcon from '../icons/SvgIcon.vue';

const props = withDefaults(
  defineProps<{
    unreadCount?: number;
  }>(),
  {
    unreadCount: 3,
  },
);

const emit = defineEmits<{
  (e: 'openPhone'): void;
}>();

const triggerRef = ref<HTMLElement>();
const position = ref({ x: 28, y: 120 });
let isDragging = false;
let startX = 0;
let startY = 0;
let initialX = 0;
let initialY = 0;
let stopDrag = () => {};

function getScale(el?: HTMLElement | null): number {
  if (!el) return 1;
  const root = el.closest('.cw-scale-root') as HTMLElement | null;
  if (!root) return 1;
  const zoom = getComputedStyle(root).zoom;
  const parsed = parseFloat(zoom);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function clampPosition() {
  const el = triggerRef.value;
  if (!el) return;
  const win = el.ownerDocument.defaultView ?? window;
  const scale = getScale(el);
  const availW = win.innerWidth / scale;
  const availH = win.innerHeight / scale;
  position.value.x = Math.max(10, Math.min(Math.max(10, availW - 70), position.value.x));
  position.value.y = Math.max(60, Math.min(Math.max(60, availH - 90), position.value.y));
}

function resetPosition() {
  position.value = { x: 28, y: 120 };
  clampPosition();
}

function handleMouseDown(e: MouseEvent) {
  // 忽略右键拖拽
  if (e.button !== 0) return;
  stopDrag();
  const el = triggerRef.value;
  const win = (e.currentTarget as HTMLElement).ownerDocument.defaultView ?? window;
  const scale = getScale(el);
  isDragging = false;
  startX = e.clientX;
  startY = e.clientY;
  initialX = position.value.x;
  initialY = position.value.y;

  const onMouseMove = (moveEvent: MouseEvent) => {
    const rawDx = moveEvent.clientX - startX;
    const rawDy = moveEvent.clientY - startY;
    if (Math.abs(rawDx) > 3 || Math.abs(rawDy) > 3) {
      isDragging = true;
    }
    const dx = rawDx / scale;
    const dy = rawDy / scale;
    const availW = win.innerWidth / scale;
    const availH = win.innerHeight / scale;
    // right 偏移是相反的
    position.value.x = Math.max(10, Math.min(Math.max(10, availW - 70), initialX - dx));
    position.value.y = Math.max(60, Math.min(Math.max(60, availH - 90), initialY + dy));
  };

  const onMouseUp = () => {
    win.removeEventListener('mousemove', onMouseMove);
    win.removeEventListener('mouseup', onMouseUp);
    setTimeout(() => {
      isDragging = false;
    }, 50);
  };
  stopDrag = onMouseUp;

  win.addEventListener('mousemove', onMouseMove);
  win.addEventListener('mouseup', onMouseUp);
}

function handleClick() {
  if (!isDragging) {
    emit('openPhone');
  }
}

onMounted(() => {
  window.addEventListener('resize', clampPosition);
  clampPosition();
});

onBeforeUnmount(() => {
  stopDrag();
  window.removeEventListener('resize', clampPosition);
});
</script>

<style scoped lang="scss">
.cw-phone-trigger {
  appearance: none;
  border: 0;
  padding: 0;
  background: none;
  color: inherit;
  font: inherit;
  position: fixed;
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: grab;
  user-select: none;
  transition: transform 0.15s;

  &:active {
    cursor: grabbing;
    transform: scale(0.96);
  }

  .cw-trigger-inner {
    width: 52px;
    height: 52px;
    border-radius: var(--cw-radius-full);
    background: var(--cw-bg-panel);
    backdrop-filter: var(--cw-glass-blur);
    border: 2px solid var(--cw-accent);
    color: var(--cw-accent);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: var(--cw-shadow-lg);
    position: relative;
    transition: all 0.2s;

    &:hover {
      background: var(--cw-accent);
      color: var(--cw-text-inverse);
      box-shadow: 0 8px 24px var(--cw-accent-border);
    }
  }

  .cw-unread-badge {
    position: absolute;
    top: -2px;
    right: -2px;
    background: var(--cw-danger);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: var(--cw-radius-full);
    box-shadow: var(--cw-shadow-sm);
  }

  .cw-trigger-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--cw-text-secondary);
    background: var(--cw-bg-panel);
    padding: 2px 6px;
    border-radius: var(--cw-radius-sm);
    border: 1px solid var(--cw-border);
    box-shadow: var(--cw-shadow-sm);
  }
}
</style>
