<template>
  <div class="cw-modal-backdrop" @click.self="emit('close')">
    <div class="cw-modal-box cw-world-detail-modal">
      <div class="cw-modal-header">
        <div class="cw-header-title">
          <SvgIcon name="calendar" :size="20" class="cw-header-icon" />
          <span>瓦罗兰 · 世界环境与财务明细</span>
        </div>
        <button class="cw-btn cw-btn-ghost cw-close-btn" aria-label="关闭世界详情" @click="emit('close')">
          <SvgIcon name="close" :size="18" />
        </button>
      </div>

      <!-- 顶部 Tab 导航：四大主分类，避免挤成多行 (F05) -->
      <div class="cw-modal-tabs">
        <button
          v-for="t in mainTabs"
          :key="t.key"
          class="cw-modal-tab-btn"
          :class="{ active: currentTab === t.key }"
          @click="currentTab = t.key"
        >
          <SvgIcon :name="t.icon" :size="15" />
          <span>{{ t.label }}</span>
        </button>
      </div>

      <!-- 内容区 -->
      <div class="cw-modal-body">
        <!-- 1. 城市时空 (F06: 丰富信息摘要，杜绝空白) -->
        <div v-if="currentTab === 'time_space'" class="cw-tab-pane">
          <!-- 城市环境概览卡 -->
          <div class="cw-env-dashboard">
            <div class="cw-env-card">
              <div class="cw-env-icon">
                <SvgIcon name="clock" :size="24" />
              </div>
              <div class="cw-env-content">
                <span class="cw-env-label">当前故事时间</span>
                <span class="cw-env-val">{{ formatTime(world?.当前时间) }}</span>
                <span class="cw-env-sub">开局：{{ formatTime(world?.开局时间) }}</span>
              </div>
            </div>

            <div class="cw-env-card">
              <div class="cw-env-icon">
                <SvgIcon name="cloud" :size="24" />
              </div>
              <div class="cw-env-content">
                <span class="cw-env-label">当前气象环境</span>
                <span class="cw-env-val">
                  {{ world?.天气?.天气状况 || '天气未知' }}
                  <span v-if="world?.天气?.气温 != null" class="cw-temp">
                    {{ world.天气.气温 }}°C
                  </span>
                </span>
                <span class="cw-env-sub">
                  {{ world?.天气?.风况 ? `风况：${world.天气.风况}` : '风况未知' }}
                  {{ world?.天气?.适用区域 ? `· ${world.天气.适用区域}` : '' }}
                </span>
              </div>
            </div>

            <div class="cw-env-card">
              <div class="cw-env-icon">
                <SvgIcon name="mapPin" :size="24" />
              </div>
              <div class="cw-env-content">
                <span class="cw-env-label">玩家当前身处</span>
                <span class="cw-env-val">{{ currentLocationName }}</span>
                <span class="cw-env-sub">{{ currentDistrictName ? `片区：${currentDistrictName}` : '片区未知' }}</span>
              </div>
            </div>
          </div>

          <h4 class="cw-section-title"><SvgIcon name="cloud" :size="15" /><span>天气预报</span></h4>
          <div v-if="hasForecasts" class="cw-card-list">
            <div v-for="(forecast, id) in world.天气预报" :key="id" class="cw-detail-card">
              <div class="cw-card-header">
                <span class="cw-card-title">{{ forecast.适用范围 || '预报范围未知' }}</span>
              </div>
              <p class="cw-card-content">{{ forecast.预测内容 || '预报内容未知' }}</p>
              <div class="cw-card-meta">
                <span>{{ formatTimeRange(forecast.起始时间, forecast.结束时间) }}</span>
              </div>
            </div>
          </div>
          <div v-else class="cw-empty-tip">
            <SvgIcon name="cloud" :size="24" class="cw-empty-icon" />
            <span>暂无天气预报记录</span>
          </div>

          <!-- 城市重大日程 -->
          <h4 class="cw-section-title">
            <SvgIcon name="calendar" :size="15" />
            <span>近期城市重大日程</span>
          </h4>
          <div v-if="hasSchedules" class="cw-card-list">
            <div v-for="(item, id) in world?.城市日程" :key="id" class="cw-detail-card">
              <div class="cw-card-header">
                <span class="cw-card-title">{{ item.名称 || '未命名活动' }}</span>
                <span class="cw-badge cw-badge-accent">{{ item.类型 || '公开日程' }}</span>
              </div>
              <div class="cw-card-meta">
                <span>时段：{{ formatTimeRange(item.起始时间, item.结束时间) }}</span>
                <span v-if="item.地点id">地点：{{ getLocationName(item.地点id) }}</span>
                <span v-if="item.适用范围">范围：{{ item.适用范围 }}</span>
              </div>
              <p v-if="item.公开信息" class="cw-card-content">{{ item.公开信息 }}</p>
            </div>
          </div>
          <div v-else class="cw-empty-tip">
            <SvgIcon name="calendar" :size="24" class="cw-empty-icon" />
            <span>当前暂无收录的城市重大日程</span>
          </div>

        </div>

        <!-- 2. 已知事件 (F07: 读取起始/结束时间，杜绝逐字段折叠) -->
        <div v-else-if="currentTab === 'events'" class="cw-tab-pane">
          <div v-if="eventList.length > 0" class="cw-card-list">
            <div v-for="e in eventList" :key="e.id" class="cw-detail-card">
              <div class="cw-card-header">
                <span v-if="e.日期说明 && e.日期说明 !== e.timeDisplay" class="cw-card-title">{{ e.日期说明 }}</span>
                <span class="cw-event-time">{{ e.timeDisplay }}</span>
              </div>
              <p class="cw-card-content">{{ e.事实 || '无具体事件事实详述' }}</p>
              <div v-if="e.participantNames.length > 0" class="cw-card-meta" style="margin-top: 10px;">
                <span>参与者：{{ e.participantNames.join('、') }}</span>
              </div>
            </div>
          </div>
          <div v-else class="cw-empty-tip">
            <SvgIcon name="bookmark" :size="24" class="cw-empty-icon" />
            <span>暂无玩家已知的重大历史事件</span>
          </div>
        </div>

        <!-- 3. 所属组织 (结构化卡片呈现) -->
        <div v-else-if="currentTab === 'organizations'" class="cw-tab-pane">
          <div v-if="orgList.length > 0" class="cw-card-list">
            <div v-for="org in orgList" :key="org.id" class="cw-detail-card">
              <div class="cw-card-header">
                <span class="cw-card-title">{{ org.名称 || org.id }}</span>
                <span class="cw-badge cw-badge-accent">{{ org.类型 || '社会组织' }}</span>
              </div>
              <p class="cw-card-content">{{ org.简介 || '暂无详细介绍' }}</p>
              <div class="cw-card-meta" style="margin-top: 8px;">
                <span v-if="org.场所id?.length">相关场所：{{ org.场所id.map(getLocationName).join('、') }}</span>
                <span v-if="org.playerRole">担任职务：{{ org.playerRole }}</span>
              </div>
            </div>
          </div>
          <div v-else class="cw-empty-tip">
            <SvgIcon name="users" :size="24" class="cw-empty-icon" />
            <span>玩家当前未加入任何特定组织机构</span>
          </div>
        </div>

        <!-- 4. 资金账目 (F08: 结构化未结事项，杜绝直接渲染 JSON) -->
        <div v-else-if="currentTab === 'funds'" class="cw-tab-pane">
          <!-- 资金概览统计 -->
          <div class="cw-funds-summary">
            <div class="cw-summary-box">
              <span class="cw-summary-label">金币余额</span>
              <span class="cw-summary-amount">{{ totalFundsDisplay }}</span>
            </div>
            <div class="cw-summary-box">
              <span class="cw-summary-label">未结事项</span>
              <span class="cw-summary-num">{{ pendingList.length }} 项</span>
            </div>
          </div>
          <!-- 未结事项 (F08) -->
          <h4 class="cw-section-title">未结财务事项</h4>
          <div v-if="pendingList.length > 0" class="cw-pending-list">
            <div v-for="item in pendingList" :key="item.id" class="cw-detail-card cw-pending-card">
              <div class="cw-card-header">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span class="cw-badge cw-badge-accent">{{ item.类型 || '待办款项' }}</span>
                  <span class="cw-card-title">{{ item.partyName }}</span>
                </div>
                <span class="cw-badge" :class="getPendingBadgeClass(item.状态)">{{ item.状态 || '待结算' }}</span>
              </div>
              <div class="cw-pending-amount">{{ formatCentsToYuan(item.金额分) }}</div>
              <div class="cw-card-meta">
                <span v-if="item.条件">达成条件：{{ item.条件 }}</span>
              </div>
            </div>
          </div>
          <div v-else class="cw-empty-tip">
            <SvgIcon name="checkCircle" :size="24" class="cw-empty-icon" />
            <span>当前无待结清的应收、应付款项或押金</span>
          </div>

          <!-- 近期交易明细 -->
          <h4 class="cw-section-title" style="margin-top: 20px;">近期流水明细</h4>
          <div v-if="hasTransactions" class="cw-tx-list">
            <div v-for="[id, tx] in transactionPage" :key="id" class="cw-tx-item">
              <div class="cw-tx-left">
                <span class="cw-tx-desc">{{ tx.用途 || '日常收支' }} · {{ tx.类型 || '消费' }}</span>
                <span class="cw-tx-time">{{ formatTime(tx.时间) }}</span>
              </div>
              <div class="cw-tx-right" :class="getTxClass(tx)">
                {{ formatTxAmount(tx) }}
              </div>
            </div>

            <!-- 分页控件 -->
            <div v-if="transactions.length > 20" class="cw-tx-pagination">
              <button class="cw-btn cw-btn-ghost cw-btn-sm" :disabled="txPage === 0" @click="txPage--">上一页</button>
              <span class="cw-page-info">{{ txPage + 1 }} / {{ Math.max(1, Math.ceil(transactions.length / 20)) }}</span>
              <button class="cw-btn cw-btn-ghost cw-btn-sm" :disabled="(txPage + 1) * 20 >= transactions.length" @click="txPage++">下一页</button>
            </div>
          </div>
          <div v-else class="cw-empty-tip">
            <SvgIcon name="clock" :size="24" class="cw-empty-icon" />
            <span>暂无近期的资金流水记录</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import SvgIcon from '../icons/SvgIcon.vue';
import { useWorldState } from '../../utils/context';
import { resolveLocationName, resolveEntityName, formatCentsToYuan } from '../../utils/entity';
import { byNewest } from '../../../../运行/phone';

const props = defineProps<{
  world: any;
  player: any;
  locations?: any;
  initialTab?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const state = useWorldState();

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close');
  }
}
onMounted(() => window.addEventListener('keydown', handleKeydown));
onUnmounted(() => window.removeEventListener('keydown', handleKeydown));

// F05: 4组主标签
const mainTabs = [
  { key: 'time_space', label: '城市时空', icon: 'compass' },
  { key: 'events', label: '已知事件', icon: 'calendar' },
  { key: 'organizations', label: '所属组织', icon: 'users' },
  { key: 'funds', label: '资金财务', icon: 'coins' },
];

function resolveInitialTab(tab?: string): string {
  if (!tab) return 'time_space';
  if (['schedule', 'weather', 'traffic', 'time', 'location', 'time_space'].includes(tab)) return 'time_space';
  if (['events', 'organizations', 'funds'].includes(tab)) return tab;
  return 'time_space';
}

const currentTab = ref(resolveInitialTab(props.initialTab));

// 时空信息
const currentLocationName = computed(() => {
  const locId = props.player?.当前状态?.当前地点id || props.player?.当前地点id;
  return resolveLocationName(state.value, locId) || '瓦罗兰街区';
});

const currentDistrictName = computed(() => {
  const locId = props.player?.当前状态?.当前地点id || props.player?.当前地点id;
  const spot = state.value?.地点?.[locId];
  if (spot?.片区id) return props.world?.片区?.[spot.片区id]?.名称 || null;
  return null;
});

const hasSchedules = computed(() => props.world?.城市日程 && Object.keys(props.world.城市日程).length > 0);
const hasForecasts = computed(() => props.world?.天气预报 && Object.keys(props.world.天气预报).length > 0);

// F07: 规范读取事件的起始与结束时间，并解析参与者
const eventList = computed(() => {
  const allEvents = state.value?.事件;
  if (!allEvents || typeof allEvents !== 'object') return [];
  const playerId = state.value?.玩家?.id;

  return Object.entries(allEvents)
    .filter(([, e]: any) => !playerId || Object.hasOwn(e.各人可知来源 || {}, playerId))
    .map(([id, e]: any) => {
      const participants = Object.keys(e.参与者 || {}).map(pid => resolveEntityName(state.value, pid));
      return {
        id,
        ...e,
        timeDisplay: formatTimeRange(e.起始时间, e.结束时间) || e.日期说明 || '时间未定',
        participantNames: participants,
      };
    });
});

// 组织列表
const orgList = computed(() => {
  const orgs = state.value?.组织 || {};
  const myOrgIds = props.player?.身份?.组织id || [];
  return Object.entries(orgs)
    .filter(([id]) => myOrgIds.includes(id))
    .map(([id, org]: any) => ({
      id,
      ...org,
      playerRole: org.已知成员?.[props.player?.id]?.职务,
    }));
});

// 财务与交易
const txPage = ref(0);
const transactions = computed(
  () =>
    Object.entries(props.player?.资金?.交易 ?? {}).sort(([a, x]: any, [b, y]: any) =>
      byNewest({ id: a, 故事时间: x.时间 }, { id: b, 故事时间: y.时间 }),
    ) as [string, any][],
);
const transactionPage = computed(() => transactions.value.slice(txPage.value * 20, (txPage.value + 1) * 20));
const hasTransactions = computed(() => transactions.value.length > 0);

// F08: 格式化未结事项，杜绝原始 JSON
const pendingList = computed(() => {
  const items = props.player?.资金?.未结事项;
  if (!items || typeof items !== 'object') return [];
  return Object.entries(items).map(([id, val]: [string, any]) => ({
    id,
    ...val,
    partyName: val.对方id ? resolveEntityName(state.value, val.对方id) : '未指定对象',
  }));
});

function getPendingBadgeClass(status: string) {
  switch (status) {
    case '已结清':
      return 'cw-badge-success';
    case '争议':
    case '坏账':
      return 'cw-badge-danger';
    case '处理中':
      return 'cw-badge-warning';
    default:
      return 'cw-badge-info';
  }
}

const totalFundsDisplay = computed(() => formatCentsToYuan(props.player?.资金?.余额分));

function formatTime(t: any) {
  if (!t || typeof t.年 !== 'number') return '未知时间';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${t.年}-${pad(t.月)}-${pad(t.日)} ${pad(t.时)}:${pad(t.分)}`;
}

function formatTimeRange(st: any, et: any) {
  if (!st && !et) return '';
  if (st && !et) return `${formatTime(st)} 始`;
  if (!st && et) return `至 ${formatTime(et)}`;
  return `${formatTime(st)} ~ ${formatTime(et)}`;
}

function getLocationName(spotId: string) {
  return resolveLocationName(state.value, spotId);
}

function getTxClass(tx: any) {
  if (tx.类型 === '收入' || tx.类型 === '退款') return 'plus';
  return 'minus';
}

function formatTxAmount(tx: any) {
  if (tx.金额分 == null) return '金额未知';
  const prefix = tx.类型 === '内部转账' ? '' : (tx.类型 === '收入' || tx.类型 === '退款') ? '+' : '-';
  return `${prefix} ${formatCentsToYuan(tx.金额分)}`;
}
</script>

<style scoped lang="scss">
.cw-world-detail-modal {
  width: 780px;
  height: 620px;
}

.cw-modal-header {
  padding: 16px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--cw-border);
  background: var(--cw-bg-card-subtle);

  .cw-header-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 16px;
    font-weight: 600;
    color: var(--cw-text-primary);
  }

  .cw-header-icon {
    color: var(--cw-accent);
  }
}

.cw-modal-tabs {
  display: flex;
  gap: 8px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--cw-border);
  background: var(--cw-bg-surface);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }

  .cw-modal-tab-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 16px;
    border-radius: var(--cw-radius);
    border: 1px solid transparent;
    background: transparent;
    color: var(--cw-text-secondary);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
    flex-shrink: 0;

    &:hover {
      background: var(--cw-bg-card-subtle);
      color: var(--cw-text-primary);
    }

    &.active {
      background: var(--cw-accent-bg);
      color: var(--cw-accent);
      border-color: var(--cw-accent-border);
      font-weight: 600;
    }
  }
}

.cw-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

.cw-env-dashboard {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 20px;

  .cw-env-card {
    padding: 14px;
    border-radius: var(--cw-radius);
    background: var(--cw-bg-card);
    border: 1px solid var(--cw-border);
    display: flex;
    align-items: flex-start;
    gap: 12px;
    min-width: 0;

    .cw-env-icon {
      color: var(--cw-accent);
      padding-top: 2px;
      flex-shrink: 0;
    }

    .cw-env-content {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;

      .cw-env-label {
        font-size: 11px;
        color: var(--cw-text-muted);
      }
      .cw-env-val {
        font-size: 14px;
        font-weight: 600;
        color: var(--cw-text-primary);
        overflow-wrap: anywhere;
      }
      .cw-temp {
        color: var(--cw-accent);
        margin-left: 4px;
      }
      .cw-env-sub {
        font-size: 12px;
        color: var(--cw-text-secondary);
        overflow-wrap: anywhere;
      }
    }
  }
}

@media (max-width: 640px) {
  .cw-modal-tabs {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    padding: 6px 8px;
    gap: 2px;

    .cw-modal-tab-btn {
      justify-content: center;
      gap: 3px;
      min-height: 30px;
      padding: 4px 1px;
      font-size: 12px;
      .cw-svg-icon { display: none; }
    }
  }

  .cw-modal-body {
    padding: 14px 16px;
  }
}

@media (max-width: 480px) {
  .cw-env-dashboard {
    grid-template-columns: 1fr;
  }

  .cw-funds-summary {
    flex-direction: column;
    gap: 10px;
  }
}

.cw-card-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cw-detail-card {
  padding: 14px 16px;
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card);
  transition: border-color 0.15s;

  &:hover {
    border-color: var(--cw-border-hover);
  }

  .cw-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .cw-card-title {
    font-weight: 600;
    font-size: 14px;
    color: var(--cw-text-primary);
  }

  .cw-event-time {
    font-size: 12px;
    color: var(--cw-text-muted);
  }

  .cw-card-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    font-size: 12px;
    color: var(--cw-text-secondary);
    margin-bottom: 4px;
  }

  .cw-card-content {
    margin: 0;
    font-size: 13px;
    color: var(--cw-text-primary);
    line-height: 1.6;
  }
}

.cw-empty-tip {
  width: 100%;
  padding: 24px 16px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px dashed var(--cw-border);
  border-radius: var(--cw-radius, 10px);
  background: var(--cw-bg-card-subtle, rgba(0, 0, 0, 0.02));
  color: var(--cw-text-secondary);
  font-size: 12.5px;
  margin: 8px 0 16px;
  text-align: center;

  .cw-empty-icon {
    opacity: 0.7;
    flex-shrink: 0;
    color: var(--cw-text-muted);
  }

  span {
    font-weight: 500;
  }
}

.cw-funds-summary {
  display: flex;
  gap: 16px;
  margin-bottom: 18px;

  .cw-summary-box {
    flex: 1;
    padding: 14px 18px;
    border-radius: var(--cw-radius);
    background: var(--cw-bg-card-subtle);
    border: 1px solid var(--cw-border);
    display: flex;
    flex-direction: column;
    gap: 4px;

    .cw-summary-label {
      font-size: 12px;
      color: var(--cw-text-muted);
    }
    .cw-summary-amount {
      font-size: 20px;
      font-weight: 700;
      color: var(--cw-success);
      font-family: monospace, sans-serif;
    }
    .cw-summary-num {
      font-size: 18px;
      font-weight: 600;
      color: var(--cw-text-primary);
    }
  }
}

.cw-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--cw-text-primary);
  margin: 18px 0 10px;
}

.cw-account-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 18px;

  .cw-account-card {
    padding: 12px 14px;
    border-radius: var(--cw-radius);
    background: var(--cw-bg-card);
    border: 1px solid var(--cw-border);

    .cw-acc-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    }
    .cw-acc-name {
      font-weight: 600;
      font-size: 13px;
    }
    .cw-acc-val {
      font-size: 16px;
      font-weight: 700;
      color: var(--cw-text-primary);
      font-family: monospace, sans-serif;
    }
    .cw-acc-meta {
      font-size: 11px;
      color: var(--cw-text-muted);
      margin-top: 4px;
    }
  }
}

.cw-pending-list {
  display: flex;
  flex-direction: column;
  gap: 10px;

  .cw-pending-card {
    .cw-pending-amount {
      font-size: 16px;
      font-weight: 700;
      color: var(--cw-text-primary);
      margin-bottom: 6px;
    }
  }
}

.cw-tx-list {
  display: flex;
  flex-direction: column;
  gap: 8px;

  .cw-tx-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-radius: var(--cw-radius-sm);
    background: var(--cw-bg-card);
    border: 1px solid var(--cw-border);

    .cw-tx-left {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .cw-tx-desc {
      font-size: 13px;
      font-weight: 500;
    }
    .cw-tx-time {
      font-size: 11px;
      color: var(--cw-text-muted);
    }
    .cw-tx-right {
      font-family: monospace, sans-serif;
      font-size: 14px;
      font-weight: 600;

      &.minus {
        color: var(--cw-danger);
      }
      &.plus {
        color: var(--cw-success);
      }
    }
  }

  .cw-tx-pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-top: 10px;

    .cw-page-info {
      font-size: 12px;
      color: var(--cw-text-muted);
    }
  }
}
</style>
