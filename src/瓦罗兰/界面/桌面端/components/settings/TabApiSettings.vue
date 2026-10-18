<template>
  <div class="cw-api-settings-view">
    <!-- 1. 通用说明集中展示容器 -->
    <div class="cw-callout cw-callout-info cw-api-common-banner">
      <SvgIcon name="info" :size="16" class="cw-callout-icon" />
      <div class="cw-callout-body">
        <span class="cw-callout-title">配置存储与跨端共用</span>
        <p>瓦罗兰配置独立保存在酒馆与当前浏览器，重新导卡后可复用。电脑与手机使用同一酒馆账号；另一端已打开时，可点击对应配置区的“读取共用配置”。</p>
        <p class="cw-api-flow-note">流程机制：玩家消息先保存，资料选择 API 按剧情选择地点与组织资料，准备完成后生成正文，最后独立结算变量；角色启停沿用瓦罗兰现有调度。</p>
      </div>
    </div>

    <!-- 顶部快捷控制：展开/收起全部 -->
    <div class="cw-api-quick-bar">
      <span class="cw-api-count-hint">共 3 组接口通道，各通道独立配置与保存</span>
      <div class="cw-api-quick-actions">
        <button
          type="button"
          class="cw-btn cw-btn-ghost cw-btn-sm"
          @click="toggleAll(true)"
        >
          全部展开
        </button>
        <button
          type="button"
          class="cw-btn cw-btn-ghost cw-btn-sm"
          @click="toggleAll(false)"
        >
          全部收起
        </button>
      </div>
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
        <header
          class="cw-accordion-header"
          tabindex="0"
          role="button"
          :aria-expanded="expanded[sec.channel]"
          @click="toggleSection(sec.channel)"
          @keydown.enter.space.prevent="toggleSection(sec.channel)"
        >
          <div class="cw-header-left">
            <div class="cw-channel-icon-badge">
              <SvgIcon :name="sec.icon" :size="16" />
            </div>
            <div class="cw-channel-titles">
              <div class="cw-channel-title-row">
                <h4 class="cw-channel-name">{{ sec.title }}</h4>
                <span class="cw-badge cw-channel-summary-badge">
                  {{ getSummaryBadge(sec.channel) }}
                </span>
              </div>
              <span class="cw-channel-desc">{{ sec.desc }}</span>
            </div>
          </div>

          <div class="cw-header-right">
            <SvgIcon
              :name="expanded[sec.channel] ? 'chevronUp' : 'chevronDown'"
              :size="16"
              class="cw-chevron-icon"
            />
          </div>
        </header>

        <!-- 卡片展开主体内容 (v-show 保留各表单实例和未保存草稿) -->
        <div v-show="expanded[sec.channel]" class="cw-accordion-body">
          <!-- 专属说明容器 -->
          <div class="cw-callout cw-callout-info cw-channel-notice">
            <SvgIcon name="info" :size="14" class="cw-callout-icon" />
            <div class="cw-callout-body">
              <p>{{ sec.specificNote }}</p>
            </div>
          </div>

          <!-- 独立表单与专属操作栏 (传递 hide-notice=true 避免重复通用说明) -->
          <ExtraApiForm
            :channel="sec.channel"
            :hide-notice="true"
            @feedback="emit('feedback', $event)"
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
const emit = defineEmits<{ (e: 'feedback', msg: string): void }>();
const runtime = inject<Runtime | null>(RuntimeKey, null);

interface ApiSectionConfig {
  channel: ApiChannel;
  title: string;
  desc: string;
  icon: string;
  specificNote: string;
}

const sections: ApiSectionConfig[] = [
  {
    channel: 'variable',
    title: '正文变量 API',
    desc: '正文完整输出后，依规则自动统一结算全部状态变量',
    icon: 'terminal',
    specificNote:
      '正文由酒馆主模型生成。正文完整输出后，此 API 读取变量更新规则，统一更新全部需要变化的变量。与手机及奇遇读取同一份状态，各自触发。变量更新失败保留正文，可重试变量阶段。',
  },
  {
    channel: 'phone',
    title: '手机与奇遇共用 API',
    desc: '手机发送/发布/互动，以及奇遇任务与商店新品生成',
    icon: 'sparkles',
    specificNote:
      '手机发送、发布、互动和刷新，以及奇遇首次开启后的随机内容生成、任务和商店刷新，共用这一份连接配置，与正文变量 API 分开。手机操作按变量规则结算；奇遇刷新只生成可选任务或商店新品，不推进时间、不执行玩家行动、不改余额和已接取任务。浏览与保存设置不会请求生成。',
  },
  {
    channel: 'information',
    title: '资料选择 API',
    desc: '选择剧情相关的地点与组织资料，支持复用正文连接',
    icon: 'mapPin',
    specificNote:
      '玩家消息先保存，资料选择 API 按剧情选择地点与组织资料，准备完成后生成正文，最后独立结算变量；角色启停沿用瓦罗兰现有调度。可明确选择复用正文变量连接，或独立配置端点和模型。此请求使用专用资料选择提示词；保存配置不会生成内容。',
  },
];

// 默认展开第一个，保持用户聚焦；其余分区折叠但保留状态
const expanded = reactive<Record<ApiChannel, boolean>>({
  variable: true,
  phone: false,
  information: false,
});

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
  const cfg = runtime.settings[channel];
  if (channel === 'information') {
    const infoCfg = cfg as any;
    if (infoCfg?.reuseVariable) {
      return `复用正文: ${runtime.settings.variable.model || '未配置'}`;
    }
  }
  return cfg?.model ? `模型: ${cfg.model}` : '未配置模型';
}
</script>

<style scoped lang="scss">
.cw-api-settings-view {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cw-api-common-banner {
  margin-bottom: 2px;
}

.cw-api-quick-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
  font-size: 12px;
  color: var(--cw-text-secondary);

  .cw-api-count-hint {
    color: var(--cw-text-muted);
  }

  .cw-api-quick-actions {
    display: flex;
    gap: 6px;
  }
}

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
