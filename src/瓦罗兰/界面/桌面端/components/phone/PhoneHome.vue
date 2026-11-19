<template>
  <div class="cw-phone-home">
    <!-- 顶部时间大时钟小组件 -->
    <div class="cw-home-clock-widget">
      <div class="cw-widget-time">{{ currentTimeStr }}</div>
      <div class="cw-widget-date">{{ currentDateStr }} · 瓦罗兰</div>
    </div>

    <nav class="cw-apps-grid" aria-label="手机应用">
      <button
        v-for="app in apps"
        :key="app.key"
        type="button"
        class="cw-app-icon-item"
        @click="emit('openApp', app.key)"
      >
        <span class="cw-app-icon" :class="'cw-icon-' + app.key">
          <SvgIcon :name="app.icon" :size="28" />
          <span v-if="app.unread" class="cw-app-badge" :aria-label="app.unread + ' 条未读'">{{ app.unread }}</span>
        </span>
        <span class="cw-app-name">{{ app.name }}</span>
      </button>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import SvgIcon from '../icons/SvgIcon.vue';

const props = withDefaults(
  defineProps<{
    worldTime?: any;
    linxinUnread?: number;
    weilanUnread?: number;
  }>(),
  {
    worldTime: null,
    linxinUnread: 0,
    weilanUnread: 0,
  },
);

const emit = defineEmits<{
  (e: 'openApp', appName: 'linxin' | 'weilan' | 'map' | 'settings'): void;
}>();

const apps = computed(() => [
  { key: 'linxin', name: '邻信', icon: 'messageSquare', unread: props.linxinUnread },
  { key: 'weilan', name: '微澜', icon: 'globe', unread: props.weilanUnread },
  { key: 'map', name: '世界地图', icon: 'compass', unread: 0 },
  { key: 'settings', name: '手机设置', icon: 'settings', unread: 0 },
] as const);

const currentTimeStr = computed(() => {
  const t = props.worldTime;
  if (!t || typeof t.时 !== 'number') return '--:--';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(t.时)}:${pad(t.分)}`;
});

const currentDateStr = computed(() => {
  const t = props.worldTime;
  if (!t || typeof t.月 !== 'number') return '日期未知';
  return `${t.月}月${t.日}日`;
});
</script>

<style scoped lang="scss">
.cw-phone-home {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: clamp(20px, 6%, 40px);
  padding: 16px 20px 12px;
  background: linear-gradient(180deg, var(--cw-bg-main) 0%, var(--cw-bg-card-subtle) 100%);
}

.cw-home-clock-widget {
  text-align: center;
  padding: 24px 0 10px;

  .cw-widget-time {
    font-size: 48px;
    font-weight: 300;
    color: var(--cw-text-primary);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    letter-spacing: -1px;
    line-height: 1;
  }

  .cw-widget-date {
    font-size: 13px;
    font-weight: 500;
    color: var(--cw-text-secondary);
    margin-top: 6px;
  }
}

.cw-apps-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px 14px;
  padding: 20px 0;

  .cw-app-icon-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    border: 0;
    padding: 4px 0;
    background: transparent;
    color: inherit;
    font: inherit;
    user-select: none;
    &:focus-visible { outline: 2px solid var(--cw-accent); outline-offset: 2px; }

    transition: transform 0.15s;

    &:hover {
      transform: translateY(-3px);
    }
    &:active {
      transform: scale(0.92);
    }

    .cw-app-icon {
      width: 58px;
      height: 58px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: var(--cw-shadow);
      position: relative;
      color: #fff;
    }

    .cw-icon-linxin {
      background: linear-gradient(135deg, #07c160, #059649);
    }
    .cw-icon-weilan {
      background: linear-gradient(135deg, #e6162d, #ff5500);
    }
    .cw-icon-map {
      background: linear-gradient(135deg, #2b7bc4, #195285);
    }
    .cw-icon-settings {
      background: linear-gradient(135deg, #6c757d, #495057);
    }

    .cw-app-badge {
      position: absolute;
      top: -4px;
      right: -4px;
      background: var(--cw-danger);
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: var(--cw-radius-full);
      border: 2px solid var(--cw-bg-surface);
    }

    .cw-app-name {
      font-size: 12px;
      font-weight: 500;
      color: var(--cw-text-primary);
    }
  }
}

@media (max-width: 360px) {
  .cw-phone-home {
    padding: 16px 10px 12px;
  }

  .cw-home-clock-widget {
    padding: 12px 0 6px;
    .cw-widget-time {
      font-size: 38px;
    }
    .cw-widget-date {
      font-size: 12px;
    }
  }

  .cw-apps-grid {
    gap: 14px 6px;
    padding: 14px 0;

    .cw-app-icon-item {
      gap: 6px;

      .cw-app-icon {
        width: 46px;
        height: 46px;
        border-radius: 11px;
      }

      .cw-app-name {
        font-size: 11px;
      }
    }
  }
}
</style>
