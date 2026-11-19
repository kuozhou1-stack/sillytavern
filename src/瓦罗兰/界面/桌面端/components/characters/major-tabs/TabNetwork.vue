<template>
  <div class="cw-tab-pane cw-char-tab-network">
    <!-- 网络社交倾向六项行为偏好 -->
    <div class="cw-network-card">
      <h4 class="cw-section-title">
        <SvgIcon name="globe" :size="16" />
        <span>社交网络偏好与倾向</span>
      </h4>

      <div class="cw-pref-grid">
        <div class="cw-pref-item">
          <span class="cw-pref-k">网络身份</span>
          <span class="cw-pref-v">{{ getPref('网络身份') || '未知 / 未记录' }}</span>
        </div>
        <div class="cw-pref-item">
          <span class="cw-pref-k">发布偏好</span>
          <span class="cw-pref-v">{{ getPref('发布偏好') || '未知 / 未记录' }}</span>
        </div>
        <div class="cw-pref-item">
          <span class="cw-pref-k">公开边界</span>
          <span class="cw-pref-v">{{ getPref('公开边界') || '未知 / 未记录' }}</span>
        </div>
        <div class="cw-pref-item">
          <span class="cw-pref-k">互动风格</span>
          <span class="cw-pref-v">{{ getPref('互动风格') || '未知 / 未记录' }}</span>
        </div>
        <div class="cw-pref-item">
          <span class="cw-pref-k">常用平台</span>
          <span class="cw-pref-v">{{ getPref('常用平台') || '未知 / 未记录' }}</span>
        </div>
        <div class="cw-pref-item">
          <span class="cw-pref-k">活跃习惯</span>
          <span class="cw-pref-v">{{ getPref('活跃习惯') || '未知 / 未记录' }}</span>
        </div>
      </div>
    </div>

    <!-- 关联社交账号 -->
    <div class="cw-network-card">
      <h4 class="cw-section-title">
        <SvgIcon name="phone" :size="16" />
        <span>绑定的平台账号</span>
      </h4>

      <div v-if="hasAccounts" class="cw-account-cards-list">
        <div v-for="(acc, accId) in accounts" :key="accId" class="cw-acc-detail-card">
          <div class="cw-acc-header">
            <div class="cw-acc-plat">
              <SvgIcon :name="acc.平台?.includes('邻信') || acc.平台?.includes('微信') ? 'messageSquare' : 'globe'" :size="16" />
              <span class="cw-plat-name">{{ acc.平台 || '社交平台' }}</span>
            </div>
            <span class="cw-badge cw-badge-accent">{{ acc.账号名 || accId }}</span>
          </div>
          <div class="cw-acc-info">
            <div class="cw-acc-row">
              <span class="cw-k">昵称：</span>
              <span class="cw-v">{{ acc.昵称 || '无特定昵称' }}</span>
            </div>
            <div v-if="acc.简介" class="cw-acc-row">
              <span class="cw-k">简介 / 签名：</span>
              <span class="cw-v">{{ acc.简介 }}</span>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="cw-empty-compact">
        <SvgIcon name="globe" :size="15" class="cw-empty-icon" />
        <span>尚未知晓其公开社交平台账号</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useWorldState } from '../../../utils/context';
const state = useWorldState();
import SvgIcon from '../../icons/SvgIcon.vue';

const props = defineProps<{
  char: any;
}>();

function getPref(key: string) {
  const prefs = props.char?.网络倾向;
  if (!prefs) return null;
  if (typeof prefs === 'string') return prefs;
  return prefs[key] || prefs.通用?.[key] || null;
}

const accounts = computed(() => {
  const id = Object.keys(state.value.角色).find(id => state.value.角色[id] === props.char);
  return Object.fromEntries(Object.entries(state.value.手机.账号).filter(([, a]: any) => a.人物id === id));
});

const hasAccounts = computed(() => Object.keys(accounts.value).length > 0);
</script>

<style scoped lang="scss">
.cw-char-tab-network {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cw-network-card {
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

.cw-pref-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;

  .cw-pref-item {
    padding: 10px 14px;
    border-radius: var(--cw-radius-sm);
    background: var(--cw-bg-card-subtle);
    border: 1px solid var(--cw-border);
    display: flex;
    flex-direction: column;
    gap: 4px;

    .cw-pref-k {
      font-size: 11px;
      color: var(--cw-text-muted);
    }
    .cw-pref-v {
      font-size: 13px;
      font-weight: 500;
      color: var(--cw-text-primary);
      line-height: 1.4;
    }
  }
}

.cw-account-cards-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cw-acc-detail-card {
  padding: 12px 14px;
  border-radius: var(--cw-radius-sm);
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);
  display: flex;
  flex-direction: column;
  gap: 8px;

  .cw-acc-header {
    display: flex;
    align-items: center;
    justify-content: space-between;

    .cw-acc-plat {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 600;
      color: var(--cw-text-primary);
    }
  }

  .cw-acc-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;

    .cw-acc-row {
      display: flex;
      gap: 6px;

      .cw-k {
        color: var(--cw-text-muted);
        width: 70px;
        flex-shrink: 0;
      }
      .cw-v {
        color: var(--cw-text-primary);
      }
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
