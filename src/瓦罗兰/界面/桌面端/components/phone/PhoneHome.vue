<template>
  <div class="cw-phone-home">
    <!-- 顶部时间大时钟小组件 -->
    <div class="cw-home-clock-widget">
      <div class="cw-widget-time">{{ currentTimeStr }}</div>
      <div class="cw-widget-date">{{ currentDateStr }} · 瓦罗兰</div>
    </div>

    <!-- 应用网格 -->
    <div class="cw-apps-grid">
      <!-- 邻信 -->
      <div class="cw-app-icon-item" @click="emit('openApp', 'linxin')">
        <div class="cw-app-icon cw-icon-linxin">
          <SvgIcon name="messageSquare" :size="28" />
          <span v-if="linxinUnread > 0" class="cw-app-badge">{{ linxinUnread }}</span>
        </div>
        <span class="cw-app-name">邻信</span>
      </div>

      <!-- 微澜 -->
      <div class="cw-app-icon-item" @click="emit('openApp', 'weilan')">
        <div class="cw-app-icon cw-icon-weilan">
          <SvgIcon name="globe" :size="28" />
          <span v-if="weilanUnread > 0" class="cw-app-badge">{{ weilanUnread }}</span>
        </div>
        <span class="cw-app-name">微澜</span>
      </div>

      <!-- 世界地图 -->
      <div class="cw-app-icon-item" @click="emit('openApp', 'map')">
        <div class="cw-app-icon cw-icon-map">
          <SvgIcon name="compass" :size="28" />
        </div>
        <span class="cw-app-name">世界地图</span>
      </div>

      <!-- 手机设置 -->
      <div class="cw-app-icon-item" @click="emit('openApp', 'settings')">
        <div class="cw-app-icon cw-icon-settings">
          <SvgIcon name="settings" :size="28" />
        </div>
        <span class="cw-app-name">手机设置</span>
      </div>
    </div>

    <!-- 底部 Dock 栏 -->
    <div class="cw-home-dock">
      <div class="cw-dock-inner">
        <button class="cw-dock-icon" title="邻信" @click="emit('openApp', 'linxin')">
          <SvgIcon name="messageSquare" :size="22" />
        </button>
        <button class="cw-dock-icon" title="微澜" @click="emit('openApp', 'weilan')">
          <SvgIcon name="globe" :size="22" />
        </button>
        <button class="cw-dock-icon" title="地图" @click="emit('openApp', 'map')">
          <SvgIcon name="compass" :size="22" />
        </button>
        <button class="cw-dock-icon" title="设置" @click="emit('openApp', 'settings')">
          <SvgIcon name="settings" :size="22" />
        </button>
      </div>
    </div>
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
.cw-app-button{border:0;background:transparent;padding:0;font:inherit;}
.cw-expectations{display:flex;flex-direction:column;gap:5px;flex-shrink:0;text-align:left;color:var(--cw-text-primary);background:var(--cw-bg-card);border:1px solid var(--cw-border);border-radius:12px;padding:10px;font-size:12px;cursor:pointer;overflow-wrap:anywhere;}
.cw-icon-calendar{background:linear-gradient(135deg,#dc714d,#bb4b32);}
.cw-icon-news{background:linear-gradient(135deg,#456885,#273e54);}
.cw-icon-creator{background:linear-gradient(135deg,#be185d,#831843);}
.cw-phone-home {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
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
    user-select: none;
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

.cw-home-dock {
  padding-bottom: 8px;

  .cw-dock-inner {
    background: var(--cw-bg-panel);
    backdrop-filter: var(--cw-glass-blur);
    border: 1px solid var(--cw-border);
    border-radius: 24px;
    padding: 10px 16px;
    display: flex;
    justify-content: space-around;
    align-items: center;
    box-shadow: var(--cw-shadow);

    .cw-dock-icon {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      border: none;
      background: var(--cw-bg-card);
      color: var(--cw-text-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: var(--cw-shadow-sm);
      transition: all 0.15s;

      &:hover {
        background: var(--cw-bg-card-hover);
        color: var(--cw-accent);
        transform: translateY(-2px);
      }
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

  .cw-home-dock .cw-dock-inner {
    padding: 6px 8px;

    .cw-dock-icon {
      width: 38px;
      height: 38px;
      border-radius: 10px;
    }
  }
}
</style>
