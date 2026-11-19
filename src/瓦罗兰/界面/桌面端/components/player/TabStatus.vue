<template>
  <div class="cw-tab-pane cw-player-status-pane">
    <!-- 三条身体生理状态长条 -->
    <div class="cw-body-status-card">
      <h4 class="cw-section-title">
        <SvgIcon name="heart" :size="16" />
        <span>身体机能状态 (0 ~ 100)</span>
      </h4>

      <div class="cw-status-bars-group">
        <!-- 饱食度 -->
        <div class="cw-status-bar-row">
          <div class="cw-bar-header">
            <div class="cw-bar-name">
              <SvgIcon name="food" :size="15" />
              <span tabindex="0" data-cw-tooltip="表示进食后的充足程度，越高越充足；未知不等于耗尽。实际进食后才恢复。" data-cw-tooltip-touch>饱食度</span>
            </div>
            <div class="cw-bar-val">
              <span class="cw-num" :class="{ 'cw-num-low': isLow(player?.当前状态?.饱食度) }">
                {{ formatVal(player?.当前状态?.饱食度) }}
              </span>
              <span v-if="isLow(player?.当前状态?.饱食度)" class="cw-badge cw-badge-danger">过低预警</span>
            </div>
          </div>
          <div class="cw-progress-track">
            <div
              class="cw-progress-fill cw-fill-food"
              :class="{ 'cw-low-fill': isLow(player?.当前状态?.饱食度) }"
              :style="{ width: `${clampVal(player?.当前状态?.饱食度)}%` }"
            ></div>
          </div>
        </div>

        <!-- 水分值 -->
        <div class="cw-status-bar-row">
          <div class="cw-bar-header">
            <div class="cw-bar-name">
              <SvgIcon name="drop" :size="15" />
              <span tabindex="0" data-cw-tooltip="表示补水状况，越高越充足；未知不等于耗尽。实际饮水后才恢复。" data-cw-tooltip-touch>水分值</span>
            </div>
            <div class="cw-bar-val">
              <span class="cw-num" :class="{ 'cw-num-low': isLow(player?.当前状态?.水分值) }">
                {{ formatVal(player?.当前状态?.水分值) }}
              </span>
              <span v-if="isLow(player?.当前状态?.水分值)" class="cw-badge cw-badge-danger">过低预警</span>
            </div>
          </div>
          <div class="cw-progress-track">
            <div
              class="cw-progress-fill cw-fill-water"
              :class="{ 'cw-low-fill': isLow(player?.当前状态?.水分值) }"
              :style="{ width: `${clampVal(player?.当前状态?.水分值)}%` }"
            ></div>
          </div>
        </div>

        <!-- 体力值 -->
        <div class="cw-status-bar-row">
          <div class="cw-bar-header">
            <div class="cw-bar-name">
              <SvgIcon name="bolt" :size="15" />
              <span tabindex="0" data-cw-tooltip="表示当前可用精力，随实际消耗和休息变化，不是魔力或战斗能力。低于20为过低提醒，0不自动代表死亡或昏迷。" data-cw-tooltip-touch>体力值</span>
            </div>
            <div class="cw-bar-val">
              <span class="cw-num" :class="{ 'cw-num-low': isLow(player?.当前状态?.体力值) }">
                {{ formatVal(player?.当前状态?.体力值) }}
              </span>
              <span v-if="isLow(player?.当前状态?.体力值)" class="cw-badge cw-badge-danger">过低预警</span>
            </div>
          </div>
          <div class="cw-progress-track">
            <div
              class="cw-progress-fill cw-fill-stamina"
              :class="{ 'cw-low-fill': isLow(player?.当前状态?.体力值) }"
              :style="{ width: `${clampVal(player?.当前状态?.体力值)}%` }"
            ></div>
          </div>
        </div>
      </div>
    </div>

    <!-- 当前行为与穿搭状态 -->
    <div class="cw-activity-card">
      <h4 class="cw-section-title">
        <SvgIcon name="mapPin" :size="16" />
        <span>当前所在与穿搭</span>
      </h4>
      <div class="cw-act-grid">
        <div class="cw-act-cell">
          <span class="cw-act-k">当前地点</span>
          <span class="cw-act-v">{{ place(player?.当前状态?.当前地点id) }}</span>
        </div>
        <div class="cw-act-cell">
          <span class="cw-act-k">进行中行动</span>
          <span class="cw-act-v">{{ player?.当前状态?.正在进行的行动 || '未知 / 未记录' }}</span>
        </div>
        <div class="cw-act-cell cw-cell-full">
          <span class="cw-act-k">今日穿搭</span>
          <span class="cw-act-v">{{ player?.当前状态?.今日穿搭 || '未知 / 未记录' }}</span>
        </div>
        <div class="cw-act-cell cw-cell-full">
          <span class="cw-act-k">身体感受</span>
          <span class="cw-act-v">{{ player?.当前状态?.身体状态 || '未知 / 未记录' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useWorldState, locationName } from '../../utils/context';
const state = useWorldState();
const place = (id: any) => locationName(state?.value, id);
import SvgIcon from '../icons/SvgIcon.vue';

defineProps<{
  player: any;
}>();

function formatVal(val: any) {
  if (val === null || val === undefined) return '未设定';
  return String(val);
}

function clampVal(val: any) {
  if (typeof val !== 'number') return 0;
  return Math.min(100, Math.max(0, val));
}

function isLow(val: any) {
  return typeof val === 'number' && val < 20;
}
</script>

<style scoped lang="scss">
.cw-player-status-pane {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cw-body-status-card,
.cw-activity-card {
  padding: 16px 20px;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card);
  border: 1px solid var(--cw-border);
}

.cw-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 16px;
  font-size: 14px;
  font-weight: 600;
  color: var(--cw-text-primary);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--cw-border);
}

.cw-status-bars-group {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.cw-status-bar-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cw-bar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;

  .cw-bar-name {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--cw-text-primary);
  }

  .cw-bar-val {
    display: flex;
    align-items: center;
    gap: 8px;

    .cw-num {
      font-family: monospace, sans-serif;
      font-weight: 700;
      font-size: 14px;
      color: var(--cw-text-primary);

      &.cw-num-low {
        color: var(--cw-danger);
      }
    }
  }
}

.cw-progress-track {
  width: 100%;
  height: 10px;
  background: var(--cw-bg-card-subtle);
  border-radius: var(--cw-radius-full);
  overflow: hidden;
  border: 1px solid var(--cw-border);
}

.cw-progress-fill {
  height: 100%;
  border-radius: var(--cw-radius-full);
  transition: width 0.3s ease;

  &.cw-fill-food {
    background: linear-gradient(90deg, #d9822b, #e6a23c);
  }
  &.cw-fill-water {
    background: linear-gradient(90deg, #2176c7, #409eff);
  }
  &.cw-fill-stamina {
    background: linear-gradient(90deg, #3f8f6b, #67c23a);
  }

  &.cw-low-fill {
    background: var(--cw-danger) !important;
    animation: cwLowPulse 1.5s infinite;
  }
}

.cw-bar-hint {
  font-size: 11px;
  color: var(--cw-text-muted);
}

.cw-act-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;

  .cw-act-cell {
    padding: 8px 12px;
    border-radius: var(--cw-radius-sm);
    background: var(--cw-bg-card-subtle);
    display: flex;
    flex-direction: column;
    gap: 4px;

    .cw-act-k {
      font-size: 11px;
      color: var(--cw-text-muted);
    }
    .cw-act-v {
      font-size: 13px;
      font-weight: 500;
      color: var(--cw-text-primary);
    }

    &.cw-cell-full {
      grid-column: span 2;
    }
  }
}

@keyframes cwLowPulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}
</style>
