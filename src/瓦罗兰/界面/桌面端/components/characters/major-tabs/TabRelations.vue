<template>
  <div class="cw-tab-pane cw-char-tab-relations">
    <!-- 1. 置顶突出：与玩家本人的羁绊关系 (解决问题 18) -->
    <div v-if="playerRelation" class="cw-player-bond-card">
      <div class="cw-bond-header">
        <div class="cw-bond-title">
          <SvgIcon name="heart" :size="16" class="cw-text-accent" />
          <span>与我的羁绊关系</span>
          <span class="cw-badge cw-badge-accent">{{ playerRelation.关系 ?? '关系未设定' }}</span>
        </div>
        <div class="cw-bond-metrics">
          <span class="cw-metric cw-bond-favor" tabindex="0" :data-cw-tooltip="favorDescription(playerRelation.好感度)" data-cw-tooltip-touch>好感度：{{ playerRelation.好感度 ?? '未知' }}</span>
          <span class="cw-metric cw-bond-trust" tabindex="0" :data-cw-tooltip="trustDescription(playerRelation.信任度)" data-cw-tooltip-touch>信任度：{{ playerRelation.信任度 ?? '未知' }}</span>
        </div>
      </div>

      <div
        v-if="playerRelation.当前定位 || playerRelation.防御姿态 || (playerRelation.破壁阶段 !== null && playerRelation.破壁阶段 !== undefined)"
        class="cw-rel-dynamics"
      >
        <span v-if="playerRelation.当前定位" class="cw-dyn-tag" tabindex="0" :data-cw-tooltip="relationPositionDescription" data-cw-tooltip-touch>定位：{{ playerRelation.当前定位 }}</span>
        <span v-if="playerRelation.防御姿态" class="cw-dyn-tag cw-dyn-defense" tabindex="0" :data-cw-tooltip="relationBoundaryDescription" data-cw-tooltip-touch>交往边界：{{ playerRelation.防御姿态 }}</span>
        <span v-if="playerRelation.破壁阶段 !== null && playerRelation.破壁阶段 !== undefined" class="cw-dyn-tag cw-dyn-break" tabindex="0" :data-cw-tooltip="privateLifeStageDescription(playerRelation.破壁阶段)" data-cw-tooltip-touch>
          破壁 {{ privateLifeStageLabel(playerRelation.破壁阶段) }}
        </span>
      </div>

      <p v-if="playerRelation.关系备注" class="cw-bond-desc">{{ playerRelation.关系备注 }}</p>
      <div v-if="playerRelation.已知私密 && playerRelation.已知私密.length > 0" class="cw-rel-secrets">
        <span class="cw-secrets-label" tabindex="0" :data-cw-tooltip="knownSecretsDescription" data-cw-tooltip-touch>你已知的对方私密：</span>
        <span v-for="(sec, sIdx) in playerRelation.已知私密" :key="sIdx" class="cw-badge cw-badge-secret">{{ sec }}</span>
      </div>
    </div>

    <!-- 2. 与其他角色的社交关系网 -->
    <div class="cw-relations-card">
      <h4 class="cw-section-title">
        <SvgIcon name="users" :size="16" />
        <span>都市社交关系网 ({{ otherRelations.length }} 位交集人物)</span>
      </h4>

      <div v-if="otherRelations.length > 0" class="cw-rel-card-grid">
        <div v-for="rel in otherRelations" :key="rel.targetId" class="cw-relation-item-card">
          <div class="cw-rel-top">
            <div class="cw-rel-user">
              <span class="cw-target-name">{{ rel.targetName }}</span>
              <span class="cw-badge cw-badge-subtle">{{ rel.关系 ?? '关系未设定' }}</span>
            </div>
            <div class="cw-rel-metrics">
              <span class="cw-metric" tabindex="0" :data-cw-tooltip="favorDescription(rel.好感度)" data-cw-tooltip-touch>好感: {{ rel.好感度 == null ? '未知' : rel.好感度 }}</span>
              <span class="cw-metric cw-trust" tabindex="0" :data-cw-tooltip="trustDescription(rel.信任度)" data-cw-tooltip-touch>信任: {{ rel.信任度 ?? '未知' }}</span>
            </div>
          </div>
          <div v-if="rel.当前定位 || rel.防御姿态 || (rel.破壁阶段 !== null && rel.破壁阶段 !== undefined)" class="cw-rel-dynamics">
            <span v-if="rel.当前定位" class="cw-dyn-tag" tabindex="0" :data-cw-tooltip="relationPositionDescription" data-cw-tooltip-touch>定位：{{ rel.当前定位 }}</span>
            <span v-if="rel.防御姿态" class="cw-dyn-tag cw-dyn-defense" tabindex="0" :data-cw-tooltip="relationBoundaryDescription" data-cw-tooltip-touch>交往边界：{{ rel.防御姿态 }}</span>
            <span v-if="rel.破壁阶段 !== null && rel.破壁阶段 !== undefined" class="cw-dyn-tag cw-dyn-break" tabindex="0" :data-cw-tooltip="privateLifeStageDescription(rel.破壁阶段)" data-cw-tooltip-touch>
              破壁 {{ privateLifeStageLabel(rel.破壁阶段) }}
            </span>
          </div>
          <p v-if="rel.关系备注" class="cw-rel-desc">{{ rel.关系备注 }}</p>
          <div v-if="rel.已知私密 && rel.已知私密.length > 0" class="cw-rel-secrets">
            <span class="cw-secrets-label" tabindex="0" :data-cw-tooltip="knownSecretsDescription" data-cw-tooltip-touch>{{ rel.targetName }}已知的本角色私密：</span>
            <span v-for="(sec, sIdx) in rel.已知私密" :key="sIdx" class="cw-badge cw-badge-secret">{{ sec }}</span>
          </div>
        </div>
      </div>
      <div v-else class="cw-empty-compact">
        <SvgIcon name="users" :size="16" class="cw-empty-icon" />
        <span>暂未记录与其他市民的特殊交往档案</span>
      </div>
    </div>

    <!-- 3. 主观印象与事实认知 -->
    <div class="cw-cognition-card">
      <h4 class="cw-section-title">
        <SvgIcon name="bookmark" :size="16" />
        <span>主观印象与事实认知</span>
      </h4>

      <div v-if="cognitionsList.length > 0" class="cw-cognition-list">
        <div v-for="cog in cognitionsList" :key="cog.id" class="cw-cog-item">
          <div class="cw-cog-header">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="cw-cog-subject">{{ resolveEntityName(worldState, cog.对象id) || cog.对象 || cog.主题 || cog.id }}</span>
              <span class="cw-badge" :class="getNatureBadgeClass(cog.性质)">
                {{ cog.性质 || '未确认' }}
              </span>
            </div>
            <span v-if="cog.来源?.方式" class="cw-badge">{{ cog.来源.方式 }}</span>
          </div>
          <p class="cw-cog-content">{{ formatContent(cog) }}</p>
        </div>
      </div>
      <div v-else class="cw-empty-compact">
        <SvgIcon name="bookmark" :size="16" class="cw-empty-icon" />
        <span>暂无收录的独立认知条目</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useWorldState } from '../../../utils/context';
import { resolveEntityName } from '../../../utils/entity';
import {
  favorDescription,
  trustDescription,
  privateLifeStageLabel,
  privateLifeStageDescription,
  relationPositionDescription,
  relationBoundaryDescription,
  knownSecretsDescription,
} from '../../../utils/relationship-labels';
const worldState = useWorldState();
import SvgIcon from '../../icons/SvgIcon.vue';

const props = defineProps<{
  char: any;
  allCharacters?: Record<string, any>;
}>();

function getNatureBadgeClass(nature: string) {
  switch (nature) {
    case '事实':
      return 'cw-badge-success';
    case '推测':
      return 'cw-badge-warning';
    case '误解':
      return 'cw-badge-danger';
    default:
      return 'cw-badge-info';
  }
}

function formatContent(cog: any): string {
  if (!cog) return '暂无认知详情';
  if (typeof cog === 'string') return cog;
  if (typeof cog === 'object') {
    const text = cog.内容 || cog.印象 || cog.描述;
    if (typeof text === 'string' && text.trim()) return text;
    return '暂无认知详情';
  }
  return String(cog);
}

const playerRelation = computed(() => {
  const net = props.char?.关系网;
  if (!net || typeof net !== 'object') return null;
  const playerId = worldState?.value?.玩家?.id;
  if (playerId && net[playerId]) {
    return {
      targetId: playerId,
      targetName: worldState.value.玩家.姓名 || '我',
      ...net[playerId],
    };
  }
  return null;
});

const otherRelations = computed(() => {
  const net = props.char?.关系网;
  if (!net || typeof net !== 'object') return [];
  const playerId = worldState?.value?.玩家?.id;
  return Object.entries(net)
    .filter(([targetId]) => targetId !== playerId)
    .map(([targetId, val]: [string, any]) => {
      const targetName =
        props.allCharacters?.[targetId]?.基础信息?.姓名 ??
        props.allCharacters?.[targetId]?.姓名 ??
        val.姓名 ??
        '资料已移除';
      return {
        targetId,
        targetName,
        ...val,
      };
    });
});

const cognitionsList = computed(() => {
  const cog = props.char?.认知;
  if (!cog || typeof cog !== 'object') return [];
  return Object.entries(cog).map(([id, val]: [string, any]) => ({
    id,
    ...(typeof val === 'object' ? val : { 内容: val }),
  }));
});
</script>

<style scoped lang="scss">
.cw-char-tab-relations {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 置顶突出：与玩家的羁绊卡片 (解决问题 18) */
.cw-player-bond-card {
  padding: 16px 20px;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card);
  border: 1px solid var(--cw-accent-border, var(--cw-accent));
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  gap: 10px;

  .cw-bond-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    padding-bottom: 10px;
    border-bottom: 1px dashed var(--cw-border);

    .cw-bond-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 15px;
      font-weight: 700;
      color: var(--cw-text-primary);
    }

    .cw-bond-metrics {
      display: flex;
      align-items: center;
      gap: 10px;

      .cw-metric {
        padding: 4px 10px;
        border-radius: var(--cw-radius-full);
        font-size: 12px;
        font-weight: 600;

        &.cw-bond-favor {
          background: rgba(229, 153, 178, 0.15);
          color: #e599b2;
          border: 1px solid rgba(229, 153, 178, 0.35);
        }

        &.cw-bond-trust {
          background: var(--cw-accent-bg);
          color: var(--cw-accent);
          border: 1px solid var(--cw-accent-border);
        }
      }
    }
  }

  .cw-bond-desc {
    margin: 0;
    font-size: 13px;
    color: var(--cw-text-primary);
    line-height: 1.6;
    background: var(--cw-bg-card-subtle);
    padding: 10px 12px;
    border-radius: var(--cw-radius-sm);
  }
}

.cw-relations-card,
.cw-cognition-card {
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

.cw-rel-card-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.cw-relation-item-card {
  padding: 12px 14px;
  border-radius: var(--cw-radius-sm);
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);
  display: flex;
  flex-direction: column;
  gap: 8px;

  .cw-rel-top {
    display: flex;
    align-items: center;
    justify-content: space-between;

    .cw-rel-user {
      display: flex;
      align-items: center;
      gap: 6px;

      .cw-target-name {
        font-weight: 600;
        font-size: 13px;
        color: var(--cw-text-primary);
      }
    }

    .cw-rel-metrics {
      display: flex;
      gap: 8px;
      font-size: 12px;
      font-family: monospace, sans-serif;
      font-weight: 600;

      .cw-metric {
        color: var(--cw-accent);
      }
      .cw-trust {
        color: var(--cw-info);
      }
    }
  }

  .cw-rel-desc {
    margin: 0;
    font-size: 12px;
    color: var(--cw-text-secondary);
    line-height: 1.5;
  }
}

.cw-cognition-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cw-cog-item {
  padding: 10px 14px;
  border-radius: var(--cw-radius-sm);
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);

  .cw-cog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;

    .cw-cog-subject {
      font-weight: 600;
      font-size: 13px;
      color: var(--cw-text-primary);
    }
  }

  .cw-cog-content {
    margin: 0;
    font-size: 12px;
    color: var(--cw-text-secondary);
    line-height: 1.5;
  }
}

.cw-empty-sub {
  font-size: 13px;
  color: var(--cw-text-muted);
  text-align: center;
  padding: 16px 0;
}
.cw-rel-card-grid {
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
}
.cw-relation-item-card .cw-rel-top {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}
.cw-relation-item-card .cw-rel-top .cw-rel-user {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}
.cw-relation-item-card .cw-rel-top .cw-rel-user .cw-target-name {
  font-weight: 600;
  font-size: 13px;
  color: var(--cw-text-primary);
}
.cw-relation-item-card .cw-rel-top .cw-rel-user .cw-rel-badge {
  font-size: 11px;
  line-height: 1.3;
}
.cw-relation-item-card .cw-rel-top .cw-rel-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.cw-metric {
  padding: 6px 8px;
  border: 1px solid var(--cw-border);
  border-radius: 6px;
  white-space: nowrap;
  font-size: 11px;
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

.cw-rel-dynamics {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;

  .cw-dyn-tag {
    font-size: 11px;
    padding: 2px 6px;
    border-radius: var(--cw-radius-sm);
    background: var(--cw-bg-card);
    border: 1px solid var(--cw-border);
    color: var(--cw-text-secondary);

    &.cw-dyn-defense {
      border-color: rgba(229, 153, 178, 0.4);
      color: #e599b2;
    }
    &.cw-dyn-break {
      border-color: rgba(156, 220, 254, 0.4);
      color: #9cdcfe;
      font-weight: 500;
    }
  }
}

.cw-rel-secrets {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed var(--cw-border);

  .cw-secrets-label {
    font-size: 11px;
    color: var(--cw-text-muted);
  }

  .cw-badge-secret {
    background: rgba(206, 145, 120, 0.15);
    color: #ce9178;
    border: 1px solid rgba(206, 145, 120, 0.3);
    font-size: 11px;
    padding: 1px 6px;
    border-radius: var(--cw-radius-sm);
  }
}
</style>
