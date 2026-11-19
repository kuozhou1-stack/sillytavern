<template>
  <div
    class="cw-character-avatar"
    :class="[`cw-avatar-${shape}`]"
    :style="avatarStyle"
    :title="name || '角色'"
    :aria-label="name || '角色头像'"
  >
    <img
      v-if="src"
      :src="src"
      :alt="name || '头像'"
      class="cw-avatar-img"
      @error="imageLoadError = true"
    />
    <span v-else class="cw-avatar-text">{{ initialText }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    name?: string;
    avatarUrl?: string | null;
    size?: number;
    shape?: 'circle' | 'rounded';
    colorIndex?: number;
  }>(),
  {
    name: '',
    avatarUrl: null,
    size: 36,
    shape: 'circle',
    colorIndex: undefined,
  },
);

const imageLoadError = ref(false);
watch(
  () => props.avatarUrl,
  () => {
    imageLoadError.value = false;
  },
);

const src = computed(() => {
  if (imageLoadError.value || !props.avatarUrl) return null;
  return props.avatarUrl;
});

// 优雅的现代日系日常配色集（色相饱满、柔和不刺眼）
const palette = [
  { bg: '#e8f0fe', color: '#1a73e8', border: 'rgba(26, 115, 232, 0.25)' }, // 晴空蓝
  { bg: '#fef3e6', color: '#c4783c', border: 'rgba(196, 120, 60, 0.3)' },  // 暖橙
  { bg: '#e6f4ea', color: '#188038', border: 'rgba(24, 128, 56, 0.25)' },  // 翡翠青
  { bg: '#fce8e6', color: '#d93025', border: 'rgba(217, 48, 37, 0.25)' },  // 绯红
  { bg: '#f3e8fd', color: '#9334e6', border: 'rgba(147, 52, 230, 0.25)' }, // 浅紫
  { bg: '#e0f7fa', color: '#00838f', border: 'rgba(0, 131, 143, 0.25)' },  // 水蓝
  { bg: '#fff8e1', color: '#f57f17', border: 'rgba(245, 127, 23, 0.25)' }, // 金琥珀
  { bg: '#f1f8e9', color: '#558b2f', border: 'rgba(85, 139, 47, 0.25)' },  // 嫩草绿
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

const chosenColor = computed(() => {
  if (typeof props.colorIndex === 'number') {
    return palette[Math.abs(props.colorIndex) % palette.length];
  }
  const str = props.name || '玩家';
  const idx = hashString(str) % palette.length;
  return palette[idx];
});

const initialText = computed(() => {
  const raw = (props.name || '人').trim();
  if (!raw) return '人';
  if (/^[\u4e00-\u9fa5]+$/.test(raw)) {
    return raw.length >= 2 ? raw.slice(-1) : raw;
  }
  return raw.slice(0, 1).toUpperCase();
});

const avatarStyle = computed(() => {
  const c = chosenColor.value;
  return {
    width: `${props.size}px`,
    height: `${props.size}px`,
    minWidth: `${props.size}px`,
    fontSize: `${Math.max(11, Math.round(props.size * 0.44))}px`,
    backgroundColor: src.value ? 'transparent' : c.bg,
    color: c.color,
    border: `1px solid ${c.border}`,
  };
});
</script>

<style scoped lang="scss">
.cw-character-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  user-select: none;
  flex-shrink: 0;
  box-sizing: border-box;
  overflow: hidden;
  line-height: 1;
  transition: transform 0.15s ease, box-shadow 0.15s ease;

  &.cw-avatar-circle {
    border-radius: var(--cw-radius-full, 9999px);
  }

  &.cw-avatar-rounded {
    border-radius: var(--cw-radius, 10px);
  }

  .cw-avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .cw-avatar-text {
    display: inline-block;
  }
}
</style>
