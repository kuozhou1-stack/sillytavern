<template>
  <div class="cw-tab-pane cw-char-tab-status">
    <!-- 1. 置顶核心聚焦：实时行踪与当下动态 (解决问题 18) -->
    <div class="cw-status-hero-card">
      <div class="cw-hero-status-top">
        <div class="cw-location-chip" :title="`当前所在：${place(char?.当前地点id)}`">
          <SvgIcon name="mapPin" :size="15" />
          <span class="cw-loc-name">{{ place(char?.当前地点id) }}</span>
        </div>
        <div class="cw-live-state-indicator">
          <span class="cw-pulse-dot"></span>
          <span>实时状态</span>
        </div>
      </div>

      <!-- 正在进行的行动或情境 -->
      <div class="cw-action-content">
        <div class="cw-action-text">{{ char?.当前状态 || '正在瓦罗兰城市中自主生活与漫步' }}</div>
      </div>

      <!-- 穿搭与心境紧凑集成标签条 -->
      <div class="cw-status-quick-pills">
        <div v-if="char?.外貌?.今日穿搭" class="cw-pill-item" title="今日穿搭">
          <span class="cw-pill-k">穿搭：</span>
          <span class="cw-pill-v">{{ char.外貌.今日穿搭 }}</span>
        </div>
        <div v-if="char?.当前形态" class="cw-pill-item" title="当前形态">
          <span class="cw-pill-k">形态：</span>
          <span class="cw-pill-v">{{ show(char.当前形态) }}</span>
        </div>
        <div v-if="char?.即时状态?.心境基调" class="cw-pill-item cw-pill-accent" title="心境基调">
          <span class="cw-pill-k">心境：</span>
          <span class="cw-pill-v">{{ char.即时状态.心境基调 }}</span>
        </div>
        <div v-if="char?.即时状态?.生理状态" class="cw-pill-item cw-pill-highlight" title="生理体温">
          <span class="cw-pill-k">体温：</span>
          <span class="cw-pill-v">{{ char.即时状态.生理状态 }}</span>
        </div>
      </div>

      <!-- 当下关切 -->
      <div v-if="char?.即时状态?.注意力重心" class="cw-focus-attention">
        <span class="cw-focus-lbl">当下所思：</span>
        <span class="cw-focus-text">{{ char.即时状态.注意力重心 }}</span>
      </div>
    </div>

    <!-- 生活安排与常驻环境 -->
    <div class="cw-status-card">
      <h4 class="cw-section-title">
        <SvgIcon name="calendar" :size="16" />
        <span>生活安排与常驻地点</span>
      </h4>
      <div class="cw-desc-list">
        <div class="cw-desc-item">
          <span class="cw-desc-k">居住地点</span>
          <span class="cw-desc-v">{{ place(char?.生活?.住处id) }}</span>
        </div>
        <div class="cw-desc-item">
          <span class="cw-desc-k">工作地点</span>
          <span class="cw-desc-v">{{ (char?.生活?.工作地点id || []).map(place).join('、') || '暂无记录' }}</span>
        </div>
        <div class="cw-desc-item">
          <span class="cw-desc-k">常去地点</span>
          <span class="cw-desc-v">{{ (char?.生活?.常去地点id || []).map(place).join('、') || '暂无特别记录' }}</span>
        </div>
        <div class="cw-desc-item">
          <span class="cw-desc-k">日常作息习惯</span>
          <span class="cw-desc-v">{{ char?.生活?.日常活动 || '未知 / 未记录' }}</span>
        </div>
      </div>
    </div>

    <!-- 近期社交动态与交集 (离线生态) -->
    <div v-if="recentEncounters.length > 0" class="cw-status-card">
      <h4 class="cw-section-title">
        <SvgIcon name="users" :size="16" />
        <span>近期社交交集与回响</span>
      </h4>
      <div class="cw-sub-card-list">
        <div v-for="(enc, idx) in recentEncounters" :key="idx" class="cw-sub-card cw-encounter-card">
          <div class="cw-sub-header">
            <span class="cw-sub-title">与 {{ resolveCharName(enc.与) }}</span>
            <span v-if="enc.时间" class="cw-badge">{{ enc.时间 }}</span>
          </div>
          <p class="cw-sub-desc">{{ enc.交集事项 }}</p>
        </div>
      </div>
    </div>

    <!-- 个人目标与约定 -->
    <div class="cw-status-card">
      <h4 class="cw-section-title">
        <SvgIcon name="target" :size="16" />
        <span>个人目标与待办约定</span>
      </h4>
      <div v-if="hasGoalsOrPromises" class="cw-sub-card-list">
        <!-- 目标列表 -->
        <div v-for="(g, id) in char?.生活?.目标" :key="id" class="cw-sub-card">
          <div class="cw-sub-header">
            <span class="cw-sub-title">{{ g.内容 || g.目标内容 || id }}</span>
            <span class="cw-badge cw-badge-accent">个人目标</span>
          </div>
          <p v-if="g.进展" class="cw-sub-desc"><strong>进展：</strong>{{ g.进展 }}</p>
          <p v-else class="cw-sub-desc" style="color: var(--cw-text-muted);">暂无具体进展记录</p>
        </div>

        <!-- 约定列表 (F10) -->
        <div v-for="p in characterPromises" :key="p.id" class="cw-sub-card cw-promise-card">
          <div class="cw-sub-header">
            <span class="cw-sub-title">{{ p.内容 || '待办约定' }}</span>
            <span class="cw-badge" :class="getPromiseBadgeClass(p.状态)">{{ p.状态 || '拟议' }}</span>
          </div>
          <div class="cw-promise-meta">
            <span v-if="p.时间说明 || p.时间">🕒 {{ p.时间说明 || formatTime(p.时间) }}</span>
            <span v-if="p.地点id">📍 {{ place(p.地点id) }}</span>
            <span v-if="p.myRole?.称呼">👤 称呼：{{ p.myRole.称呼 }}</span>
            <span v-if="p.myRole?.响应" class="cw-badge cw-badge-sm">响应：{{ p.myRole.响应 }}</span>
          </div>
        </div>
      </div>
      <div v-else class="cw-empty-sub">当前未记录公开的个人目标或待办约定。</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useWorldState, locationName, show } from '../../../utils/context';
const worldState = useWorldState();
const place = (id: any) => locationName(worldState?.value, id);
import SvgIcon from '../../icons/SvgIcon.vue';

const props = defineProps<{
  char: any;
}>();

const charId = computed(() => {
  if (props.char?.id) return props.char.id;
  const chars = worldState?.value?.角色 || {};
  return Object.keys(chars).find(k => chars[k] === props.char) || '';
});

const hasLivelyStatus = computed(() => {
  const s = props.char?.即时状态;
  return Boolean(s && (s.心境基调 || s.生理状态 || s.注意力重心));
});

import { recentSocialEncounters } from '../../../../../运行/character-read';
const recentEncounters = computed(() => recentSocialEncounters(worldState.value, charId.value));

function resolveCharName(id: string): string {
  if (!id) return '未知人物';
  if (id === worldState.value.玩家.id) return worldState.value.玩家.姓名 ?? '玩家';
  const c = worldState?.value?.角色?.[id];
  return c?.基础信息?.姓名 || c?.姓名 || id;
}

function formatTime(t: any): string {
  if (!t) return '';
  if (typeof t === 'string') return t;
  if (t.年 && t.月 && t.日) {
    return `${t.年}年${t.月}月${t.日}日 ${t.时 ?? 0}:${String(t.分 ?? 0).padStart(2, '0')}`;
  }
  return '';
}

function getPromiseBadgeClass(status: string) {
  switch (status) {
    case '已确认':
    case '完成':
      return 'cw-badge-success';
    case '取消':
    case '未履行':
      return 'cw-badge-danger';
    case '待确认':
      return 'cw-badge-warning';
    default:
      return 'cw-badge-info';
  }
}

const characterPromises = computed(() => {
  const allPromises = worldState?.value?.约定;
  if (!allPromises || typeof allPromises !== 'object') return [];
  const cid = charId.value;
  return Object.entries(allPromises)
    .filter(([_, p]: [string, any]) => {
      if (!cid) return false;
      return Boolean(p?.参与者 && (cid in p.参与者));
    })
    .map(([id, p]: [string, any]) => ({
      id,
      ...p,
      myRole: p.参与者?.[cid],
    }));
});

const hasGoalsOrPromises = computed(() => {
  const g = props.char?.生活?.目标;
  const hasG = g && Object.keys(g).length > 0;
  return hasG || characterPromises.value.length > 0;
});
</script>

<style scoped lang="scss">
.cw-char-tab-status {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 顶部置顶 Hero 动态卡片 (解决问题 18) */
.cw-status-hero-card {
  padding: 18px 20px;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card);
  border: 1px solid var(--cw-accent-border, var(--cw-accent));
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  gap: 12px;

  .cw-hero-status-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;

    .cw-location-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      border-radius: var(--cw-radius-full);
      background: var(--cw-accent-bg);
      border: 1px solid var(--cw-accent-border);
      color: var(--cw-accent);
      font-weight: 600;
      font-size: 13px;
    }

    .cw-live-state-indicator {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--cw-text-secondary);
      font-weight: 500;

      .cw-pulse-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--cw-success, #27ae60);
        box-shadow: 0 0 0 0 rgba(39, 174, 96, 0.7);
        animation: cwPulse 2s infinite;
      }
    }
  }

  .cw-action-content {
    .cw-action-text {
      font-size: 15px;
      font-weight: 600;
      line-height: 1.5;
      color: var(--cw-text-primary);
    }
  }

  .cw-status-quick-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;

    .cw-pill-item {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      padding: 3px 8px;
      border-radius: var(--cw-radius-sm);
      background: var(--cw-bg-card-subtle);
      border: 1px solid var(--cw-border);
      font-size: 11px;

      .cw-pill-k {
        color: var(--cw-text-muted);
      }
      .cw-pill-v {
        color: var(--cw-text-primary);
        font-weight: 500;
      }

      &.cw-pill-accent {
        border-color: var(--cw-accent-border);
        background: var(--cw-accent-bg);
        .cw-pill-v {
          color: var(--cw-accent);
        }
      }

      &.cw-pill-highlight {
        border-color: rgba(229, 153, 178, 0.35);
        background: rgba(229, 153, 178, 0.1);
        .cw-pill-v {
          color: #e599b2;
        }
      }
    }
  }

  .cw-focus-attention {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 12px;
    padding-top: 8px;
    border-top: 1px dashed var(--cw-border);

    .cw-focus-lbl {
      color: var(--cw-text-muted);
      flex-shrink: 0;
    }
    .cw-focus-text {
      color: var(--cw-text-secondary);
      line-height: 1.4;
    }
  }
}

@keyframes cwPulse {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(39, 174, 96, 0.7);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 6px rgba(39, 174, 96, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(39, 174, 96, 0);
  }
}

.cw-status-card {
  padding: 16px 20px;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card);
  border: 1px solid var(--cw-border);
}

.cw-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 14px;
  font-size: 14px;
  font-weight: 600;
  color: var(--cw-text-primary);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--cw-border);
}

.cw-status-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;

  .cw-status-cell {
    padding: 8px 12px;
    border-radius: var(--cw-radius-sm);
    background: var(--cw-bg-card-subtle);
    display: flex;
    flex-direction: column;
    gap: 4px;

    .cw-cell-k {
      font-size: 11px;
      color: var(--cw-text-muted);
    }
    .cw-cell-v {
      font-size: 13px;
      font-weight: 500;
      color: var(--cw-text-primary);
    }

    &.cw-cell-full {
      grid-column: span 2;
    }
  }
}

.cw-form-cell .cw-cell-v {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.cw-desc-list {
  display: flex;
  flex-direction: column;
  gap: 8px;

  .cw-desc-item {
    display: flex;
    font-size: 13px;
    line-height: 1.6;

    .cw-desc-k {
      width: 100px;
      flex-shrink: 0;
      color: var(--cw-text-muted);
    }
    .cw-desc-v {
      flex: 1;
      color: var(--cw-text-primary);
    }
  }
}

.cw-sub-card-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cw-sub-card {
  padding: 10px 14px;
  border-radius: var(--cw-radius-sm);
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);

  .cw-sub-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;

    .cw-sub-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--cw-text-primary);
    }
  }

  .cw-sub-desc {
    margin: 0;
    font-size: 12px;
    color: var(--cw-text-secondary);
    line-height: 1.5;
  }
}

.cw-empty-sub {
  font-size: 13px;
  color: var(--cw-text-muted);
  text-align: center;
  padding: 12px 0;
}

.cw-lively-card {
  border-left: 3px solid var(--cw-accent, #c586c0);

  .cw-lively-v {
    color: var(--cw-text-primary);
    font-weight: 500;
  }
  .cw-lively-highlight {
    color: var(--cw-accent, #e599b2);
    font-weight: 500;
  }
}

.cw-encounter-card {
  border-left: 2px solid var(--cw-accent, #9cdcfe);
}
</style>
