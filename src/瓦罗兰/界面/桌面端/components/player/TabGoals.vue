<template>
  <div class="cw-tab-pane cw-player-goals-pane">
    <!-- 目标板块 -->
    <div class="cw-goals-section">
      <h4 class="cw-section-title">
        <SvgIcon name="target" :size="16" />
        <span>生活与心愿目标</span>
      </h4>

      <div v-if="hasGoals" class="cw-goals-list">
        <div v-for="(goal, id) in player?.生活?.目标" :key="id" class="cw-goal-card">
          <div class="cw-goal-header">
            <span class="cw-goal-title">{{ goal.内容 ?? '未知' }}</span>
          </div>
          <div class="cw-goal-meta">
            <span>当前进展：{{ goal.进展 ?? '未知' }}</span>
          </div>
        </div>
      </div>
      <div v-else class="cw-empty-compact">
        <SvgIcon name="target" :size="16" class="cw-empty-icon" />
        <span>当前暂无特别登记的目标</span>
      </div>
    </div>

    <!-- 约定板块 -->
    <div class="cw-covenants-section">
      <h4 class="cw-section-title">
        <SvgIcon name="calendar" :size="16" />
        <span>约定与邀约</span>
      </h4>

      <button class="cw-btn cw-btn-ghost" @click="history = !history">
        {{ history ? '查看进行中' : '查看已完成 / 已取消' }}
      </button>
      <div v-if="visibleCovenants.length" class="cw-covenants-list">
        <div v-for="cov in visibleCovenants" :key="cov.id" class="cw-covenant-card">
          <div class="cw-cov-header">
            <span class="cw-cov-title">{{ cov.内容 ?? '未知' }}</span>
            <span class="cw-badge" :class="covStatusClass(cov.状态)">
              {{ cov.状态 ?? '未知' }}
            </span>
          </div>
          <div class="cw-cov-meta">
            <span
              >参与者：{{
                Object.entries(cov.参与者 ?? {})
                  .map(
                    ([id, v]: any) =>
                      (state?.角色?.[id]?.姓名 ?? v.称呼 ?? (id === player.id ? player.姓名 : '未知')) +
                      '：' +
                      (v.响应 ?? '未知'),
                  )
                  .join('、')
              }}</span
            >
            <span>时间：{{ formatTime(cov.时间) }} {{ cov.时间说明 ?? '' }}</span>
            <span>地点：{{ place(cov.地点id) }}</span>
          </div>
        </div>
      </div>
      <div v-else class="cw-empty-compact">
        <SvgIcon name="calendar" :size="16" class="cw-empty-icon" />
        <span>{{ history ? '暂无已完成或已取消的约定。' : '暂无进行中的约定。' }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useWorldState, locationName } from '../../utils/context';
const state = useWorldState();
const history = ref(false);
const place = (id: any) => locationName(state?.value, id);
import SvgIcon from '../icons/SvgIcon.vue';

const props = defineProps<{
  player: any;
  worldCovenants?: Record<string, any>;
}>();

const hasGoals = computed(() => {
  return props.player?.生活?.目标 && Object.keys(props.player.生活.目标).length > 0;
});

const covenantsList = computed(() => {
  const ids = new Set<string>(props.player?.生活?.约定 ?? []);
  for (const [id, c] of Object.entries(props.worldCovenants ?? {}) as any[])
    if (c.参与者?.[props.player.id]) ids.add(id);
  return [...ids].map(id => ({ id, ...props.worldCovenants?.[id] }));
});
const visibleCovenants = computed(() =>
  covenantsList.value.filter(c => history.value === ['完成', '取消'].includes(c.状态)),
);
function formatTime(t: any) {
  if (!t) return '未知';
  if (typeof t === 'string') return t;
  if (typeof t.年 === 'number') {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${t.年}-${pad(t.月)}-${pad(t.日)} ${pad(t.时)}:${pad(t.分)}`;
  }
  return String(t);
}

function covStatusClass(status?: string) {
  switch (status) {
    case '完成':
    case '已履约':
      return 'cw-badge-success';
    case '取消':
      return 'cw-badge-danger';
    case '待确认':
      return 'cw-badge-warning';
    default:
      return 'cw-badge-accent';
  }
}
</script>

<style scoped lang="scss">
.cw-player-goals-pane {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cw-goals-section,
.cw-covenants-section {
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

.cw-goals-list,
.cw-covenants-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cw-goal-card,
.cw-covenant-card {
  padding: 12px 14px;
  border-radius: var(--cw-radius-sm);
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);
  display: flex;
  flex-direction: column;
  gap: 6px;

  .cw-goal-header,
  .cw-cov-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 6px 10px;

    .cw-goal-title,
    .cw-cov-title {
      font-weight: 600;
      font-size: 14px;
      color: var(--cw-text-primary);
      min-width: 0;
      word-break: break-word;
    }
  }

  .cw-goal-meta,
  .cw-cov-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    font-size: 12px;
    color: var(--cw-text-muted);
  }

  .cw-goal-notes,
  .cw-cov-desc {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--cw-text-secondary);
  }
}

.cw-empty-sub {
  font-size: 13px;
  color: var(--cw-text-muted);
  text-align: center;
  padding: 16px 0;
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
  margin-top: 8px;

  .cw-empty-icon {
    opacity: 0.5;
    flex-shrink: 0;
  }
}
</style>
