<template>
  <header class="cw-world-bar">
    <div class="cw-world-bar-left">
      <!-- 城市与地点 -->
      <button class="cw-bar-item cw-bar-location" :title="locationDisplay" @click="emit('openWorldDetail', 'location')">
        <SvgIcon name="mapPin" :size="16" class="cw-bar-icon" />
        <span class="cw-bar-text cw-location-name">{{ locationDisplay }}</span>
      </button>

      <!-- 时间、星期、时段；节庆以城市日程中的已确认记录为准 -->
      <button class="cw-bar-item cw-bar-time" @click="emit('openWorldDetail', 'time')">
        <SvgIcon name="clock" :size="16" class="cw-bar-icon" />
        <span class="cw-bar-text">{{ timeDisplay }}</span>
        <span class="cw-badge cw-badge-accent">{{ periodDisplay }}</span>
      </button>

      <!-- 天气与气温 -->
      <button class="cw-bar-item cw-bar-weather" :title="weatherDisplay" @click="emit('openWorldDetail', 'weather')">
        <SvgIcon :name="weatherIcon" :size="16" class="cw-bar-icon" />
        <span class="cw-bar-text">{{ weatherDisplay }}</span>
      </button>
    </div>

    <div class="cw-world-bar-right">
      <!-- 资金账户概览 -->
      <button class="cw-bar-item cw-bar-funds" :title="fundsDisplay" aria-label="资金账目概览" @click="emit('openWorldDetail', 'funds')">
        <SvgIcon name="coins" :size="16" class="cw-bar-icon" />
        <span class="cw-funds-val">{{ fundsDisplay }}</span>
      </button>

      <!-- 城市全貌与次级详情入口 -->
      <button class="cw-btn cw-btn-ghost cw-btn-sm cw-bar-action-btn cw-city-btn" title="城市详情" aria-label="城市详情" @click="emit('openWorldDetail', 'all')">
        <SvgIcon name="calendar" :size="16" />
        <span class="cw-btn-label">城市详情</span>
      </button>

      <!-- 技术字段与管理抽屉 -->
      <button class="cw-btn cw-btn-ghost cw-btn-sm cw-bar-action-btn cw-system-btn" title="系统运行数据" aria-label="系统运行数据" @click="emit('openSystemDrawer')">
        <SvgIcon name="terminal" :size="15" />
        <span class="cw-btn-label">系统</span>
      </button>

      <!-- 设置入口 -->
      <button
        class="cw-btn cw-btn-ghost cw-btn-sm cw-settings-btn cw-bar-action-btn"
        title="外观、字体与API设置"
        aria-label="设置"
        @click="emit('openSettings')"
      >
        <SvgIcon name="settings" :size="16" />
        <span class="cw-btn-label">设置</span>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import SvgIcon from '../icons/SvgIcon.vue';

const props = defineProps<{
  world: any;
  player: any;
  locations?: any;
}>();

const emit = defineEmits<{
  (e: 'openSettings'): void;
  (e: 'openWorldDetail', tab?: string): void;
  (e: 'openSystemDrawer'): void;
}>();

// 时间与日期展示
const timeDisplay = computed(() => {
  const t = props.world?.当前时间;
  if (!t || typeof t.年 !== 'number') return '时间未设定';
  const pad = (n: number) => String(n).padStart(2, '0');
  // 计算星期几（派生）
  const date = new Date(t.年, t.月 - 1, t.日);
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const week = isNaN(date.getDay()) ? '' : weekDays[date.getDay()];
  return `${t.年}/${pad(t.月)}/${pad(t.日)} ${week} ${pad(t.时)}:${pad(t.分)}`;
});

// 时段派生
const periodDisplay = computed(() => {
  const t = props.world?.当前时间;
  if (!t || typeof t.时 !== 'number') return '时段未知';
  const h = t.时;
  if (h >= 5 && h < 9) return '清晨';
  if (h >= 9 && h < 12) return '上午';
  if (h >= 12 && h < 14) return '中午';
  if (h >= 14 && h < 18) return '下午';
  if (h >= 18 && h < 21) return '傍晚';
  if (h >= 21 && h < 24) return '夜间';
  return '深夜';
});

// 位置展示 (优先从根地点或世界地点读取)
const locationDisplay = computed(() => {
  const spotId = props.player?.当前状态?.当前地点id;
  if (!spotId) return '未知地点';
  const spot = props.locations?.[spotId] || props.world?.地点?.[spotId] || props.player?.已知信息?.已知地点?.[spotId];
  return spot?.名称 || spotId;
});

// 天气展示
const weatherDisplay = computed(() => {
  const w = props.world?.天气;
  if (!w || !w.天气状况) return '天气未设定';
  const temp = w.气温 !== null && w.气温 !== undefined ? ` · ${w.气温}℃` : '';
  return `${w.天气状况}${temp}`;
});

const weatherIcon = computed(() => {
  const cond = props.world?.天气?.天气状况;
  if (!cond) return 'sun';
  if (cond.includes('雨')) return 'drop';
  if (cond.includes('云') || cond.includes('阴')) return 'cloud';
  return 'sun';
});

// 金币使用单一余额，未知与零严格区分。
const fundsDisplay = computed(() => {
  const cents = props.player?.资金?.余额分;
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return '金币 --';
  return (cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' 金币';
});
</script>

<style scoped lang="scss">
.cw-world-bar {
  height: 52px;
  width: 100%;
  background: var(--cw-bg-panel);
  backdrop-filter: var(--cw-glass-blur);
  border-bottom: 1px solid var(--cw-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  box-shadow: var(--cw-shadow-sm);
  z-index: 50;
  user-select: none;
  flex-shrink: 0;
}

.cw-world-bar-left,
.cw-world-bar-right {
  display: flex;
  align-items: center;
  gap: 12px;
  white-space: nowrap;
  > * { flex-shrink: 0; }
}

.cw-world-bar-left {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  margin-right: 12px;
  padding: 3px 0;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
}
.cw-world-bar-right { flex-shrink: 0; gap: 6px; }
.cw-location-name { max-width: 150px; overflow: hidden; text-overflow: ellipsis; }

.cw-bar-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);
  color: var(--cw-text-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: var(--cw-bg-card-hover);
    border-color: var(--cw-border-hover);
    transform: translateY(-1px);
  }

  .cw-bar-icon {
    color: var(--cw-accent);
  }
}

.cw-location-name {
  font-weight: 600;
  color: var(--cw-text-primary);
}

.cw-funds-val {
  font-family: monospace, sans-serif;
  font-weight: 600;
  color: var(--cw-success);
}

.cw-btn-sm {
  padding: 5px 10px;
  font-size: 13px;
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius);
}

.cw-settings-btn:hover {
  color: var(--cw-accent);
}

@media (min-width: 641px) and (max-width: 920px) {
  .cw-world-bar { padding-inline: 10px; }
  .cw-world-bar-left { gap: 5px; margin-right: 6px; }
  .cw-world-bar-right .cw-btn-label { display: none; }
  .cw-bar-action-btn { padding: 5px; }
}

@media (max-width: 640px) {
  .cw-world-bar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr) repeat(3, 30px);
    grid-template-areas: 'place time time time time' 'weather funds city system settings';
    gap: 3px 4px;
    height: auto;
    padding: 4px 8px;
  }
  .cw-world-bar-left, .cw-world-bar-right { display: contents; }
  .cw-bar-location { grid-area: place; }
  .cw-bar-time { grid-area: time; }
  .cw-bar-weather { grid-area: weather; }
  .cw-bar-funds { grid-area: funds; }
  .cw-city-btn { grid-area: city; }
  .cw-system-btn { grid-area: system; }
  .cw-settings-btn { grid-area: settings; }

  .cw-bar-item, .cw-bar-action-btn {
    min-width: 0;
    min-height: 27px;
    justify-content: center;
    padding: 2px 4px;
    gap: 4px;
    font-size: 12px;
  }
  .cw-bar-icon { flex: 0 0 auto; }
  .cw-bar-text, .cw-funds-val {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cw-btn-label { display: none; }
}
</style>
