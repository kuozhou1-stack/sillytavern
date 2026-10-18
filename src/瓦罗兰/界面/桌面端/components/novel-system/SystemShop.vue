<template>
  <div class="cw-system-shop-panel">
    <!-- 顶部公告与物品栏快捷入口 -->
    <div class="cw-shop-banner">
      <div class="cw-banner-left">
        <div class="cw-banner-badge">
          <SvgIcon name="sparkles" :size="15" />
          <span>都会系统兑换</span>
        </div>
        <div class="cw-banner-text">
          <p class="cw-banner-title">凭证与道具将直接发放至您的「随身物品栏」</p>
          <p class="cw-banner-desc">
            商品兑换后不自动消耗，也不自动推进剧情。在正文中由您自主决定使用时机，依照道具原本描述结算。
          </p>
        </div>
      </div>
      <div class="cw-banner-right">
        <button
          type="button"
          class="cw-btn cw-btn-secondary cw-btn-sm cw-shop-refresh-btn"
          data-action="refresh-shop"
          :disabled="props.disabled || props.refreshDisabled"
          title="通过手机与奇遇 API 生成新品，保留购买记录与累计限购"
          @click="emit('refresh')"
        >
          <SvgIcon name="refreshCw" :size="14" :class="{ 'cw-spin': props.refreshing }" />
          <span>{{ props.refreshing ? '生成中…' : '刷新商店' }}</span>
        </button>
        <button
          type="button"
          class="cw-btn cw-btn-secondary cw-inventory-btn"
          title="打开个人档案的物品栏界面，查看与使用已获得的道具"
          @click="emit('openInventory')"
        >
          <SvgIcon name="backpack" :size="16" />
          <span>查看随身物品栏</span>
        </button>
      </div>
    </div>

    <!-- 专区导航 Tab -->
    <div class="cw-shop-tabs-row">
      <div class="cw-shop-tabs-left">
        <button
          type="button"
          class="cw-filter-tab"
          :class="{ active: currentCategory === 'all' }"
          @click="currentCategory = 'all'"
        >
          全部商品 ({{ allGoods.length }})
        </button>
        <button
          type="button"
          class="cw-filter-tab"
          :class="{ active: currentCategory === 'normal' }"
          @click="currentCategory = 'normal'"
        >
          生活实用补给 ({{ normalGoods.length }})
        </button>
        <button
          type="button"
          class="cw-filter-tab cw-rare-tab"
          :class="{ active: currentCategory === 'rare' }"
          @click="currentCategory = 'rare'"
        >
          <SvgIcon name="sparkles" :size="14" />
          <span>超常奇遇道具 ({{ rareGoods.length }})</span>
          <span v-if="completedCount < 5" class="cw-tab-lock-badge">
            <SvgIcon name="lock" :size="11" />
            <span>{{ completedCount }}/5</span>
          </span>
        </button>
      </div>

      <div class="cw-shop-status-hint">
        <span>当前任务完成数：</span>
        <strong :class="completedCount >= 5 ? 'cw-text-success' : 'cw-text-gold'">{{ completedCount }} / 5</strong>
        <span class="cw-hint-tail">（达 5 项解锁全部稀有品）</span>
      </div>
    </div>

    <!-- 商品网格展示区 -->
    <div class="cw-goods-scroll-area">
      <!-- 1. 普通商品专区 (若处于全部或普通视图) -->
      <section v-if="currentCategory === 'all' || currentCategory === 'normal'" class="cw-goods-section">
        <div class="cw-section-title-line">
          <div class="cw-section-title">
            <SvgIcon name="target" :size="16" />
            <span>生活实用补给</span>
          </div>
          <span class="cw-section-sub">日常消耗品与随身工具，融入瓦罗兰都市生活</span>
        </div>

        <div class="cw-goods-grid">
          <div
            v-for="good in normalGoods"
            :key="good.id"
            class="cw-good-card"
            :class="{ 'cw-good-disabled': isGoodDisabled(good) }"
          >
            <!-- 卡片头部：名称、分类、价格 -->
            <div class="cw-good-header">
              <div class="cw-good-title-box">
                <span class="cw-good-category">{{ good.category }}</span>
                <h4 class="cw-good-name">{{ good.name }}</h4>
              </div>
              <div class="cw-good-price-tag">
                <span class="cw-price-number">{{ good.price }}</span>
                <span class="cw-price-unit">蓝色精粹</span>
              </div>
            </div>

            <!-- 卡片中间：完整描述与使用条件 -->
            <div class="cw-good-body">
              <p class="cw-good-description">{{ good.description }}</p>
            </div>

            <!-- 卡片底部：限购说明与购买按钮 -->
            <div class="cw-good-footer">
              <div class="cw-limit-status">
                <template v-if="good.limit !== undefined">
                  <span class="cw-limit-label">限购:</span>
                  <span
                    class="cw-limit-count"
                    :class="{ 'cw-limit-reached': (novelState._商店已购[good.id] ?? 0) >= good.limit }"
                  >
                    已兑换 {{ novelState._商店已购[good.id] ?? 0 }} / {{ good.limit }} 件
                  </span>
                </template>
                <template v-else>
                  <span class="cw-limit-unlimited">常规供给 · 不设限购</span>
                </template>
              </div>

              <div class="cw-good-action-box">
                <button
                  type="button"
                  class="cw-btn cw-btn-primary cw-buy-btn"
                  :disabled="props.disabled || !!getIssue(good) || pendingId === good.id"
                  :title="getIssue(good) || undefined"
                  @click="handleBuy(good)"
                >
                  <SvgIcon v-if="pendingId === good.id" name="refreshCw" :size="14" class="cw-spin" />
                  <SvgIcon v-else name="coins" :size="14" />
                  <span>{{ getButtonText(good) }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 2. 稀有超常商品专区 (若处于全部或稀有视图) -->
      <section v-if="currentCategory === 'all' || currentCategory === 'rare'" class="cw-goods-section cw-rare-section">
        <div class="cw-section-title-line">
          <div class="cw-section-title cw-text-gold">
            <SvgIcon name="sparkles" :size="18" />
            <span>超常奇遇道具</span>
            <span class="cw-rare-super-badge">稀有超常</span>
          </div>
          <span class="cw-section-sub">
            带有限定小说系统色彩的消耗凭证；单次生效，使用后依照描述在行动中起效
          </span>
        </div>

        <!-- 锁定状态总提示条 -->
        <div v-if="completedCount < 5" class="cw-rare-locked-alert">
          <SvgIcon name="lock" :size="16" />
          <span>超常奇遇道具暂未解锁：需完成并领取 5 项任务奖励以激活共鸣（当前已领取 {{ completedCount }} / 5 项）</span>
        </div>

        <div class="cw-goods-grid">
          <div
            v-for="good in rareGoods"
            :key="good.id"
            class="cw-good-card cw-card-rare"
            :class="{
              'cw-good-locked': completedCount < 5,
              'cw-good-disabled': isGoodDisabled(good),
            }"
          >
            <!-- 稀有光效与锁定遮罩 -->
            <div v-if="completedCount < 5" class="cw-rare-overlay-mask">
              <div class="cw-mask-content">
                <SvgIcon name="lock" :size="24" />
                <span class="cw-mask-title">需完成 5 项任务解锁</span>
                <span class="cw-mask-progress">当前进度: {{ completedCount }} / 5</span>
              </div>
            </div>

            <!-- 卡片头部 -->
            <div class="cw-good-header">
              <div class="cw-good-title-box">
                <div class="cw-rare-tags-row">
                  <span class="cw-good-category cw-category-rare">{{ good.category }}</span>
                  <span class="cw-badge-rare-glow">稀有</span>
                </div>
                <h4 class="cw-good-name cw-rare-name">{{ good.name }}</h4>
              </div>
              <div class="cw-good-price-tag cw-price-rare">
                <span class="cw-price-number">{{ good.price }}</span>
                <span class="cw-price-unit">蓝色精粹</span>
              </div>
            </div>

            <!-- 卡片中间：完整描述 -->
            <div class="cw-good-body">
              <p class="cw-good-description cw-rare-desc">{{ good.description }}</p>
            </div>

            <!-- 卡片底部 -->
            <div class="cw-good-footer">
              <div class="cw-limit-status">
                <span class="cw-limit-label">限购:</span>
                <span
                  class="cw-limit-count"
                  :class="{ 'cw-limit-reached': (novelState._商店已购[good.id] ?? 0) >= (good.limit ?? 0) }"
                >
                  本存档限购 {{ good.limit }} 件 · 已购 {{ novelState._商店已购[good.id] ?? 0 }}
                </span>
              </div>

              <div class="cw-good-action-box">
                <button
                  type="button"
                  class="cw-btn cw-btn-primary cw-buy-btn cw-buy-rare-btn"
                  :disabled="props.disabled || !!getIssue(good) || pendingId === good.id"
                  :title="getIssue(good) || undefined"
                  @click="handleBuy(good)"
                >
                  <SvgIcon v-if="pendingId === good.id" name="refreshCw" :size="14" class="cw-spin" />
                  <SvgIcon v-else-if="completedCount < 5" name="lock" :size="14" />
                  <SvgIcon v-else name="sparkles" :size="14" />
                  <span>{{ getButtonText(good) }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { State } from '../../../../运行/core';
import { systemGoods, shopIssue, completedQuests, type SystemGood } from '../../../../运行/novel-system';
import SvgIcon from '../icons/SvgIcon.vue';

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
  (e: 'buy', goodId: string): void;
  (e: 'openInventory'): void;
}>();

const currentCategory = ref<'all' | 'normal' | 'rare'>('all');

const allGoods = computed(() => systemGoods(props.state));
const normalGoods = computed(() => allGoods.value.filter(g => !g.rare));
const rareGoods = computed(() => allGoods.value.filter(g => g.rare));

const completedCount = computed(() => completedQuests(props.state));
const userBalance = computed(() => props.novelState._系统币 ?? 0);

function getIssue(good: SystemGood): string {
  return shopIssue(props.state, good);
}

function isGoodDisabled(good: SystemGood): boolean {
  return !!getIssue(good);
}

function getButtonText(good: SystemGood): string {
  if (props.pendingId === good.id) return '兑换中...';
  const issue = getIssue(good);
  if (!issue) return `兑换 (${good.price} 蓝色精粹)`;

  if (issue.includes('解锁')) return '未达解锁条件';
  if (issue.includes('上限')) return '已达限购上限';
  if (issue.includes('不足')) return '蓝色精粹不足';
  return '暂不可兑换';
}

function handleBuy(good: SystemGood) {
  if (props.disabled || getIssue(good) || props.pendingId) return;
  emit('buy', good.id);
}
</script>

<style scoped>
.cw-system-shop-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  color: var(--cw-text-primary);
}

/* 顶部导流横幅 */
.cw-banner-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.cw-shop-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  background: var(--cw-accent-bg);
  border: 1px solid var(--cw-accent-border);
  border-radius: var(--cw-radius, 10px);
  gap: 16px;
  flex-shrink: 0;
}

.cw-banner-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cw-banner-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  color: var(--cw-accent);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.cw-banner-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--cw-text-primary);
}

.cw-banner-desc {
  margin: 0;
  font-size: 12px;
  color: var(--cw-text-secondary);
  line-height: 1.4;
}

.cw-banner-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.cw-shop-refresh-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 34px;
  min-width: 96px;
  padding: 0 14px;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid var(--cw-border);
  background: var(--cw-bg-card);
  color: var(--cw-text-primary);
  border-radius: var(--cw-radius-sm, 6px);
  box-shadow: var(--cw-shadow-sm);
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    border-color: var(--cw-accent);
    color: var(--cw-accent);
    background: var(--cw-bg-card-hover);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    box-shadow: none;
  }
}

.cw-inventory-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid var(--cw-border);
  background: var(--cw-bg-card);
  color: var(--cw-text-primary);
  border-radius: var(--cw-radius-sm, 6px);
  box-shadow: var(--cw-shadow-sm);
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    border-color: var(--cw-accent);
    color: var(--cw-accent);
    background: var(--cw-bg-card-hover);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  }
}

/* 专区 Tab */
.cw-shop-tabs-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--cw-border);
  padding-bottom: 8px;
  flex-shrink: 0;
  gap: 8px 12px;
}

.cw-shop-tabs-left {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 8px;
}

.cw-filter-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--cw-radius-sm, 6px);
  border: 1px solid transparent;
  background: transparent;
  color: var(--cw-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.cw-filter-tab:hover {
  background: var(--cw-bg-card-subtle);
  color: var(--cw-text-primary);
}

.cw-filter-tab.active {
  background: var(--cw-bg-card);
  border-color: var(--cw-border);
  color: var(--cw-accent);
  box-shadow: var(--cw-shadow-sm);
}

.cw-rare-tab.active {
  color: var(--cw-warning);
  border-color: var(--cw-warning);
}

.cw-tab-lock-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 10px;
  background: var(--cw-warning-bg);
  color: var(--cw-warning);
}

.cw-shop-status-hint {
  font-size: 12px;
  color: var(--cw-text-secondary);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.cw-hint-tail {
  color: var(--cw-text-muted);
  font-size: 11px;
}

.cw-text-gold {
  color: var(--cw-warning);
}

.cw-text-success {
  color: var(--cw-success);
}

/* 列表滚动区 */
.cw-goods-scroll-area {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding-right: 4px;
}

.cw-goods-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cw-section-title-line {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px 10px;
}

.cw-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  font-weight: 700;
  color: var(--cw-text-primary);
}

.cw-rare-super-badge {
  font-size: 11px;
  padding: 1px 6px;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #ffffff;
  border-radius: 4px;
  font-weight: 600;
}

.cw-section-sub {
  font-size: 12px;
  color: var(--cw-text-muted);
}

.cw-rare-locked-alert {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: var(--cw-radius-sm, 8px);
  background: var(--cw-warning-bg);
  border: 1px solid var(--cw-warning);
  color: var(--cw-warning);
  font-size: 12px;
  font-weight: 500;
}

/* 商品卡片网格 */
.cw-goods-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));
  gap: 14px;
}

.cw-good-card {
  background: var(--cw-bg-card);
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius, 10px);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: relative;
  transition: all 0.2s ease;
  box-shadow: var(--cw-shadow-sm);
}

.cw-good-card:hover {
  border-color: var(--cw-border-hover);
  box-shadow: var(--cw-shadow);
}

/* 稀有卡片流光 */
.cw-card-rare {
  background: linear-gradient(180deg, var(--cw-accent-bg) 0%, var(--cw-bg-card) 100%);
  border-color: var(--cw-accent-border);
  box-shadow: var(--cw-shadow);
}

.cw-card-rare:hover {
  border-color: var(--cw-warning);
  box-shadow: var(--cw-shadow-lg);
}

/* 锁定遮罩 */
.cw-rare-overlay-mask {
  position: absolute;
  inset: 0;
  background: var(--cw-bg-backdrop, rgba(0, 0, 0, 0.6));
  backdrop-filter: var(--cw-glass-blur, blur(4px));
  z-index: 5;
  border-radius: var(--cw-radius, 10px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.cw-mask-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--cw-warning);
  background: var(--cw-bg-surface);
  border: 1px solid var(--cw-border);
  padding: 12px 18px;
  border-radius: var(--cw-radius-sm, 8px);
  box-shadow: var(--cw-shadow);
}

.cw-mask-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--cw-text-primary);
}

.cw-mask-progress {
  font-size: 11px;
  color: var(--cw-text-secondary);
}

/* 头部 */
.cw-good-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.cw-good-title-box {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.cw-rare-tags-row {
  display: flex;
  align-items: center;
  gap: 5px;
}

.cw-good-category {
  font-size: 11px;
  color: var(--cw-text-secondary);
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);
  padding: 1px 6px;
  border-radius: 4px;
  display: inline-block;
  align-self: flex-start;
}

.cw-category-rare {
  background: var(--cw-warning-bg);
  border-color: var(--cw-warning);
  color: var(--cw-warning);
}

.cw-badge-rare-glow {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #ffffff;
  font-weight: 600;
}

.cw-good-name {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--cw-text-primary);
}

.cw-rare-name {
  color: var(--cw-warning);
}

.cw-good-price-tag {
  display: flex;
  align-items: baseline;
  gap: 3px;
  background: rgba(2, 132, 199, 0.08);
  border: 1px solid rgba(2, 132, 199, 0.25);
  padding: 3px 8px;
  border-radius: var(--cw-radius-sm, 6px);
  flex-shrink: 0;
}

.cw-price-rare {
  background: rgba(2, 132, 199, 0.12);
  border-color: rgba(56, 189, 248, 0.45);
}

.cw-price-number {
  font-size: 16px;
  font-weight: 700;
  font-family: var(--cw-font-number, monospace);
  color: #0284c7;
}

.cw-price-rare .cw-price-number {
  color: #0284c7;
}

.cw-price-unit {
  font-size: 11px;
  color: #0369a1;
  font-weight: 500;
}

[data-theme='dark'] .cw-good-price-tag {
  background: rgba(56, 189, 248, 0.12);
  border-color: rgba(56, 189, 248, 0.35);
}

[data-theme='dark'] .cw-price-number,
[data-theme='dark'] .cw-price-rare .cw-price-number {
  color: #38bdf8;
}

[data-theme='dark'] .cw-price-unit {
  color: #7dd3fc;
}

/* 描述体 */
.cw-good-body {
  flex: 1;
}

.cw-good-description {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--cw-text-secondary);
  word-break: break-word;
}

.cw-rare-desc {
  color: var(--cw-text-primary);
}

/* 底部操作 */
.cw-good-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  border-top: 1px dashed var(--cw-border);
  padding-top: 10px;
  gap: 8px 12px;
}

.cw-limit-status {
  font-size: 11px;
  color: var(--cw-text-muted);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  flex: 1 1 140px;
  min-width: 0;
}

.cw-limit-count {
  font-weight: 500;
  color: var(--cw-text-secondary);
}

.cw-limit-reached {
  color: var(--cw-danger);
  font-weight: 600;
}

.cw-limit-unlimited {
  color: var(--cw-text-muted);
}

.cw-good-action-box {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  flex-shrink: 0;
  margin-left: auto;
}

.cw-issue-tooltip {
  font-size: 10.5px;
  color: var(--cw-danger);
  white-space: nowrap;
}

.cw-buy-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  font-size: 12.5px;
  font-weight: 600;
  border-radius: var(--cw-radius-sm, 6px);
  white-space: nowrap;
  background: var(--cw-accent);
  border: 1px solid var(--cw-accent);
  color: var(--cw-text-inverse, #ffffff);
  cursor: pointer;
  transition: all 0.15s ease;
}

.cw-buy-btn:hover:not(:disabled) {
  background: var(--cw-accent-hover);
  border-color: var(--cw-accent-hover);
}

.cw-buy-rare-btn {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  border-color: #d97706;
  color: #ffffff;
}

.cw-buy-rare-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #d97706, #b45309);
  border-color: #b45309;
}

/* 暗色主题细调 (Dark mode overrides) */
[data-theme='dark'] .cw-card-rare {
  background: linear-gradient(180deg, rgba(210, 153, 34, 0.12) 0%, var(--cw-bg-card) 100%);
  border-color: rgba(210, 153, 34, 0.35);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), inset 0 0 12px rgba(210, 153, 34, 0.05);
}

[data-theme='dark'] .cw-card-rare:hover {
  border-color: #f3be43;
}

[data-theme='dark'] .cw-rare-name {
  color: #f3be43;
}

[data-theme='dark'] .cw-buy-rare-btn {
  color: #12161c;
  font-weight: 700;
}

@media (max-width: 720px) {
  .cw-shop-banner {
    flex-direction: column;
    align-items: flex-start;
  }

  .cw-goods-grid {
    grid-template-columns: 1fr;
  }
}
</style>
