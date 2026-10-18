<template>
  <div class="cw-modal-backdrop" @click.self="emit('close')">
    <div class="cw-modal-box cw-low-status-modal">
      <div class="cw-modal-header">
        <div class="cw-header-title">
          <SvgIcon name="alertCircle" :size="20" class="cw-alert-icon" />
          <span>身体生理状态过低预警</span>
        </div>
        <button class="cw-btn cw-btn-ghost cw-close-btn" @click="emit('close')">
          <SvgIcon name="close" :size="18" />
        </button>
      </div>

      <div class="cw-modal-body">
        <div class="cw-warning-banner">
          <span>身体状态有指标低于 20，可在行动中安排补给或休息。</span>
        </div>

        <div class="cw-status-alert-list">
          <div v-if="isLow(player?.当前状态?.饱食度)" class="cw-alert-row">
            <SvgIcon name="food" :size="18" />
            <div class="cw-alert-info">
              <span class="cw-alert-name">饱食度严重不足 ({{ player?.当前状态?.饱食度 }}/100)</span>
              <span class="cw-alert-hint">产生饥饿感，四肢无力；可前往物品栏使用食物或前往餐厅就餐。</span>
            </div>
          </div>

          <div v-if="isLow(player?.当前状态?.水分值)" class="cw-alert-row">
            <SvgIcon name="drop" :size="18" />
            <div class="cw-alert-info">
              <span class="cw-alert-name">水分值极度亏缺 ({{ player?.当前状态?.水分值 }}/100)</span>
              <span class="cw-alert-hint">喉干口渴，代谢降低；请及时补充饮水或清爽汤饮。</span>
            </div>
          </div>

          <div v-if="isLow(player?.当前状态?.体力值)" class="cw-alert-row">
            <SvgIcon name="bolt" :size="18" />
            <div class="cw-alert-info">
              <span class="cw-alert-name">体力值处于耗尽边缘 ({{ player?.当前状态?.体力值 }}/100)</span>
              <span class="cw-alert-hint">可以主动安排休息，具体感受与恢复按实际行动判断。</span>
            </div>
          </div>
        </div>
      </div>

      <div class="cw-modal-footer">
        <button class="cw-btn cw-btn-primary" @click="emit('goToItems')">
          <SvgIcon name="backpack" :size="14" />
          <span>前往物品栏查看可用补给</span>
        </button>
        <button class="cw-btn cw-btn-ghost" @click="emit('close')">我已知悉</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import SvgIcon from '../icons/SvgIcon.vue';

defineProps<{
  player: any;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'goToItems'): void;
}>();

function isLow(val: any) {
  return typeof val === 'number' && val < 20;
}
</script>

<style scoped lang="scss">
.cw-low-status-modal {
  width: 100%;
  max-width: 520px;
  max-height: calc(100% - 24px);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}

.cw-modal-header {
  flex-shrink: 0;
  padding: 14px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid var(--cw-border);
  background: var(--cw-bg-card-subtle);

  .cw-header-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 600;
    min-width: 0;
  }

  .cw-close-btn {
    flex-shrink: 0;
  }
}

.cw-alert-icon {
  color: var(--cw-danger);
  flex-shrink: 0;
}

.cw-modal-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cw-warning-banner {
  flex-shrink: 0;
  padding: 10px 14px;
  border-radius: var(--cw-radius);
  background: var(--cw-danger-bg);
  border: 1px solid rgba(201, 74, 74, 0.3);
  color: var(--cw-danger);
  font-size: 13px;
  line-height: 1.55;
}

.cw-status-alert-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cw-alert-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);
  color: var(--cw-danger);

  :deep(svg) {
    flex-shrink: 0;
    margin-top: 2px;
  }

  .cw-alert-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;

    .cw-alert-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--cw-text-primary);
      line-height: 1.35;
    }
    .cw-alert-hint {
      font-size: 12px;
      color: var(--cw-text-secondary);
      line-height: 1.45;
    }
  }
}

.cw-modal-footer {
  flex-shrink: 0;
  padding: 12px 20px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 10px;
  border-top: 1px solid var(--cw-border);
  background: var(--cw-bg-card-subtle);

  .cw-btn {
    white-space: nowrap;
  }
}

@media (max-width: 520px) {
  .cw-low-status-modal {
    max-height: calc(100% - 16px);
  }
  .cw-modal-header {
    padding: 10px 14px;
  }
  .cw-modal-body {
    padding: 12px 14px;
    gap: 10px;
  }
  .cw-warning-banner {
    padding: 8px 12px;
    font-size: 12.5px;
  }
  .cw-status-alert-list {
    gap: 8px;
  }
  .cw-alert-row {
    padding: 9px 11px;
    gap: 9px;
  }
  .cw-modal-footer {
    padding: 10px 14px;
    gap: 8px;
    flex-direction: column;
    align-items: stretch;

    .cw-btn {
      width: 100%;
      justify-content: center;
      min-height: 36px;
      white-space: normal;
      text-align: center;
    }
  }
}
</style>
