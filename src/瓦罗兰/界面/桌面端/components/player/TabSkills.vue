<template>
  <div class="cw-tab-pane cw-tab-skills">
    <div class="cw-skills-heading">
      <h4><SvgIcon name="bolt" :size="16" /><span>已登记技能</span></h4>
      <span class="cw-skills-count">{{ skills.length }} 项</span>
    </div>

    <div v-if="skills.length" class="cw-skills-list">
      <article v-for="[id, skill] in skills" :key="id" class="cw-skill-card">
        <div class="cw-skill-header">
          <h5 class="cw-skill-name">{{ skill.名称 || '未命名技能' }}</h5>
          <span class="cw-skill-quality"><span>品质</span>{{ show(skill.品质) }}</span>
        </div>
        <p class="cw-skill-description">{{ show(skill.描述) }}</p>
      </article>
    </div>

    <div v-else class="cw-skills-empty-card">
      <div class="cw-empty-icon-halo">
        <SvgIcon name="sparkles" :size="32" class="cw-icon-sparkle" />
        <SvgIcon name="bolt" :size="22" class="cw-icon-bolt" />
      </div>
      <h5 class="cw-empty-title">尚未登记技能</h5>
      <p class="cw-empty-desc">
        这里记录玩家实际掌握的技能。尚未登记不代表没有能力；确认已有技能或在故事中实际学会后，再记录名称、品质与具体用途。
      </p>
      <div class="cw-empty-tips-grid">
        <div class="cw-tip-col">
          <SvgIcon name="compass" :size="14" />
          <span>已有技能</span>
        </div>
        <div class="cw-tip-col">
          <SvgIcon name="users" :size="14" />
          <span>实际学习</span>
        </div>
        <div class="cw-tip-col">
          <SvgIcon name="target" :size="14" />
          <span>具体用途</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ChengwanState } from '../../../store';
import { show } from '../../utils/context';
import SvgIcon from '../icons/SvgIcon.vue';

const props = defineProps<{
  player: { 技能栏?: ChengwanState['玩家']['技能栏'] };
}>();

// 直接展示统一状态中的技能，旧存档缺少技能栏时呈现空态。
const skills = computed(() => Object.entries(props.player?.技能栏 ?? {}));
</script>

<style scoped lang="scss">
.cw-tab-skills {
  min-width: 0;
}

.cw-skills-heading,
.cw-skill-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}

.cw-skills-heading {
  margin-bottom: 16px;

  h4 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    color: var(--cw-text-primary);
    font-size: 14px;
    font-weight: 600;
  }
}

.cw-skills-count {
  color: var(--cw-text-muted);
  font-size: 12px;
}

.cw-skills-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cw-skill-card {
  min-width: 0;
  padding: 16px 18px;
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card);
}

.cw-skill-name {
  flex: 1;
  min-width: 0;
  margin: 0;
  color: var(--cw-text-primary);
  font-size: 14px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.cw-skill-quality {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  max-width: 100%;
  padding: 3px 9px;
  border: 1px solid var(--cw-accent-border);
  border-radius: var(--cw-radius);
  background: var(--cw-accent-bg);
  color: var(--cw-accent);
  font-size: 12px;
  overflow-wrap: anywhere;

  span {
    flex-shrink: 0;
    font-weight: 600;
  }
}

.cw-skill-description {
  margin: 12px 0 0;
  color: var(--cw-text-secondary);
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.cw-skills-empty-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 36px 20px;
  border-radius: var(--cw-radius, 12px);
  background: var(--cw-bg-card);
  border: 1px dashed var(--cw-border);
  margin-top: 8px;

  .cw-empty-icon-halo {
    position: relative;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: var(--cw-accent-bg);
    border: 1px solid var(--cw-accent-border);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 14px;

    .cw-icon-sparkle {
      color: var(--cw-accent);
      opacity: 0.9;
    }

    .cw-icon-bolt {
      position: absolute;
      right: -2px;
      bottom: -2px;
      color: var(--cw-warning, #f59e0b);
      background: var(--cw-bg-surface);
      border-radius: 50%;
      padding: 3px;
      border: 1px solid var(--cw-border);
    }
  }

  .cw-empty-title {
    margin: 0 0 8px;
    font-size: 15px;
    font-weight: 700;
    color: var(--cw-text-primary);
  }

  .cw-empty-desc {
    max-width: 440px;
    margin: 0 0 20px;
    font-size: 12.5px;
    color: var(--cw-text-secondary);
    line-height: 1.6;
  }

  .cw-empty-tips-grid {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    flex-wrap: wrap;

    .cw-tip-col {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: var(--cw-radius-full, 9999px);
      background: var(--cw-bg-card-subtle);
      border: 1px solid var(--cw-border-subtle, rgba(0, 0, 0, 0.06));
      color: var(--cw-text-secondary);
      font-size: 12px;
      font-weight: 500;
    }
  }
}
</style>
