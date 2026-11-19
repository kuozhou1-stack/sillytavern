<template>
  <div class="cw-tab-pane cw-char-tab-life">
    <!-- 最近经历 (近期活跃轨迹) -->
    <div class="cw-life-card">
      <h4 class="cw-section-title">
        <SvgIcon name="clock" :size="16" />
        <span>最近经历</span>
      </h4>

      <div v-if="recentList.length > 0" class="cw-timeline">
        <div v-for="(rec, id) in recentList" :key="id" class="cw-timeline-node">
          <div class="cw-timeline-dot"></div>
          <div class="cw-timeline-body">
            <span class="cw-timeline-time">{{ rec.日期说明 || '近期' }}</span>
            <p class="cw-timeline-text">{{ formatExperienceText(rec) }}</p>
          </div>
        </div>
      </div>
      <div v-else class="cw-empty-compact">
        <SvgIcon name="clock" :size="15" class="cw-empty-icon" />
        <span>暂无最近几轮的特殊经历记录</span>
      </div>
    </div>

    <!-- 生活摘要 (跨日/周汇总) -->
    <div class="cw-life-card">
      <h4 class="cw-section-title">
        <SvgIcon name="calendar" :size="16" />
        <span>生活摘要与阶段概述</span>
      </h4>

      <div v-if="hasSummaries" class="cw-summary-list">
        <div
          v-for="(sum, id) in { ...char?.经历?.阶段概述, ...char?.经历?.生活摘要 }"
          :key="id"
          class="cw-summary-card"
        >
          <div class="cw-summary-period">{{ sum.起始日期说明 || '起' }} ~ {{ sum.结束日期说明 || '止' }}</div>
          <p class="cw-summary-content">{{ formatExperienceText(sum) }}</p>
        </div>
      </div>
      <div v-else class="cw-empty-compact">
        <SvgIcon name="calendar" :size="15" class="cw-empty-icon" />
        <span>暂无阶段生活摘要</span>
      </div>
    </div>

    <!-- 人生重要经历 (生平大事件) -->
    <div class="cw-life-card">
      <h4 class="cw-section-title">
        <SvgIcon name="bookmark" :size="16" />
        <span>过往重要人生经历</span>
      </h4>

      <div v-if="hasLifeHistory" class="cw-timeline cw-timeline-milestones">
        <div v-for="(life, id) in char?.经历?.人生经历" :key="id" class="cw-timeline-node">
          <div class="cw-timeline-dot cw-dot-milestone"></div>
          <div class="cw-timeline-body">
            <span class="cw-timeline-time">{{ life.日期说明 || '昔日' }}</span>
            <p class="cw-timeline-text">{{ formatExperienceText(life) }}</p>
          </div>
        </div>
      </div>
      <div v-else class="cw-empty-compact">
        <SvgIcon name="bookmark" :size="15" class="cw-empty-icon" />
        <span>过往大事件尚未收录</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import SvgIcon from '../../icons/SvgIcon.vue';

const props = defineProps<{
  char: any;
}>();

function formatExperienceText(item: any): string {
  if (!item) return '暂无详细记载';
  if (typeof item === 'string') return item;
  if (typeof item === 'object') {
    const text = item.经历 || item.内容 || item.描述 || item.说明;
    if (typeof text === 'string' && text.trim()) return text;
    return '暂无详细记载';
  }
  return String(item);
}

const recentList = computed(() => {
  const rec = props.char?.经历?.最近经历;
  if (!rec || typeof rec !== 'object') return [];
  return Object.entries(rec).map(([id, val]: [string, any]) => ({
    id,
    ...(typeof val === 'object' ? val : { 经历: val }),
  }));
});

const hasSummaries = computed(() => {
  const s = props.char?.经历?.生活摘要;
  return Object.keys(s ?? {}).length > 0 || Object.keys(props.char?.经历?.阶段概述 ?? {}).length > 0;
});

const hasLifeHistory = computed(() => {
  const l = props.char?.经历?.人生经历;
  return l && Object.keys(l).length > 0;
});
</script>

<style scoped lang="scss">
.cw-char-tab-life {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cw-life-card {
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

.cw-timeline {
  display: flex;
  flex-direction: column;
  position: relative;
  padding-left: 20px;

  &::before {
    content: '';
    position: absolute;
    top: 4px;
    bottom: 4px;
    left: 6px;
    width: 2px;
    background: var(--cw-border);
  }

  .cw-timeline-node {
    position: relative;
    padding-bottom: 16px;

    &:last-child {
      padding-bottom: 0;
    }

    .cw-timeline-dot {
      position: absolute;
      left: -20px;
      top: 4px;
      width: 14px;
      height: 14px;
      border-radius: var(--cw-radius-full);
      background: var(--cw-accent);
      border: 3px solid var(--cw-bg-surface);
      box-shadow: 0 0 0 1px var(--cw-accent-border);

      &.cw-dot-milestone {
        background: var(--cw-info);
        box-shadow: 0 0 0 1px rgba(61, 122, 184, 0.4);
      }
    }

    .cw-timeline-body {
      display: flex;
      flex-direction: column;
      gap: 4px;

      .cw-timeline-time {
        font-family: monospace, sans-serif;
        font-size: 12px;
        font-weight: 600;
        color: var(--cw-accent);
      }

      .cw-timeline-text {
        margin: 0;
        font-size: 13px;
        color: var(--cw-text-primary);
        line-height: 1.6;
      }
    }
  }
}

.cw-summary-list {
  display: flex;
  flex-direction: column;
  gap: 10px;

  .cw-summary-card {
    padding: 12px 14px;
    border-radius: var(--cw-radius-sm);
    background: var(--cw-bg-card-subtle);
    border: 1px solid var(--cw-border);
    display: flex;
    flex-direction: column;
    gap: 4px;

    .cw-summary-period {
      font-size: 12px;
      font-weight: 600;
      color: var(--cw-text-secondary);
    }
    .cw-summary-content {
      margin: 0;
      font-size: 13px;
      color: var(--cw-text-primary);
      line-height: 1.5;
    }
  }
}

.cw-empty-sub {
  font-size: 13px;
  color: var(--cw-text-muted);
  text-align: center;
  padding: 14px 0;
}

.cw-empty-compact {
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: var(--cw-radius-sm);
  background: var(--cw-bg-card-subtle);
  border: 1px dashed var(--cw-border);
  color: var(--cw-text-muted);
  font-size: 12px;

  .cw-empty-icon {
    opacity: 0.5;
    flex-shrink: 0;
  }
}
</style>
