<template>
  <div class="cw-api-settings-view">
    <div class="cw-api-quick-bar">
      <span>各通道单独保存，同一酒馆账号可跨端读取。</span>
      <button type="button" class="cw-btn cw-btn-secondary cw-btn-sm" @click="toggleAll(!allExpanded)">
        {{ allExpanded ? '全部收起' : '全部展开' }}
      </button>
    </div>

    <!-- 2. 三类 API 折叠配置分区 -->
    <div class="cw-api-sections-list">
      <div
        v-for="sec in sections"
        :key="sec.channel"
        class="cw-api-accordion-card"
        :class="{ 'is-expanded': expanded[sec.channel] }"
      >
        <!-- 卡片头部 (点击折叠/展开) -->
        <button
          type="button"
          class="cw-accordion-header"
          :aria-expanded="expanded[sec.channel]"
          @click="toggleSection(sec.channel)"
        >
          <span class="cw-header-left">
            <span class="cw-channel-icon-badge">
              <SvgIcon :name="sec.icon" :size="16" />
            </span>
            <span class="cw-channel-titles">
              <span class="cw-channel-title-row">
                <strong class="cw-channel-name">{{ sec.title }}</strong>
                <span class="cw-badge cw-channel-summary-badge">
                  {{ getSummaryBadge(sec.channel) }}
                </span>
              </span>
              <span class="cw-channel-desc">{{ sec.desc }}</span>
            </span>
          </span>

          <span class="cw-header-right">
            <SvgIcon
              :name="expanded[sec.channel] ? 'chevronUp' : 'chevronDown'"
              :size="16"
              class="cw-chevron-icon"
            />
          </span>
        </button>

        <!-- 卡片展开主体内容 (v-show 保留各表单实例和未保存草稿) -->
        <div v-show="expanded[sec.channel]" class="cw-accordion-body">
          <ExtraApiForm
            :channel="sec.channel"
            :hide-notice="true"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed, inject, watch } from 'vue';
import { RuntimeKey, type Runtime } from '../../../../运行/host';
import type { ApiChannel } from '../../../../运行/settings';
import SvgIcon from '../icons/SvgIcon.vue';
import ExtraApiForm from './ExtraApiForm.vue';

const props = defineProps<{ initialSection?: ApiChannel }>();
const runtime = inject<Runtime | null>(RuntimeKey, null);

interface ApiSectionConfig {
  channel: ApiChannel;
  title: string;
  desc: string;
  icon: string;
}

const sections: ApiSectionConfig[] = [
  {
    channel: 'variable',
    title: '正文变量 API',
    desc: '选择随正文更新，或生成后独立结算',
    icon: 'terminal',
  },
  {
    channel: 'phone',
    title: '手机与奇遇共用 API',
    desc: '手机互动、奇遇任务和商店刷新共用此连接',
    icon: 'sparkles',
  },
  {
    channel: 'information',
    title: '资料选择 API',
    desc: '在生成前为本轮剧情挑选相关资料',
    icon: 'mapPin',
  },
];

// 从设置页进入时全部折叠，指定通道的快捷入口直接展开目标。
const expanded = reactive<Record<ApiChannel, boolean>>({
  variable: false,
  phone: false,
  information: false,
});

const allExpanded = computed(() => sections.every(({ channel }) => expanded[channel]));

watch(() => props.initialSection, val => {
  if (val) {
    expanded.variable = val === 'variable';
    expanded.phone = val === 'phone';
    expanded.information = val === 'information';
  }
}, { immediate: true });

function toggleSection(ch: ApiChannel) {
  expanded[ch] = !expanded[ch];
}

function toggleAll(open: boolean) {
  sections.forEach(s => {
    expanded[s.channel] = open;
  });
}

function getSummaryBadge(channel: ApiChannel): string {
  if (!runtime) return '离线状态';
  if (channel === 'variable' && !runtime.settings.variable.independent) return '正文同次更新';
  const followsVariable = channel === 'information' && runtime.settings.information.reuseVariable;
  const cfg = followsVariable ? runtime.settings.variable : runtime.settings[channel];
  const connection = cfg.mode === 'main' ? '酒馆当前连接' : cfg.name || cfg.model || '未配置模型';
  const backups = cfg.mode === 'extra' && cfg.autoFailover && cfg.backups.length ? ` · ${cfg.backups.length} 个备用` : '';
  return (followsVariable ? '跟随正文变量 · ' : '') + connection + backups;
}
</script>

<style scoped lang="scss">
.cw-api-settings-view {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cw-api-quick-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 12px;
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius-sm);
  font-size: 12px;
  color: var(--cw-text-secondary);
}
.cw-api-quick-bar .cw-btn-secondary { flex-shrink: 0; min-height: 32px; background: var(--cw-bg-surface); border: 1px solid var(--cw-border-hover); color: var(--cw-text-primary); }

.cw-api-sections-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cw-api-accordion-card {
  background: var(--cw-bg-card);
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius);
  overflow: hidden;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;

  &.is-expanded {
    border-color: var(--cw-accent-border, var(--cw-border-hover));
    box-shadow: var(--cw-shadow-sm);
  }

  .cw-accordion-header {
    width: 100%;
    border: 0;
    text-align: left;
    font: inherit;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: var(--cw-bg-card-subtle);
    cursor: pointer;
    user-select: none;
    transition: background 0.15s ease;

    &:hover {
      background: var(--cw-bg-card-hover, rgba(0, 0, 0, 0.03));
    }

    &:focus-visible {
      outline: 2px solid var(--cw-accent);
      outline-offset: -2px;
    }

    .cw-header-left {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;

      .cw-channel-icon-badge {
        width: 32px;
        height: 32px;
        border-radius: var(--cw-radius-sm);
        background: var(--cw-accent-bg, rgba(192, 119, 54, 0.12));
        color: var(--cw-accent);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .cw-channel-titles {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;

        .cw-channel-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;

          .cw-channel-name {
            margin: 0;
            font-size: 14px;
            font-weight: 600;
            color: var(--cw-text-primary);
          }

          .cw-channel-summary-badge {
            font-size: 11px;
            font-weight: normal;
            max-width: 100%;
            overflow-wrap: anywhere;
            white-space: normal;
          }
        }

        .cw-channel-desc {
          font-size: 12px;
          color: var(--cw-text-muted);
          word-break: break-word;
          overflow-wrap: anywhere;
        }
      }
    }

    .cw-header-right {
      display: flex;
      align-items: center;
      color: var(--cw-text-secondary);
      flex-shrink: 0;
      margin-left: 8px;

      .cw-chevron-icon {
        transition: transform 0.2s ease;
      }
    }
  }

  .cw-accordion-body {
    padding: 14px 16px;
    border-top: 1px solid var(--cw-border);
    display: flex;
    flex-direction: column;
    gap: 14px;

    .cw-channel-notice {
      margin-bottom: 2px;
    }
  }
}
</style>
