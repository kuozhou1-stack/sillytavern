<template>
  <div class="cw-modal-backdrop" @click.self="handleClose">
    <div class="cw-modal-box cw-novel-system-modal cw-gameplay-panel" :style="gameplayModalSize">
      <!-- 弹窗顶栏 (激活前与激活后差异化) -->
      <header class="cw-modal-header cw-novel-header">
        <div class="cw-header-brand">
          <div class="cw-brand-icon">
            <SvgIcon name="sparkles" :size="20" />
          </div>
          <div class="cw-brand-text">
            <h3 class="cw-brand-title">都会奇遇 · 漫游与超常系统</h3>
            <span class="cw-brand-sub">日常行动引导 · 灵感反馈与都市奇遇凭证</span>
          </div>
        </div>

        <!-- 激活后状态指标与 Tab 切换 -->
        <div v-if="novelState._启用" class="cw-header-center-tabs">
          <button
            type="button"
            class="cw-nav-tab"
            :class="{ active: currentTab === 'tasks' }"
            @click="currentTab = 'tasks'"
          >
            <SvgIcon name="target" :size="15" />
            <span>任务大厅</span>
            <span v-if="inProgressCount > 0" class="cw-tab-badge">{{ inProgressCount }}/5</span>
          </button>
          <button
            type="button"
            class="cw-nav-tab"
            :class="{ active: currentTab === 'shop' }"
            @click="currentTab = 'shop'"
          >
            <SvgIcon name="backpack" :size="15" />
            <span>系统商店</span>
          </button>
          <button
            type="button"
            class="cw-nav-tab"
            :class="{ active: currentTab === 'ledger' }"
            @click="currentTab = 'ledger'"
          >
            <SvgIcon name="list" :size="15" />
            <span>收支明细</span>
          </button>
        </div>

        <div class="cw-header-right">
          <!-- 激活后的蓝色精粹徽章 -->
          <div v-if="novelState._启用" class="cw-header-balance-badge" title="当前拥有的蓝色精粹余额">
            <SvgIcon name="coins" :size="16" />
            <span class="cw-balance-num">{{ novelState._系统币 ?? 0 }}</span>
            <span class="cw-balance-unit">蓝色精粹</span>
          </div>

          <!-- 关闭按钮 -->
          <button type="button" class="cw-btn cw-btn-ghost cw-close-btn cw-gameplay-close" title="关闭弹窗" @click="handleClose">
            <SvgIcon name="close" :size="16" />
          </button>
        </div>
      </header>

      <!-- 弹窗主视口体 -->
      <main class="cw-modal-body cw-novel-body">
        <!-- A. 系统未开启引导态 -->
        <section v-if="!novelState._启用" class="cw-novel-activation-view">
          <div class="cw-activation-card">
            <div class="cw-activation-illustration">
              <div class="cw-illustration-glow"></div>
              <SvgIcon name="sparkles" :size="48" class="cw-illustration-icon" />
            </div>

            <h2 class="cw-activation-title">唤醒都市奇遇系统</h2>
            <p class="cw-activation-lead">
              在科技与魔法共存的瓦罗兰街头巷尾，日常漫游中悄然泛起的小说系统回响。
              为您提供日常行动灵感指引，完成目标即可收获蓝色精粹，并在专属商店兑换独特的城市体验与超常道具。
            </p>

            <div class="cw-activation-perks-grid">
              <div class="cw-perk-card">
                <div class="cw-perk-icon">
                  <SvgIcon name="coins" :size="20" />
                </div>
                <div class="cw-perk-content">
                  <h4 class="cw-perk-title">初始启动资金</h4>
                  <p class="cw-perk-desc">首次激活即刻获赠 <strong>30 蓝色精粹</strong> 启用礼金，本存档内永久有效。</p>
                </div>
              </div>

              <div class="cw-perk-card">
                <div class="cw-perk-icon">
                  <SvgIcon name="target" :size="20" />
                </div>
                <div class="cw-perk-content">
                  <h4 class="cw-perk-title">随机任务与商店新品</h4>
                  <p class="cw-perk-desc">开启后通过已配置的手机与奇遇 API 自动创作任务和新品，保留三个基础生活目标。</p>
                </div>
              </div>

              <div class="cw-perk-card">
                <div class="cw-perk-icon">
                  <SvgIcon name="shield" :size="20" />
                </div>
                <div class="cw-perk-content">
                  <h4 class="cw-perk-title">瓦洛兰生活</h4>
                  <p class="cw-perk-desc">蓝色精粹独立于金币，不影响日常消费；任务为可选指引，不强加角色走向。</p>
                </div>
              </div>
            </div>

            <!-- 激活按钮与状态反馈 -->
            <div class="cw-activation-actions">
              <button
                type="button"
                class="cw-btn cw-btn-primary cw-activation-btn"
                :disabled="isOperationBlocked"
                @click="handleEnableSystem"
              >
                <SvgIcon v-if="isPending" name="refreshCw" :size="18" class="cw-spin" />
                <SvgIcon v-else name="sparkles" :size="18" />
                <span>{{ isPending ? '正在唤醒奇遇系统...' : '即刻开启奇遇系统 (领取 30 蓝色精粹)' }}</span>
              </button>

              <span v-if="blockedHint" class="cw-blocked-hint">
                <SvgIcon name="alertCircle" :size="13" />
                <span>{{ blockedHint }}</span>
              </span>
            </div>
          </div>
        </section>

        <!-- B. 系统已开启视图：三大 Tab 切换 -->
        <template v-else>
          <div v-if="isRefreshing" class="cw-novel-actions">
            <button v-if="isRefreshing" type="button" class="cw-btn cw-btn-ghost cw-btn-sm" @click="runtime?.stop()">
              停止刷新
            </button>
          </div>
          <QueueStatus scope="novel" compact />
          <div v-if="blockedHint" class="cw-blocked-hint" role="status">
            <SvgIcon name="alertCircle" :size="13" />
            <span>{{ blockedHint }}</span>
          </div>
          <!-- 1. 任务大厅 -->
          <TaskHall
            v-if="currentTab === 'tasks'"
            :state="props.state"
            :novel-state="novelState"
            :disabled="isOperationBlocked"
            :pending-id="pendingTargetId"
            :refresh-disabled="!runtime?.novelRefresh"
            :refreshing="isRefreshing"
            @refresh="handleRefresh('tasks')"
            @accept="id => handleAction({ kind: 'accept', id })"
            @abandon="id => handleAction({ kind: 'abandon', id })"
            @claim="id => handleAction({ kind: 'claim', id })"
          />

          <!-- 2. 系统商店 -->
          <SystemShop
            v-else-if="currentTab === 'shop'"
            :state="props.state"
            :novel-state="novelState"
            :disabled="isOperationBlocked"
            :pending-id="pendingTargetId"
            :refresh-disabled="!runtime?.novelRefresh"
            :refreshing="isRefreshing"
            @refresh="handleRefresh('shop')"
            @buy="id => handleAction({ kind: 'buy', id })"
            @open-inventory="handleGoToInventory"
          />

          <!-- 3. 收支明细 -->
          <CoinLedger v-else-if="currentTab === 'ledger'" :novel-state="novelState" />
        </template>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject } from 'vue';
import type { State } from '../../../../运行/core';
import { uid } from '../../../../运行/core';
import type { NovelAction } from '../../../../运行/novel-system';
import type { NovelRefreshTarget } from '../../../../运行/novel-refresh';
import { RuntimeKey, type Runtime } from '../../../../运行/host';
import { taskPresentation } from '../../utils/task-presentation';
import { gameplayModalSize } from '../../utils/gameplay-modal-size';
import SvgIcon from '../icons/SvgIcon.vue';
import TaskHall from './TaskHall.vue';
import SystemShop from './SystemShop.vue';
import CoinLedger from './CoinLedger.vue';
import QueueStatus from '../shared/QueueStatus.vue';

const props = defineProps<{
  state: State;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'openInventory'): void;
  (e: 'feedback', message: string): void;
}>();

const runtime = inject<Runtime | null>(RuntimeKey, null);

// 激活后的当前 Tab: tasks | shop | ledger
const currentTab = ref<'tasks' | 'shop' | 'ledger'>('tasks');

// 本地 pending 保护，防止连续点击与并发调用
const isPending = ref(false);
const pendingTargetId = ref<string | null>(null);

const novelState = computed(() => props.state.奇遇系统);

const inProgressCount = computed(() => {
  const records = novelState.value._任务记录 || {};
  return Object.values(records).filter(r => r.状态 === '进行中').length;
});

const blockedHint = computed(() => {
  if (!runtime?.novelAction || !runtime.view.data) return '奇遇后台尚未就绪，请检查辅助API脚本是否启用';
  if (!props.state._系统.建档完成 || !props.state.玩家.id) return '请先完成新市民建档';
  if (runtime.view.readOnly) return '当前页面只读，无法提交变动';
  if (runtime?.view.busy) return '当前系统正忙，请稍候再试';
  if (runtime?.view.updating) return '正在同步存档，请稍候';
  if (runtime.view.error || runtime.view.managementPending || runtime.view.recoverable.length ||
      runtime.view.messages.some(message => message.isUpdatePending))
    return '有待恢复操作，请先通过现有恢复入口完成处理';
  if (taskPresentation(runtime.view).locked || runtime.view.queued.length) return '当前操作仍在处理，请稍候';
  return '';
});
const isOperationBlocked = computed(() => isPending.value || !!blockedHint.value);
const isRefreshing = computed(() => !!runtime && taskPresentation(runtime.view).stoppable &&
  (runtime.view.operation === 'novel' || (runtime.view.operation === 'recovery' &&
    runtime.view.recoverable.some(item => item.kind === 'novel'))));

async function handleRefresh(target: NovelRefreshTarget) {
  if (isOperationBlocked.value || !runtime?.novelRefresh) return;
  if (!runtime.settings.phone.apiurl || !runtime.settings.phone.model) {
    emit('feedback', '请先在“设置 → 手机与奇遇 API”填写接口和模型');
    return;
  }
  isPending.value = true;
  pendingTargetId.value = 'refresh:' + target;
  try {
    await runtime.novelRefresh(target);
    emit('feedback', target === 'tasks' ? '新任务已加入，已有任务保持原状' : '商店新品已加入，购买记录和限购保持原状');
  } catch (error: unknown) {
    const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
    emit('feedback', '刷新未完成：' + message);
  } finally {
    isPending.value = false;
    pendingTargetId.value = null;
  }
}

// 执行核心奇遇系统操作接口
async function handleAction(action: Omit<NovelAction, 'operationId'>) {
  if (isOperationBlocked.value || !runtime?.novelAction) return;

  const newlyEnabling = action.kind === 'enable' && !novelState.value._启用;
  const operationId = uid('novel');
  isPending.value = true;
  pendingTargetId.value = action.id ?? 'system';

  try {
    await runtime.novelAction({
      ...action,
      operationId,
    });

    if (action.kind === 'enable') {
      emit('feedback', newlyEnabling ? '奇遇系统已开启，已发放 30 蓝色精粹及生活目标！' : '奇遇系统已开启');
      if (newlyEnabling && novelState.value._启用) {
        if (!runtime.novelRefresh) {
          emit('feedback', '奇遇已开启；请等待后台更新后刷新任务和商店');
        } else if (!runtime.settings.phone.apiurl || !runtime.settings.phone.model) {
          emit('feedback', '奇遇已开启；请在“设置 → 手机与奇遇 API”配置接口，再刷新任务和商店');
        } else {
          pendingTargetId.value = 'refresh:initial';
          try {
            await runtime.novelRefresh('initial');
            emit('feedback', '初始随机任务与商店新品已生成');
          } catch (error: unknown) {
            const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
            emit('feedback', '奇遇已开启，初始内容未生成：' + message);
          }
        }
      }
    } else if (action.kind === 'accept') {
      emit('feedback', '已接取任务，请在日常行动中探索达成！');
    } else if (action.kind === 'abandon') {
      emit('feedback', '任务已放弃，已释放进行中名额。');
    } else if (action.kind === 'claim') {
      emit('feedback', '任务奖励已入账！');
    } else if (action.kind === 'buy') {
      emit('feedback', '兑换成功，物品已存入随身物品栏！');
    }
  } catch (error: unknown) {
    const msg = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
    emit('feedback', '操作失败：' + msg);
  } finally {
    isPending.value = false;
    pendingTargetId.value = null;
  }
}

function handleEnableSystem() {
  return handleAction({ kind: 'enable' });
}

function handleGoToInventory() {
  emit('openInventory');
}

function handleClose() {
  emit('close');
}
</script>

<style scoped>
/* 弹窗居中与边界 */
.cw-novel-system-modal {
  display: flex;
  flex-direction: column;
  background: var(--cw-bg-surface, #ffffff);
  border-radius: var(--cw-radius-lg, 14px);
  box-shadow: var(--cw-shadow-modal);
  overflow: hidden;
  border: 1px solid var(--cw-border);
  color: var(--cw-text-primary);
}

/* 顶部导航与品牌 */
.cw-novel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: var(--cw-bg-panel, #ffffff);
  border-bottom: 1px solid var(--cw-border);
  backdrop-filter: var(--cw-glass-blur, blur(10px));
  gap: 16px;
  flex-shrink: 0;
}

.cw-header-brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cw-brand-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--cw-radius, 10px);
  background: var(--cw-accent-bg, rgba(196, 120, 60, 0.12));
  color: var(--cw-accent, #c4783c);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 1px solid var(--cw-accent-border, rgba(196, 120, 60, 0.25));
}

.cw-brand-text {
  display: flex;
  flex-direction: column;
}

.cw-brand-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--cw-text-primary);
  letter-spacing: -0.2px;
}

.cw-brand-sub {
  font-size: 11.5px;
  color: var(--cw-text-muted);
}

/* 头部居中 Tab */
.cw-header-center-tabs {
  display: flex;
  align-items: center;
  background: var(--cw-bg-card-subtle, #f5f3ec);
  padding: 3px;
  border-radius: var(--cw-radius, 8px);
  border: 1px solid var(--cw-border);
  gap: 4px;
}

.cw-nav-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: var(--cw-radius-sm, 6px);
  border: none;
  background: transparent;
  color: var(--cw-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.cw-nav-tab:hover {
  color: var(--cw-text-primary);
  background: rgba(0, 0, 0, 0.03);
}

.cw-nav-tab.active {
  background: var(--cw-bg-surface, #ffffff);
  color: var(--cw-accent);
  font-weight: 600;
  box-shadow: var(--cw-shadow-sm);
}

.cw-tab-badge {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 10px;
  background: var(--cw-accent-bg);
  color: var(--cw-accent);
  font-family: var(--cw-font-number, monospace);
  font-weight: 600;
}

/* 头部右侧 */
.cw-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cw-novel-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
}

.cw-header-balance-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(2, 132, 199, 0.1);
  border: 1px solid rgba(2, 132, 199, 0.35);
  padding: 4px 10px;
  border-radius: var(--cw-radius-full, 9999px);
  color: #0284c7;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.cw-balance-num {
  font-size: 15px;
  font-weight: 700;
  font-family: var(--cw-font-number, monospace);
  color: #0284c7;
}

.cw-balance-unit {
  font-size: 11.5px;
  color: #0369a1;
  font-weight: 500;
  opacity: 0.9;
}

[data-theme='dark'] .cw-header-balance-badge {
  background: rgba(56, 189, 248, 0.15);
  border-color: rgba(56, 189, 248, 0.4);
  color: #38bdf8;
}

[data-theme='dark'] .cw-balance-num {
  color: #38bdf8;
}

[data-theme='dark'] .cw-balance-unit {
  color: #7dd3fc;
}

/* 主体容器 */
.cw-novel-body {
  flex: 1;
  min-height: 0;
  padding: 18px 22px;
  overflow: hidden;
  background: var(--cw-bg-main, #f8f6f0);
  display: flex;
  flex-direction: column;
}

/* 未激活状态视图 */
.cw-novel-activation-view {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  overflow-y: auto;
}

.cw-activation-card {
  max-width: 640px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 24px 20px;
}

.cw-activation-illustration {
  width: 80px;
  height: 80px;
  border-radius: var(--cw-radius-lg, 16px);
  background: var(--cw-accent-bg);
  border: 1px solid var(--cw-accent-border);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  margin-bottom: 16px;
}

.cw-illustration-glow {
  position: absolute;
  inset: -10px;
  background: radial-gradient(circle, var(--cw-accent-bg) 0%, transparent 70%);
  border-radius: 50%;
  filter: blur(8px);
  z-index: 0;
}

.cw-illustration-icon {
  color: var(--cw-accent);
  position: relative;
  z-index: 1;
}

.cw-activation-title {
  margin: 0 0 10px 0;
  font-size: 22px;
  font-weight: 800;
  color: var(--cw-text-primary);
  letter-spacing: -0.3px;
}

.cw-activation-lead {
  margin: 0 0 24px 0;
  font-size: 13.5px;
  color: var(--cw-text-secondary);
  line-height: 1.6;
}

.cw-activation-perks-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  margin-bottom: 24px;
  text-align: left;
}

.cw-perk-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 12px 16px;
  border-radius: var(--cw-radius, 10px);
  border: 1px solid var(--cw-border);
  background: var(--cw-bg-card);
  box-shadow: var(--cw-shadow-sm);
  transition: all 0.2s ease;
}

.cw-perk-card:hover {
  border-color: var(--cw-border-hover);
  background: var(--cw-bg-card-hover);
}

.cw-perk-icon {
  width: 32px;
  height: 32px;
  border-radius: var(--cw-radius-sm, 6px);
  background: var(--cw-accent-bg);
  color: var(--cw-accent);
  border: 1px solid var(--cw-accent-border);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;
}

.cw-perk-content {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.cw-perk-title {
  margin: 0;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--cw-text-primary);
}

.cw-perk-desc {
  margin: 0;
  font-size: 12px;
  color: var(--cw-text-secondary);
  line-height: 1.45;
}

.cw-activation-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.cw-activation-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 28px;
  font-size: 15px;
  font-weight: 700;
  border-radius: var(--cw-radius, 8px);
  background: var(--cw-accent);
  border-color: var(--cw-accent);
  color: var(--cw-text-inverse, #ffffff);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  transition: all 0.2s ease;
}

.cw-activation-btn:hover:not(:disabled) {
  background: var(--cw-accent-hover);
  border-color: var(--cw-accent-hover);
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.2);
}

.cw-blocked-hint {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--cw-danger);
}

/* 暗色主题细调 (Dark mode overrides) */
[data-theme='dark'] .cw-novel-system-modal {
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.85);
}

[data-theme='dark'] .cw-nav-tab:hover {
  background: rgba(255, 255, 255, 0.06);
}

[data-theme='dark'] .cw-header-balance-badge {
  background: rgba(210, 153, 34, 0.2);
  border-color: rgba(210, 153, 34, 0.5);
  color: #f3be43;
}

[data-theme='dark'] .cw-balance-num {
  color: #f3be43;
}

@media (max-width: 768px) {
  /* 窄屏由主内容区统一滚动，筛选栏与长列表随内容流动。 */
  .cw-novel-body {
    display: block;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
    padding: 12px;
  }

  .cw-novel-body :deep(.cw-task-hall-panel),
  .cw-novel-body :deep(.cw-system-shop-panel),
  .cw-novel-body :deep(.cw-coin-ledger-panel) {
    height: auto;
    overflow: visible;
  }

  .cw-novel-body :deep(.cw-tasks-scroll-area),
  .cw-novel-body :deep(.cw-goods-scroll-area),
  .cw-novel-body :deep(.cw-ledger-items-flow) {
    flex: none;
    overflow: visible;
  }

  .cw-novel-activation-view {
    height: auto;
    overflow: visible;
  }

  .cw-novel-system-modal {
    border-radius: 0;
  }

  .cw-novel-header {
    flex-wrap: wrap;
    padding: 8px 12px;
    gap: 6px;

    .cw-brand-sub {
      display: none;
    }

    .cw-brand-title {
      font-size: 13.5px;
    }

    .cw-brand-icon {
      width: 28px;
      height: 28px;
    }
  }

  .cw-header-center-tabs {
    order: 3;
    width: 100%;
    overflow-x: auto;
    padding: 4px 0;
    gap: 4px;
    justify-content: flex-start;

    .cw-nav-tab {
      padding: 4px 10px;
      font-size: 12px;
      flex-shrink: 0;
    }
  }

  .cw-activation-card {
    padding: 12px 10px;
  }

  .cw-activation-illustration {
    width: 44px;
    height: 44px;
    margin-bottom: 8px;
  }

  .cw-activation-title {
    font-size: 16px;
    margin-bottom: 6px;
  }

  .cw-activation-lead {
    font-size: 12px;
    line-height: 1.4;
    margin-bottom: 12px;
  }

  .cw-activation-perks-grid {
    gap: 8px;
    margin-bottom: 14px;
  }

  .cw-perk-card {
    padding: 8px 10px;
    gap: 8px;
  }

  .cw-perk-icon {
    width: 24px;
    height: 24px;
  }

  .cw-perk-title {
    font-size: 12px;
  }

  .cw-perk-desc {
    font-size: 11px;
    line-height: 1.35;
  }

  .cw-activation-btn {
    padding: 9px 16px;
    font-size: 13px;
    width: 100%;
    box-sizing: border-box;
  }
}
</style>
