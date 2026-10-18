<template>
  <div class="cw-coin-ledger-panel">
    <!-- 顶部资产统计卡片 -->
    <div class="cw-ledger-summary-grid">
      <div class="cw-summary-card cw-card-balance">
        <div class="cw-summary-label">
          <SvgIcon name="coins" :size="16" />
          <span>当前可用余额</span>
        </div>
        <div class="cw-summary-value cw-text-essence">
          {{ balance }}
          <span class="cw-summary-unit">蓝色精粹</span>
        </div>
        <div class="cw-summary-sub">独立于金币，本存档内有效</div>
      </div>

      <div class="cw-summary-card">
        <div class="cw-summary-label">
          <SvgIcon name="arrowDown" :size="16" />
          <span>累计任务与赠礼收入</span>
        </div>
        <div class="cw-summary-value cw-text-success">+{{ totalIncome }}</div>
        <div class="cw-summary-sub">派生自所有收入流水汇总</div>
      </div>

      <div class="cw-summary-card">
        <div class="cw-summary-label">
          <SvgIcon name="arrowUp" :size="16" />
          <span>累计商店兑换支出</span>
        </div>
        <div class="cw-summary-value cw-text-expense">-{{ totalExpense }}</div>
        <div class="cw-summary-sub">共完成 {{ expenseCount }} 次兑换消费</div>
      </div>
    </div>

    <!-- 流水列表区 -->
    <div class="cw-ledger-list-container">
      <div class="cw-ledger-list-header">
        <div class="cw-list-title">
          <SvgIcon name="list" :size="15" />
          <span>收支变动明细</span>
          <span class="cw-record-badge">共 {{ ledgerList.length }} 笔记录</span>
        </div>
        <div class="cw-list-note">流水按入账顺序记录，不虚构未记录的时间戳</div>
      </div>

      <!-- 空态 -->
      <div v-if="ledgerList.length === 0" class="cw-ledger-empty">
        <SvgIcon name="coins" :size="40" class="cw-empty-icon" />
        <div class="cw-empty-title">暂无收支记录</div>
        <div class="cw-empty-desc">完成并领取任务奖励，或在商店兑换物品后将在此记录。</div>
      </div>

      <!-- 列表 -->
      <div v-else class="cw-ledger-items-flow">
        <div
          v-for="item in ledgerList"
          :key="item.id"
          class="cw-ledger-row"
          :class="item.数额 >= 0 ? 'cw-row-income' : 'cw-row-expense'"
        >
          <div class="cw-row-icon-box">
            <SvgIcon :name="getTypeIcon(item.类型)" :size="18" />
          </div>

          <div class="cw-row-info">
            <div class="cw-row-title-line">
              <span class="cw-row-type-tag" :class="getTypeClass(item.类型)">{{ item.类型 }}</span>
              <span class="cw-row-desc">{{ item.说明 || '蓝色精粹收支变动' }}</span>
            </div>
            <div v-if="item.关联id" class="cw-row-meta">
              <span class="cw-meta-label">关联标识:</span>
              <code class="cw-meta-id">{{ item.关联id }}</code>
            </div>
          </div>

          <div class="cw-row-amount" :class="item.数额 >= 0 ? 'cw-text-success' : 'cw-text-expense'">
            {{ item.数额 >= 0 ? `+${item.数额}` : item.数额 }}
            <span class="cw-amount-unit">蓝色精粹</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { State } from '../../../../运行/core';
import SvgIcon from '../icons/SvgIcon.vue';

const props = defineProps<{
  novelState: State['奇遇系统'];
}>();

const balance = computed(() => props.novelState._系统币 ?? 0);

interface LedgerItem {
  id: string;
  类型: State['奇遇系统']['_流水'][string]['类型'];
  数额: number;
  说明: string;
  关联id: string | null;
}

const ledgerList = computed<LedgerItem[]>(() => {
  const records = props.novelState._流水 || {};
  return Object.entries(records)
    .map(([id, data]) => ({
      id,
      ...data,
    }))
    .reverse();
});

const totalIncome = computed(() => {
  const records = props.novelState._流水 || {};
  return Object.values(records)
    .filter(r => r.数额 > 0)
    .reduce((sum, r) => sum + r.数额, 0);
});

const totalExpense = computed(() => {
  const records = props.novelState._流水 || {};
  return Math.abs(
    Object.values(records)
      .filter(r => r.数额 < 0)
      .reduce((sum, r) => sum + r.数额, 0),
  );
});

const expenseCount = computed(() => {
  const records = props.novelState._流水 || {};
  return Object.values(records).filter(r => r.数额 < 0).length;
});

function getTypeIcon(type: string): string {
  switch (type) {
    case '启用赠礼':
      return 'sparkles';
    case '任务奖励':
      return 'checkCircle';
    case '商店购买':
      return 'backpack';
    default:
      return 'coins';
  }
}

function getTypeClass(type: string): string {
  switch (type) {
    case '启用赠礼':
      return 'cw-tag-gift';
    case '任务奖励':
      return 'cw-tag-reward';
    case '商店购买':
      return 'cw-tag-buy';
    default:
      return 'cw-tag-default';
  }
}
</script>

<style scoped>
.cw-coin-ledger-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
  height: 100%;
  color: var(--cw-text-primary);
}

/* 顶部统计卡片 */
.cw-ledger-summary-grid {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr;
  gap: 14px;
}

.cw-summary-card {
  padding: 16px;
  background: var(--cw-bg-card);
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius, 10px);
  box-shadow: var(--cw-shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cw-card-balance {
  background: linear-gradient(135deg, rgba(2, 132, 199, 0.08) 0%, var(--cw-bg-card) 100%);
  border-color: rgba(2, 132, 199, 0.35);
}

.cw-summary-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--cw-text-secondary);
}

.cw-summary-value {
  font-size: 26px;
  font-weight: 700;
  line-height: 1.1;
  font-family: var(--cw-font-number, monospace);
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.cw-summary-unit {
  font-size: 13px;
  font-weight: normal;
  color: var(--cw-text-secondary);
}

.cw-summary-sub {
  font-size: 11px;
  color: var(--cw-text-muted);
}

.cw-text-essence {
  color: #0284c7;
}

[data-theme='dark'] .cw-card-balance {
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.12) 0%, var(--cw-bg-card) 100%);
  border-color: rgba(56, 189, 248, 0.4);
}

[data-theme='dark'] .cw-text-essence {
  color: #38bdf8;
}

.cw-text-success {
  color: var(--cw-success);
}

.cw-text-expense {
  color: var(--cw-danger);
}

/* 列表区 */
.cw-ledger-list-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  background: var(--cw-bg-card);
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius, 10px);
  overflow: hidden;
}

.cw-ledger-list-header {
  padding: 12px 18px;
  background: var(--cw-bg-card-subtle);
  border-bottom: 1px solid var(--cw-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px 12px;
}

.cw-list-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--cw-text-primary);
}

.cw-record-badge {
  font-size: 11px;
  padding: 2px 7px;
  background: var(--cw-bg-surface);
  border: 1px solid var(--cw-border);
  border-radius: 12px;
  color: var(--cw-text-secondary);
}

.cw-list-note {
  font-size: 11px;
  color: var(--cw-text-muted);
}

.cw-ledger-items-flow {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cw-ledger-row {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  border-radius: var(--cw-radius-sm, 8px);
  border: 1px solid var(--cw-border);
  background: var(--cw-bg-surface);
  transition: all 0.15s ease;
  gap: 12px;
}

.cw-ledger-row:hover {
  background: var(--cw-bg-card-hover);
  border-color: var(--cw-border-hover);
}

.cw-row-icon-box {
  width: 34px;
  height: 34px;
  border-radius: var(--cw-radius-sm, 8px);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.cw-row-income .cw-row-icon-box {
  background: var(--cw-success-bg);
  color: var(--cw-success);
}

.cw-row-expense .cw-row-icon-box {
  background: var(--cw-danger-bg);
  color: var(--cw-danger);
}

.cw-row-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.cw-row-title-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
}

.cw-row-type-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 500;
  flex-shrink: 0;
  border: 1px solid transparent;
}

.cw-tag-gift {
  background: rgba(147, 51, 234, 0.12);
  color: #9333ea;
  border-color: rgba(147, 51, 234, 0.25);
}

.cw-tag-reward {
  background: var(--cw-success-bg);
  color: var(--cw-success);
  border-color: var(--cw-success-bg);
}

.cw-tag-buy {
  background: var(--cw-warning-bg);
  color: var(--cw-warning);
  border-color: var(--cw-warning);
}

.cw-row-desc {
  font-size: 13px;
  font-weight: 500;
  color: var(--cw-text-primary);
  word-break: break-word;
}

.cw-row-meta {
  font-size: 11px;
  color: var(--cw-text-muted);
  display: flex;
  align-items: center;
  gap: 4px;
}

.cw-meta-id {
  font-family: monospace;
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);
  padding: 1px 4px;
  border-radius: 3px;
}

.cw-row-amount {
  font-size: 16px;
  font-weight: 700;
  font-family: var(--cw-font-number, monospace);
  text-align: right;
  flex-shrink: 0;
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.cw-amount-unit {
  font-size: 11px;
  font-weight: normal;
  color: var(--cw-text-secondary);
}

.cw-ledger-empty {
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
}

/* 暗色主题细调 (Dark mode overrides) */
[data-theme='dark'] .cw-text-gold {
  color: #f3be43;
}

[data-theme='dark'] .cw-tag-gift {
  color: #c084fc;
  background: rgba(192, 132, 252, 0.15);
  border-color: rgba(192, 132, 252, 0.3);
}

[data-theme='dark'] .cw-tag-buy {
  color: #f3be43;
  border-color: rgba(210, 153, 34, 0.4);
}

@media (max-width: 720px) {
  .cw-ledger-summary-grid {
    grid-template-columns: 1fr;
  }
}
</style>
