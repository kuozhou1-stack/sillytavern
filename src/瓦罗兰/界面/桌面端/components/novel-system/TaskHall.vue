<template>
  <div class="cw-task-hall-panel">
    <!-- 顶部状态栏与筛选控制器 -->
    <div class="cw-hall-top-bar">
      <!-- 进行中名额与统计指标 -->
      <div class="cw-hall-stats-bar">
        <div class="cw-stats-left-group">
          <div class="cw-stat-slot">
            <span class="cw-slot-label">进行中任务名额:</span>
            <div class="cw-slot-tracker">
              <span
                v-for="index in 5"
                :key="index"
                class="cw-slot-dot"
                :class="{ filled: index <= inProgressCount }"
                :title="index <= inProgressCount ? '已有进行中任务' : '空闲槽位'"
              ></span>
            </div>
            <strong class="cw-slot-number" :class="{ 'cw-slot-full': inProgressCount >= 5 }">
              {{ inProgressCount }} / 5
            </strong>
            <span v-if="inProgressCount >= 5" class="cw-slot-warn-tag">已满额</span>
          </div>

          <div class="cw-stat-rewards">
            <span class="cw-rewards-label">可领取任务:</span>
            <span class="cw-claimable-badge" :class="{ highlight: claimableCount > 0 }">
              {{ claimableCount }} 项待领
            </span>
          </div>
        </div>

        <div class="cw-stats-right-action">
          <button
          type="button"
          class="cw-btn cw-btn-secondary cw-btn-sm cw-hall-refresh-btn"
          data-action="refresh-tasks"
          :disabled="props.disabled || props.refreshDisabled"
          title="通过手机与奇遇 API 生成新任务，保留已有任务和进度"
          @click="emit('refresh')"
        >
          <SvgIcon name="refreshCw" :size="14" :class="{ 'cw-spin': props.refreshing }" />
          <span>{{ props.refreshing ? '生成中…' : '刷新任务' }}</span>
        </button>
        </div>
      </div>

      <!-- 双重筛选：状态 + 类型 -->
      <div class="cw-filters-container">
        <!-- 状态筛选 -->
        <div class="cw-filter-group">
          <span class="cw-group-label">状态:</span>
          <div class="cw-filter-chips">
            <button
              v-for="opt in statusFilterOptions"
              :key="opt.value"
              type="button"
              class="cw-chip"
              :class="{ active: currentStatusFilter === opt.value }"
              @click="currentStatusFilter = opt.value"
            >
              <span>{{ opt.label }}</span>
              <span v-if="opt.count !== undefined" class="cw-chip-count">({{ opt.count }})</span>
            </button>
          </div>
        </div>

        <!-- 类型筛选 -->
        <div class="cw-filter-group">
          <span class="cw-group-label">类型:</span>
          <div class="cw-filter-chips">
            <button
              v-for="type in typeFilterOptions"
              :key="type.value"
              type="button"
              class="cw-chip cw-chip-type"
              :class="{ active: currentTypeFilter === type.value }"
              @click="currentTypeFilter = type.value"
            >
              <span>{{ type.label }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 任务卡片流式滚动区 -->
    <div class="cw-tasks-scroll-area">
      <!-- 空态展示 -->
      <div v-if="filteredTasks.length === 0" class="cw-tasks-empty">
        <SvgIcon name="target" :size="40" class="cw-empty-icon" />
        <div class="cw-empty-title">当前筛选下暂无任务</div>
        <div class="cw-empty-desc">
          {{
            currentStatusFilter === 'claimable'
              ? '暂无可领奖任务。接取任务并在日常行动中达成目标后即可领奖。'
              : '切换其他分类，或继续进行剧情以探索更多都市生活目标。'
          }}
        </div>
      </div>

      <!-- 任务卡片列表 -->
      <div v-else class="cw-task-card-list">
        <article
          v-for="item in filteredTasks"
          :key="item.id"
          class="cw-task-card"
          :class="[
            `cw-task-${item.status}`,
            {
              'cw-task-claimable': item.status === 'claimable',
              'cw-task-rare': item.task.难度 === '稀有',
            },
          ]"
        >
          <!-- 头部：标题、类型/难度 Badge、奖励 -->
          <header class="cw-card-header">
            <div class="cw-title-group">
              <span class="cw-type-badge" :class="getTypeClass(item.task.类型)">
                {{ item.task.类型 }}
              </span>
              <span class="cw-diff-badge" :class="getDifficultyClass(item.task.难度)" tabindex="0" :data-cw-tooltip="taskTierHints[item.task.难度]" data-cw-tooltip-touch>
                {{ item.task.难度 }}
              </span>
              <h4 class="cw-task-title">{{ item.task.名称 }}</h4>
            </div>

            <div class="cw-reward-badge" title="完成并达成有效证据后可领取的蓝色精粹">
              <SvgIcon name="coins" :size="15" />
              <span class="cw-reward-amount">+{{ getReward(item.task) }}</span>
              <span class="cw-reward-unit">蓝色精粹</span>
            </div>
          </header>

          <!-- 目标正文：长文本独立段落，保留换行，支持展开 -->
          <div class="cw-card-body">
            <div class="cw-goal-block">
              <span class="cw-field-label">任务目标：</span>
              <div class="cw-goal-text" :class="{ expanded: expandedGoals[item.id] }">
                {{ item.task.目标 }}
              </div>
              <button
                v-if="isLongText(item.task.目标)"
                type="button"
                class="cw-expand-btn"
                @click="toggleGoalExpand(item.id)"
              >
                <span>{{ expandedGoals[item.id] ? '收起详情' : '展开全文' }}</span>
                <SvgIcon :name="expandedGoals[item.id] ? 'chevronUp' : 'chevronDown'" :size="12" />
              </button>
            </div>

            <!-- 进展说明 (如有) -->
            <div v-if="item.task.进展说明" class="cw-progress-note-block">
              <div class="cw-note-header">
                <SvgIcon name="bookmark" :size="13" />
                <span>最新剧情进展记录</span>
              </div>
              <div class="cw-note-content">
                {{ item.task.进展说明 }}
              </div>
            </div>

            <!-- 进度追踪条 (进行中、待领奖、已完成) -->
            <div v-if="item.status !== 'unaccepted'" class="cw-progress-tracking-row">
              <div class="cw-progress-bar-wrapper">
                <div class="cw-progress-bar-track">
                  <div
                    class="cw-progress-bar-fill"
                    :style="{ width: `${item.task.进度}%` }"
                    :class="{ 'fill-complete': item.task.进度 >= 100 }"
                  ></div>
                </div>
                <span class="cw-progress-percent">{{ item.task.进度 }}%</span>
              </div>

              <!-- 有效期限与过期提示 -->
              <div class="cw-validity-info">
                <template v-if="item.task.有效日">
                  <SvgIcon name="clock" :size="13" />
                  <span :class="{ 'cw-text-expired': isExpired(item.task) }">
                    {{ isExpired(item.task) ? `已过期 (有效至 ${item.task.有效日})` : `有效日: ${item.task.有效日}` }}
                  </span>
                </template>
                <template v-else>
                  <span class="cw-validity-permanent">长期有效 · 无单日限制</span>
                </template>
              </div>
            </div>

            <!-- 100% 进度但不可领奖的原因说明 (关键业务约束告知) -->
            <div v-if="item.status === 'in_progress' && item.task.进度 >= 100 && item.claimIssue" class="cw-issue-alert">
              <SvgIcon name="alertCircle" :size="14" />
              <span>尚未满足领奖证据：{{ item.claimIssue }}</span>
            </div>
          </div>

          <!-- 底部操作区 -->
          <footer
            class="cw-card-footer"
            :class="{ 'is-confirming-abandon': confirmAbandonId === item.id }"
          >
            <div class="cw-footer-main-row">
              <div class="cw-status-indicator">
                <span class="cw-status-tag" :class="`cw-tag-${item.status}`">
                  {{ getStatusLabel(item.status) }}
                </span>
              </div>

              <div class="cw-action-buttons">
                <!-- A. 可接取任务 -->
                <template v-if="item.status === 'unaccepted'">
                  <button
                    type="button"
                    class="cw-btn cw-btn-primary cw-btn-sm"
                    :disabled="props.disabled || inProgressCount >= 5 || isExpired(item.task) || pendingId === item.id"
                    @click="handleAccept(item.id)"
                  >
                    <SvgIcon v-if="pendingId === item.id" name="refreshCw" :size="13" class="cw-spin" />
                    <SvgIcon v-else name="plus" :size="13" />
                    <span>{{ getAcceptButtonText(item.task) }}</span>
                  </button>
                </template>

                <!-- B. 进行中任务 (包含可领奖与未达标) -->
                <template v-else-if="item.status === 'in_progress' || item.status === 'claimable'">
                  <button
                    v-if="confirmAbandonId !== item.id"
                    type="button"
                    class="cw-btn cw-btn-ghost cw-btn-sm cw-abandon-trigger-btn"
                    :disabled="props.disabled || pendingId === item.id"
                    title="放弃本任务以释放进行中名额"
                    @click="confirmAbandonId = item.id"
                  >
                    <span>放弃任务</span>
                  </button>

                  <!-- 领取奖励按钮 (当且仅当满足领奖条件) -->
                  <button
                    v-if="item.status === 'claimable'"
                    type="button"
                    class="cw-btn cw-btn-primary cw-btn-sm cw-claim-btn"
                    :disabled="props.disabled || pendingId === item.id"
                    @click="handleClaim(item.id)"
                  >
                    <SvgIcon v-if="pendingId === item.id" name="refreshCw" :size="13" class="cw-spin" />
                    <SvgIcon v-else name="sparkles" :size="14" />
                    <span>领取奖励 (+{{ getReward(item.task) }} 蓝色精粹)</span>
                  </button>

                  <!-- 未达成时的只读状态按钮 -->
                  <button
                    v-else
                    type="button"
                    class="cw-btn cw-btn-ghost cw-btn-sm cw-btn-pending-goal"
                    disabled
                    :title="item.claimIssue || '尚未达成任务目标'"
                  >
                    <span>进行中 ({{ item.task.进度 }}%)</span>
                  </button>
                </template>

                <!-- C. 已领取状态 -->
                <template v-else-if="item.status === 'claimed'">
                  <div class="cw-done-badge">
                    <SvgIcon name="checkCircle" :size="14" />
                    <span>已领取奖励</span>
                  </div>
                </template>

                <!-- D. 已放弃状态 -->
                <template v-else-if="item.status === 'abandoned'">
                  <div class="cw-abandoned-badge">
                    <SvgIcon name="close" :size="13" />
                    <span>已放弃</span>
                  </div>
                </template>
              </div>
            </div>

            <!-- 放弃任务二次确认独立操作条 -->
            <div
              v-if="(item.status === 'in_progress' || item.status === 'claimable') && confirmAbandonId === item.id"
              class="cw-abandon-confirm-box"
            >
              <span class="cw-confirm-text">放弃后不可重新接取，确定？</span>
              <div class="cw-confirm-actions">
                <button
                  type="button"
                  class="cw-btn cw-btn-danger cw-btn-xs"
                  :disabled="props.disabled || pendingId === item.id"
                  @click="handleAbandon(item.id)"
                >
                  确认放弃
                </button>
                <button
                  type="button"
                  class="cw-btn cw-btn-ghost cw-btn-xs"
                  :disabled="props.disabled"
                  @click="confirmAbandonId = null"
                >
                  取消
                </button>
              </div>
            </div>
          </footer>
        </article>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { State } from '../../../../运行/core';
import { questReward, questIssue, storyDay } from '../../../../运行/novel-system';
import SvgIcon from '../icons/SvgIcon.vue';

type Quest = State['奇遇系统']['任务'][string];

const props = defineProps<{
  state: State;
  novelState: State['奇遇系统'];
  disabled?: boolean;
  pendingId?: string | null;
  refreshDisabled?: boolean;
  refreshing?: boolean;
}>();

const emit = defineEmits<{
  (e: 'refresh'): void;
  (e: 'accept', taskId: string): void;
  (e: 'abandon', taskId: string): void;
  (e: 'claim', taskId: string): void;
}>();

// 筛选状态
const currentStatusFilter = ref<string>('all');
const currentTypeFilter = ref<string>('all');
const confirmAbandonId = ref<string | null>(null);
const expandedGoals = ref<Record<string, boolean>>({});

// 当前故事日期
const currentDay = computed(() => storyDay(props.state));

// 单个任务视图模型
interface TaskItemVM {
  id: string;
  task: Quest;
  status: 'unaccepted' | 'in_progress' | 'claimable' | 'claimed' | 'abandoned';
  claimIssue: string;
}

// 全部解析的任务列表
const allTasks = computed<TaskItemVM[]>(() => {
  const tasks = props.novelState.任务 || {};
  const records = props.novelState._任务记录 || {};

  return Object.entries(tasks).map(([id, task]) => {
    const record = records[id];
    let status: TaskItemVM['status'] = 'unaccepted';
    let claimIssue = '';

    if (!record) {
      status = 'unaccepted';
    } else if (record.状态 === '已领取') {
      status = 'claimed';
    } else if (record.状态 === '已放弃') {
      status = 'abandoned';
    } else if (record.状态 === '进行中') {
      claimIssue = questIssue(props.state, id);
      status = claimIssue === '' ? 'claimable' : 'in_progress';
    }

    return {
      id,
      task,
      status,
      claimIssue,
    };
  });
});

// 进行中任务数量 (上限 5)
const inProgressCount = computed(() => {
  const records = props.novelState._任务记录 || {};
  return Object.values(records).filter(r => r.状态 === '进行中').length;
});

// 可领取任务数量
const claimableCount = computed(() => allTasks.value.filter(t => t.status === 'claimable').length);

// 状态筛选选项与计数
const statusFilterOptions = computed(() => [
  { label: '全部', value: 'all', count: allTasks.value.length },
  { label: '待接取', value: 'unaccepted', count: allTasks.value.filter(t => t.status === 'unaccepted').length },
  {
    label: '进行中',
    value: 'active',
    count: allTasks.value.filter(t => t.status === 'in_progress' || t.status === 'claimable').length,
  },
  { label: '可领奖', value: 'claimable', count: claimableCount.value },
  { label: '已完成', value: 'claimed', count: allTasks.value.filter(t => t.status === 'claimed').length },
  { label: '已放弃', value: 'abandoned', count: allTasks.value.filter(t => t.status === 'abandoned').length },
]);

// 类型筛选选项
const typeFilterOptions = [
  { label: '全部类型', value: 'all' },
  { label: '日常', value: '日常' },
  { label: '探索', value: '探索' },
  { label: '社交', value: '社交' },
  { label: '成长', value: '成长' },
  { label: '奇遇', value: '奇遇' },
];

// 经过滤后的任务
const filteredTasks = computed(() => {
  return allTasks.value.filter(item => {
    // 状态过滤
    if (currentStatusFilter.value === 'unaccepted' && item.status !== 'unaccepted') return false;
    if (currentStatusFilter.value === 'active' && item.status !== 'in_progress' && item.status !== 'claimable')
      return false;
    if (currentStatusFilter.value === 'claimable' && item.status !== 'claimable') return false;
    if (currentStatusFilter.value === 'claimed' && item.status !== 'claimed') return false;
    if (currentStatusFilter.value === 'abandoned' && item.status !== 'abandoned') return false;

    // 类型过滤
    if (currentTypeFilter.value !== 'all' && item.task.类型 !== currentTypeFilter.value) return false;

    return true;
  });
});

function isExpired(task: Quest): boolean {
  return !!(task.有效日 && currentDay.value && task.有效日 !== currentDay.value);
}

function getReward(task: Quest): number {
  return questReward(task);
}

function isLongText(text: string): boolean {
  return text.length > 70;
}

function toggleGoalExpand(id: string) {
  expandedGoals.value[id] = !expandedGoals.value[id];
}

function getTypeClass(type: string): string {
  switch (type) {
    case '日常':
      return 'cw-tag-daily';
    case '探索':
      return 'cw-tag-explore';
    case '社交':
      return 'cw-tag-social';
    case '成长':
      return 'cw-tag-growth';
    case '奇遇':
      return 'cw-tag-adventure';
    default:
      return 'cw-tag-default';
  }
}

const taskTierHints: Record<string, string> = {
  基础: '当前条件下，一个明确行动可完成的常规目标。',
  进阶: '需要多个相关步骤、准备协调或实际练习。',
  稀有: '依托既有的少见机会、独特线索或重要个人目标；不等于更危险，也不强制战斗。',
};

function getDifficultyClass(diff: string): string {
  switch (diff) {
    case '稀有':
      return 'cw-diff-rare';
    case '进阶':
      return 'cw-diff-advanced';
    default:
      return 'cw-diff-basic';
  }
}

function getStatusLabel(status: TaskItemVM['status']): string {
  switch (status) {
    case 'unaccepted':
      return '未接取';
    case 'in_progress':
      return '进行中';
    case 'claimable':
      return '待领奖';
    case 'claimed':
      return '已完成';
    case 'abandoned':
      return '已放弃';
  }
}

function getAcceptButtonText(task: Quest): string {
  if (isExpired(task)) return '已过期';
  if (inProgressCount.value >= 5) return '名额已满';
  return '接取任务';
}

function handleAccept(id: string) {
  if (props.disabled || inProgressCount.value >= 5 || props.pendingId) return;
  emit('accept', id);
}

function handleAbandon(id: string) {
  if (props.disabled || props.pendingId) return;
  confirmAbandonId.value = null;
  emit('abandon', id);
}

function handleClaim(id: string) {
  if (props.disabled || props.pendingId) return;
  emit('claim', id);
}
</script>

<style scoped>
.cw-task-hall-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  color: var(--cw-text-primary);
}

/* 顶部状态与筛选 */
.cw-hall-top-bar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius, 10px);
  padding: 12px 16px;
}

.cw-hall-stats-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--cw-border);
  padding-bottom: 10px;
  gap: 12px;
  flex-wrap: wrap;
}

.cw-stats-left-group {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.cw-stats-right-action {
  flex-shrink: 0;
}

.cw-hall-refresh-btn {
  height: 32px;
  min-width: 96px;
  justify-content: center;
  padding: 0 12px;
  border-radius: var(--cw-radius-sm);
  border: 1px solid var(--cw-border);
  background: var(--cw-bg-card);
  color: var(--cw-text-primary);
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  box-shadow: var(--cw-shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.05));
  transition: all 0.15s ease;

  &:hover:not(:disabled) {
    background: var(--cw-bg-card-hover);
    border-color: var(--cw-accent);
    color: var(--cw-accent);
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.08);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    box-shadow: none;
  }
}

.cw-stat-slot {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--cw-text-secondary);
}

.cw-slot-label {
  font-weight: 500;
}

.cw-slot-tracker {
  display: flex;
  align-items: center;
  gap: 4px;
}

.cw-slot-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--cw-border);
  transition: all 0.2s ease;
}

.cw-slot-dot.filled {
  background: var(--cw-accent);
  box-shadow: 0 0 5px var(--cw-accent);
}

.cw-slot-number {
  font-family: var(--cw-font-number, monospace);
  font-size: 13px;
  color: var(--cw-text-primary);
}

.cw-slot-full {
  color: var(--cw-danger);
}

.cw-slot-warn-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--cw-danger-bg);
  color: var(--cw-danger);
  font-weight: 600;
}

.cw-stat-rewards {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.cw-rewards-label {
  color: var(--cw-text-secondary);
}

.cw-claimable-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 12px;
  background: var(--cw-bg-card);
  border: 1px solid var(--cw-border);
  color: var(--cw-text-secondary);
}

.cw-claimable-badge.highlight {
  background: var(--cw-success);
  color: var(--cw-text-inverse, #ffffff);
  border-color: var(--cw-success);
  font-weight: 600;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
}

/* 筛选组 */
.cw-filters-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cw-filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.cw-group-label {
  color: var(--cw-text-muted);
  min-width: 36px;
}

.cw-filter-chips {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.cw-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: var(--cw-radius-sm, 6px);
  border: 1px solid var(--cw-border);
  background: var(--cw-bg-card);
  color: var(--cw-text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.cw-chip:hover {
  background: var(--cw-bg-card-hover);
  color: var(--cw-text-primary);
  border-color: var(--cw-border-hover);
}

.cw-chip.active {
  background: var(--cw-accent);
  border-color: var(--cw-accent);
  color: var(--cw-text-inverse, #ffffff);
}

.cw-chip-count {
  font-size: 11px;
  opacity: 0.85;
}

/* 滚动列表 */
.cw-tasks-scroll-area {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
}

.cw-task-card-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cw-task-card {
  background: var(--cw-bg-card);
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius, 10px);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: all 0.2s ease;
  box-shadow: var(--cw-shadow-sm);
}

.cw-task-card:hover {
  border-color: var(--cw-border-hover);
  box-shadow: var(--cw-shadow);
}

/* 待领奖卡片高亮流光 */
.cw-task-claimable {
  border-color: var(--cw-success);
  background: linear-gradient(180deg, var(--cw-success-bg) 0%, var(--cw-bg-card) 100%);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.cw-task-rare {
  border-color: var(--cw-warning);
}

/* 头部 */
.cw-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.cw-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  flex: 1 1 180px;
  min-width: 0;
}

.cw-task-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--cw-text-primary);
  line-height: 1.4;
}

.cw-type-badge,
.cw-diff-badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 500;
  border: 1px solid transparent;
  white-space: nowrap;
  flex-shrink: 0;
}

.cw-tag-daily {
  background: var(--cw-info-bg);
  color: var(--cw-info);
  border-color: var(--cw-info-bg);
}

.cw-tag-explore {
  background: rgba(13, 148, 136, 0.12);
  color: #0d9488;
  border-color: rgba(13, 148, 136, 0.25);
}

.cw-tag-social {
  background: rgba(147, 51, 234, 0.12);
  color: #9333ea;
  border-color: rgba(147, 51, 234, 0.25);
}

.cw-tag-growth {
  background: var(--cw-success-bg);
  color: var(--cw-success);
  border-color: var(--cw-success-bg);
}

.cw-tag-adventure {
  background: var(--cw-warning-bg);
  color: var(--cw-warning);
  border-color: var(--cw-warning);
}

.cw-diff-basic {
  background: var(--cw-bg-card-subtle);
  color: var(--cw-text-secondary);
  border-color: var(--cw-border);
}

.cw-diff-advanced {
  background: var(--cw-accent-bg);
  color: var(--cw-accent);
  border-color: var(--cw-accent-border);
}

.cw-diff-rare {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #ffffff;
  font-weight: 600;
}

.cw-reward-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--cw-warning-bg);
  border: 1px solid var(--cw-warning);
  padding: 3px 8px;
  border-radius: var(--cw-radius-sm, 6px);
  color: var(--cw-warning);
  flex-shrink: 0;
  white-space: nowrap;
  margin-left: auto;
}

.cw-reward-amount {
  font-size: 14px;
  font-weight: 700;
  font-family: var(--cw-font-number, monospace);
}

.cw-reward-unit {
  font-size: 11px;
}

/* 身体与目标 */
.cw-card-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cw-goal-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cw-field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--cw-text-secondary);
}

.cw-goal-text {
  font-size: 13px;
  line-height: 1.6;
  color: var(--cw-text-primary);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 4.8em;
  overflow: hidden;
  position: relative;
  transition: max-height 0.2s ease;
}

.cw-goal-text.expanded {
  max-height: none;
}

.cw-expand-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: transparent;
  border: none;
  color: var(--cw-accent);
  font-size: 11.5px;
  cursor: pointer;
  align-self: flex-start;
  padding: 2px 0;
}

/* 进展记录框 */
.cw-progress-note-block {
  background: var(--cw-bg-card-subtle);
  border-left: 3px solid var(--cw-accent);
  padding: 8px 12px;
  border-radius: 0 var(--cw-radius-sm, 6px) var(--cw-radius-sm, 6px) 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cw-note-header {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--cw-accent);
}

.cw-note-content {
  font-size: 12.5px;
  color: var(--cw-text-secondary);
  line-height: 1.5;
  white-space: pre-wrap;
}

/* 进度追踪条 */
.cw-progress-tracking-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px 12px;
  background: var(--cw-bg-surface);
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius-sm, 6px);
  padding: 6px 10px;
}

.cw-progress-bar-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 140px;
  min-width: 0;
}

.cw-progress-bar-track {
  flex: 1;
  height: 7px;
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);
  border-radius: 4px;
  overflow: hidden;
}

.cw-progress-bar-fill {
  height: 100%;
  background: var(--cw-accent);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.cw-progress-bar-fill.fill-complete {
  background: var(--cw-success);
}

.cw-progress-percent {
  font-size: 12px;
  font-family: var(--cw-font-number, monospace);
  font-weight: 600;
  color: var(--cw-text-primary);
  min-width: 35px;
  text-align: right;
}

.cw-validity-info {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  color: var(--cw-text-muted);
  flex-shrink: 0;
}

.cw-text-expired {
  color: var(--cw-danger);
  font-weight: 600;
}

.cw-validity-permanent {
  color: var(--cw-text-muted);
}

/* 领奖未达标提醒 */
.cw-issue-alert {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--cw-warning-bg);
  border: 1px solid var(--cw-warning);
  border-radius: var(--cw-radius-sm, 6px);
  padding: 6px 10px;
  font-size: 11.5px;
  color: var(--cw-warning);
}

/* 底部操作区 */
.cw-card-footer {
  display: flex;
  flex-direction: column;
  border-top: 1px dashed var(--cw-border);
  padding-top: 10px;
  gap: 8px;
}

.cw-footer-main-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 10px;
  width: 100%;
}

.cw-status-indicator {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.cw-status-tag {
  font-size: 11.5px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
  white-space: nowrap;
}

.cw-tag-unaccepted {
  background: var(--cw-bg-card-subtle);
  color: var(--cw-text-muted);
}

.cw-tag-in_progress {
  background: var(--cw-accent-bg);
  color: var(--cw-accent);
}

.cw-tag-claimable {
  background: var(--cw-success-bg);
  color: var(--cw-success);
  font-weight: 600;
}

.cw-tag-claimed {
  background: var(--cw-bg-card-subtle);
  color: var(--cw-text-muted);
}

.cw-tag-abandoned {
  background: var(--cw-danger-bg);
  color: var(--cw-danger);
}

.cw-action-buttons {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-left: auto;

  .cw-btn {
    white-space: nowrap;
    flex-shrink: 0;
  }
}

.cw-claim-btn {
  background: linear-gradient(135deg, #10b981, #059669);
  border-color: #059669;
  color: #ffffff;
  box-shadow: 0 2px 6px rgba(16, 185, 129, 0.25);
  cursor: pointer;
}

.cw-claim-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #059669, #047857);
}

.cw-abandon-confirm-box {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
  background: var(--cw-danger-bg);
  border: 1px solid rgba(201, 74, 74, 0.25);
  padding: 8px 12px;
  border-radius: var(--cw-radius-sm, 6px);
  box-sizing: border-box;
}

.cw-confirm-text {
  flex: 1 1 160px;
  min-width: 0;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.45;
  color: var(--cw-danger);
}

.cw-confirm-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin-left: auto;

  .cw-btn {
    white-space: nowrap;
    flex-shrink: 0;
    padding: 4px 10px;
    font-size: 12px;
  }
}

.cw-abandon-trigger-btn {
  color: var(--cw-text-muted);
  background: transparent;
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius-sm, 6px);
  cursor: pointer;
}

.cw-abandon-trigger-btn:hover:not(:disabled) {
  color: var(--cw-danger);
  border-color: var(--cw-danger);
}

.cw-btn-pending-goal {
  color: var(--cw-text-muted);
  font-size: 12px;
}

.cw-done-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--cw-success);
  font-weight: 500;
  white-space: nowrap;
}

.cw-abandoned-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--cw-text-muted);
  white-space: nowrap;
}

/* 空态 */
.cw-tasks-empty {
  padding: 48px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--cw-text-muted);
}

.cw-empty-icon {
  opacity: 0.35;
  margin-bottom: 6px;
}

.cw-empty-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--cw-text-secondary);
}

.cw-empty-desc {
  font-size: 12px;
  text-align: center;
  max-width: 360px;
  line-height: 1.5;
}

/* 暗色主题细调 (Dark mode overrides) */
[data-theme='dark'] .cw-tag-explore {
  color: #2dd4bf;
  background: rgba(45, 212, 191, 0.15);
  border-color: rgba(45, 212, 191, 0.3);
}

[data-theme='dark'] .cw-tag-social {
  color: #c084fc;
  background: rgba(192, 132, 252, 0.15);
  border-color: rgba(192, 132, 252, 0.3);
}

[data-theme='dark'] .cw-reward-badge {
  background: rgba(210, 153, 34, 0.18);
  border-color: rgba(210, 153, 34, 0.45);
  color: #f3be43;
}

@media (max-width: 720px) {
  .cw-hall-stats-bar {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
}
</style>
