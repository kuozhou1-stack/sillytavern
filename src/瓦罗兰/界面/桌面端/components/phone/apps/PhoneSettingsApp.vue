<template>
  <div class="cw-phone-settings-app">
    <header class="cw-app-header">
      <button class="cw-btn-icon" aria-label="返回手机" @click="emit('back')">
        <SvgIcon name="chevronLeft" :size="20" />
      </button>
      <span class="cw-header-title">手机系统与设置</span>
    </header>

    <!-- 设置模式切换 Tab (F04: 承载原折叠栏的账号与历史) -->
    <div class="cw-settings-tabs">
      <button
        v-for="t in tabs"
        :key="t.key"
        class="cw-st-tab-btn"
        :class="{ active: currentTab === t.key }"
        @click="currentTab = t.key"
      >
        <SvgIcon :name="t.icon" :size="14" />
        <span>{{ t.label }}</span>
      </button>
    </div>

    <div class="cw-settings-body">
      <!-- 2. 本人平台账号管理 (F04) -->
      <div v-if="currentTab === 'account'" class="cw-settings-pane">
        <h4 class="cw-section-title">我的平台账号</h4>
        <div v-if="myAccountsList.length > 0" class="cw-account-cards">
          <div v-for="acc in myAccountsList" :key="acc.id" class="cw-acc-item-card">
            <div class="cw-acc-info">
              <span class="cw-acc-plat-badge">{{ acc.平台 }}</span>
              <span class="cw-acc-name">{{ acc.昵称 || acc.账号名 }}</span>
              <span class="cw-acc-id">ID: {{ acc.id }}</span>
            </div>
            <span class="cw-acc-status">已启用</span>
          </div>
        </div>
        <div v-else class="cw-empty-compact" style="margin-bottom: 8px;">
          <SvgIcon name="user" :size="16" class="cw-empty-icon" />
          <span>尚未在任何社交网络建立本人账号，可在下方快速开通</span>
        </div>

        <h4 class="cw-section-title" style="margin-top: 18px;">开通新社交账号</h4>
        <div class="cw-create-acc-box">
          <div class="cw-acc-form-row">
            <label class="cw-form-k">选择平台：</label>
            <select v-model="newPlatform" class="cw-density-select">
              <option value="邻信">邻信 (熟人社交通讯)</option>
              <option value="微澜">微澜 (公共城市广场)</option>
            </select>
          </div>
          <div class="cw-acc-form-row">
            <label class="cw-form-k">账号昵称：</label>
            <input v-model="newAccountName" placeholder="输入要显示的公开称谓" class="cw-density-input" />
          </div>
          <button
            class="cw-btn cw-btn-primary cw-btn-sm"
            :disabled="!newAccountName.trim()"
            @click="handleCreateAccount"
          >
            开通账号
          </button>
        </div>
        <h4 class="cw-section-title" style="margin-top: 18px">新内容生成量</h4>
        <div class="cw-density">
          <label class="cw-density-label">
            <span>生成量</span>
            <select v-model="density" class="cw-density-select"><option>少量</option><option>标准</option><option>丰富</option></select>
          </label>
          <button class="cw-btn cw-btn-primary cw-btn-sm" :disabled="savingDensity || runtime?.view.busy || runtime?.view.updating" @click="saveDensity">保存生成量</button>
        </div>
      </div>

      <!-- 3. 消息与动态历史搜索 (F04) -->
      <div v-else-if="currentTab === 'history'" class="cw-settings-pane" :class="{ 'cw-pane-empty': filteredHistory.length === 0 }">
        <div class="cw-history-search-box">
          <input v-model="historyKeyword" placeholder="搜索已保存消息或动态关键字..." class="cw-density-input" />
        </div>

        <div v-if="filteredHistory.length > 0" class="cw-history-list">
          <div v-for="h in historyPage" :key="h.id" class="cw-history-item">
            <div class="cw-hist-top">
              <span class="cw-hist-author">{{ h.senderName }}</span>
              <span class="cw-hist-time">{{ h.time }}</span>
            </div>
            <div class="cw-hist-content">{{ h.previewText }}</div>
          </div>

          <div v-if="historyPages > 1" class="cw-tx-pagination" style="display: flex; gap: 8px; justify-content: center; align-items: center;">
            <button class="cw-btn cw-btn-ghost cw-btn-xs" :disabled="historyIndex === 0" @click="historyIndex--">上一页</button>
            <span style="font-size: 11px;">{{ historyIndex + 1 }} / {{ historyPages }}</span>
            <button class="cw-btn cw-btn-ghost cw-btn-xs" :disabled="historyIndex + 1 >= historyPages" @click="historyIndex++">下一页</button>
          </div>
        </div>
        <div v-else class="cw-empty-backdrop">
          <SvgIcon name="search" :size="32" class="cw-empty-icon" />
          <div class="cw-empty-title">无匹配历史记录</div>
          <div class="cw-empty-desc">{{ historyKeyword ? `未找到与“${historyKeyword}”相关的消息或动态` : '当前尚未归档任何通讯或社区历史' }}</div>
          <button v-if="historyKeyword" class="cw-btn cw-btn-ghost cw-btn-xs cw-empty-action" @click="historyKeyword = ''">清除搜索词</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, watch } from 'vue';
import { RuntimeKey, type Runtime } from '../../../../../运行/host';
import { useWorldState } from '../../../utils/context';
import { managePhone } from '../../../../../运行/phone-management';
import { phoneProjection, blockText, byNewest } from '../../../../../运行/phone';
import SvgIcon from '../../icons/SvgIcon.vue';

const state = useWorldState();
const runtime = inject<Runtime | null>(RuntimeKey, null);
const emit = defineEmits<{ (e: 'back'): void; (e: 'feedback', msg: string): void }>();

const tabs = [
  { key: 'account', label: '我的账号', icon: 'user' },
  { key: 'history', label: '历史搜索', icon: 'clock' },
];
const currentTab = ref<'account' | 'history'>('account');

// 1. API 与生成量
const density = ref(runtime?.view.data?._系统?.生成密度 ?? '标准');
const savingDensity = ref(false);

async function saveDensity() {
  if (!runtime) {
    emit('feedback', '离线展示不保存设置');
    return;
  }
  savingDensity.value = true;
  try {
    await runtime.commit(s => {
      s._系统.生成密度 = density.value;
    });
    emit('feedback', '生成量已保存，将在下次手机操作时使用');
  } catch (cause) {
    emit('feedback', String(cause));
  } finally {
    savingDensity.value = false;
  }
}

// 2. 本人账号管理
const newPlatform = ref('邻信');
const newAccountName = ref('');

const myAccountsList = computed(() => {
  const accounts = state.value?.手机?.账号 || {};
  const playerId = state.value?.玩家?.id;
  return Object.entries(accounts)
    .filter(([, a]: any) => a.人物id === playerId)
    .map(([id, a]: any) => ({
      id,
      ...a,
    }));
});

async function handleCreateAccount() {
  if (!runtime) {
    emit('feedback', '离线展示不保存账号');
    return;
  }
  try {
    await runtime.commit(s => managePhone(s, 'createAccount', newPlatform.value, newAccountName.value.trim()));
    newAccountName.value = '';
    emit('feedback', `已成功开通本人${newPlatform.value}账号`);
  } catch (e: any) {
    emit('feedback', String(e.message || e));
  }
}

// 3. 历史记录查询
const historyKeyword = ref('');
const historyIndex = ref(0);

const filteredHistory = computed(() => {
  const pLinxin = phoneProjection(state.value, '邻信', true);
  const pWeilan = phoneProjection(state.value, '微澜', true);
  const messages = Object.values(pLinxin.messagesMap || {}).flat().map((m: any) => ({
    id: m.id,
    senderName: m.senderName,
    time: m.time,
    previewText: blockText(m.blocks),
    故事时间: m.故事时间,
  }));
  const posts = [...(pLinxin.posts || []), ...(pWeilan.posts || [])].map((p: any) => ({
    id: p.id,
    senderName: p.authorName,
    time: p.time,
    previewText: p.content,
    故事时间: p.故事时间,
  }));

  const all = [...messages, ...posts].sort(byNewest);
  if (!historyKeyword.value.trim()) return all;
  const kw = historyKeyword.value.trim().toLowerCase();
  return all.filter(item =>
    item.senderName?.toLowerCase().includes(kw) ||
    item.previewText?.toLowerCase().includes(kw)
  );
});

const historyPages = computed(() => Math.max(1, Math.ceil(filteredHistory.value.length / 15)));
const historyPage = computed(() =>
  filteredHistory.value.slice(historyIndex.value * 15, (historyIndex.value + 1) * 15)
);
watch(historyKeyword, () => { historyIndex.value = 0; }, { flush: 'sync' });
watch(historyPages, count => {
  historyIndex.value = Math.max(0, Math.min(historyIndex.value, count - 1));
}, { flush: 'sync' });
</script>

<style scoped lang="scss">
.cw-phone-settings-app {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--cw-bg-surface);
  color: var(--cw-text-primary);
}

.cw-app-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--cw-border);
  background: var(--cw-bg-card-subtle);

  .cw-header-title {
    font-size: 15px;
    font-weight: 600;
  }
}

.cw-settings-tabs {
  display: flex;
  border-bottom: 1px solid var(--cw-border);
  background: var(--cw-bg-surface);

  .cw-st-tab-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 0;
    border: none;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--cw-text-secondary);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;

    &.active {
      color: var(--cw-accent);
      border-bottom-color: var(--cw-accent);
      font-weight: 600;
    }
  }
}

.cw-settings-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
}

.cw-settings-pane {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
  min-height: 0;
}

.cw-pane-desc {
  font-size: 12px;
  color: var(--cw-text-muted);
  line-height: 1.5;
  margin: 0;
}

.cw-density {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 14px;
  border-top: 1px solid var(--cw-border);

  .cw-density-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 500;
  }
}

.cw-density-select,
.cw-density-input {
  padding: 6px 10px;
  border-radius: var(--cw-radius-sm);
  border: 1px solid var(--cw-border);
  background: var(--cw-bg-main);
  color: var(--cw-text-primary);
  font-size: 12px;
  outline: none;

  &:focus {
    border-color: var(--cw-accent);
  }
}

.cw-section-title {
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 6px;
}

.cw-account-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;

  .cw-acc-item-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-radius: var(--cw-radius);
    background: var(--cw-bg-card);
    border: 1px solid var(--cw-border);

    .cw-acc-info {
      display: flex;
      align-items: center;
      gap: 8px;

      .cw-acc-plat-badge {
        padding: 2px 6px;
        border-radius: var(--cw-radius-sm);
        background: var(--cw-accent-bg);
        color: var(--cw-accent);
        font-size: 11px;
        font-weight: 600;
      }
      .cw-acc-name {
        font-size: 13px;
        font-weight: 600;
      }
      .cw-acc-id {
        font-size: 11px;
        color: var(--cw-text-muted);
      }
    }

    .cw-acc-status {
      font-size: 11px;
      color: var(--cw-success);
    }
  }
}

.cw-create-acc-box {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);

  .cw-acc-form-row {
    display: flex;
    align-items: center;
    gap: 8px;

    .cw-form-k {
      width: 70px;
      font-size: 12px;
      color: var(--cw-text-secondary);
    }
  }
}

.cw-history-search-box {
  margin-bottom: 10px;

  .cw-density-input {
    width: 100%;
    box-sizing: border-box;
  }
}

.cw-history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;

  .cw-history-item {
    padding: 10px 12px;
    border-radius: var(--cw-radius-sm);
    background: var(--cw-bg-card);
    border: 1px solid var(--cw-border);
    display: flex;
    flex-direction: column;
    gap: 4px;

    .cw-hist-top {
      display: flex;
      justify-content: space-between;

      .cw-hist-author {
        font-size: 12px;
        font-weight: 600;
        color: var(--cw-accent);
      }
      .cw-hist-time {
        font-size: 11px;
        color: var(--cw-text-muted);
      }
    }

    .cw-hist-content {
      font-size: 12px;
      color: var(--cw-text-primary);
      line-height: 1.4;
    }
  }
}

.cw-empty-sub {
  font-size: 12px;
  color: var(--cw-text-muted);
  text-align: center;
  padding: 20px 0;
}

.cw-empty-backdrop {
  flex: 1;
  width: 100%;
  min-height: 180px;
  box-sizing: border-box;
  margin: 0;
  padding: 32px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  border: none;
  border-radius: 0;
  background: transparent;

  .cw-empty-icon {
    color: var(--cw-text-muted);
    opacity: 0.35;
    margin-bottom: 12px;
  }

  .cw-empty-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--cw-text-secondary);
    margin-bottom: 6px;
  }

  .cw-empty-desc {
    font-size: 12px;
    color: var(--cw-text-muted);
    line-height: 1.6;
    max-width: 260px;
  }

  .cw-empty-action {
    margin-top: 14px;
  }
}

.cw-empty-compact {
  padding: 10px 14px;
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
