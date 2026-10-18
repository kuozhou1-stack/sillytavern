<template>
  <div class="cw-tab-pane cw-player-info-pane">
    <!-- 档案首栏：头像、姓名、基本信息卡 -->
    <div class="cw-profile-header-card">
      <div class="cw-profile-avatar">
        <CharacterAvatar :name="player?.姓名" :size="48" shape="rounded" />
      </div>
      <div class="cw-profile-titles">
        <div class="cw-name-row">
          <span class="cw-profile-name">{{ player?.姓名 || '玩家未设定' }}</span>
          <span v-if="player?.称呼" class="cw-profile-nickname">“{{ player.称呼 }}”</span>
          <span v-if="player?.性别" class="cw-badge cw-badge-accent">{{ player.性别 }}</span>
          <span v-if="player?.种族" class="cw-badge">{{ player.种族 }}</span>
          <span v-if="player?.年龄 != null" class="cw-badge">{{ player.年龄 }} 岁</span>
        </div>
        <div class="cw-sub-row">
          <div class="cw-sub-line cw-occupation-line">
            <span class="cw-sub-k">身份：</span>
            <OccupationTags :value="player?.身份?.身份" />
          </div>
          <div class="cw-sub-line cw-social-line">
            <span v-if="player?.身份?.社会身份" class="cw-sub-extra">· 社会身份：{{ player.身份.社会身份 }}</span>
            <span v-if="player?.身份?.工作或就读单位" class="cw-sub-extra">· {{ player.身份.工作或就读单位 }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 概览并排展示，长记录按类别切换 -->
    <div class="cw-info-sections">
      <!-- 外貌特征 -->
      <div class="cw-info-section cw-appearance-section">
        <h4 class="cw-section-title">
          <SvgIcon name="userCheck" :size="15" />
          <span>外貌与身形</span>
        </h4>
        <div class="cw-info-grid">
          <div class="cw-info-cell">
            <span class="cw-cell-k">身高</span>
            <span class="cw-cell-v">{{ player?.外貌?.身高 == null ? '未知' : player.外貌.身高 + ' cm' }}</span>
          </div>
          <div class="cw-info-cell">
            <span class="cw-cell-k">体重</span>
            <span class="cw-cell-v">{{ player?.外貌?.体重 == null ? '未知' : player.外貌.体重 + ' kg' }}</span>
          </div>
          <div class="cw-info-cell">
            <span class="cw-cell-k">体型</span>
            <span class="cw-cell-v">{{ player?.外貌?.体型 || '未设定' }}</span>
          </div>
          <div class="cw-info-cell">
            <span class="cw-cell-k">发型</span>
            <span class="cw-cell-v">{{ player?.外貌?.发型 || '未设定' }}</span>
          </div>
          <div class="cw-info-cell cw-cell-span2">
            <span class="cw-cell-k">显著特征</span>
            <span class="cw-cell-v">{{ player?.外貌?.显著特征 || '未知' }}</span>
          </div>
        </div>

        <!-- 整体描述独立阅读段落 -->
        <div v-if="player?.外貌?.整体外貌描述" class="cw-prose-field-block">
          <div class="cw-field-sub-header">
            <span class="cw-field-sub-title">整体外貌描述</span>
          </div>
          <p class="cw-prose-paragraph">{{ player.外貌.整体外貌描述 }}</p>
        </div>
      </div>

      <!-- 生平背景（单栏卡片流阅读排版，避免固定宽度标签挤压正文） -->
      <div class="cw-info-section cw-background-section">
        <h4 class="cw-section-title">
          <SvgIcon name="calendar" :size="15" />
          <span>成长与生平背景</span>
        </h4>
        <div class="cw-background-list">
          <div v-if="player?.背景?.成长背景" class="cw-background-item">
            <div class="cw-bg-item-header">
              <span class="cw-bg-item-title">成长背景</span>
            </div>
            <p class="cw-prose-paragraph">{{ player.背景.成长背景 }}</p>
          </div>
          <div v-if="player?.背景?.家庭背景" class="cw-background-item">
            <div class="cw-bg-item-header">
              <span class="cw-bg-item-title">家庭背景</span>
            </div>
            <p class="cw-prose-paragraph">{{ player.背景.家庭背景 }}</p>
          </div>
          <div v-if="player?.背景?.教育经历" class="cw-background-item">
            <div class="cw-bg-item-header">
              <span class="cw-bg-item-title">教育经历</span>
            </div>
            <p class="cw-prose-paragraph">{{ player.背景.教育经历 }}</p>
          </div>
          <div v-if="player?.背景?.重要过往" class="cw-background-item">
            <div class="cw-bg-item-header">
              <span class="cw-bg-item-title">重要过往</span>
            </div>
            <p class="cw-prose-paragraph">{{ player.背景.重要过往 }}</p>
          </div>
          <div v-if="player?.背景?.当前生活背景" class="cw-background-item">
            <div class="cw-bg-item-header">
              <span class="cw-bg-item-title">当前生活背景</span>
            </div>
            <p class="cw-prose-paragraph">{{ player.背景.当前生活背景 }}</p>
          </div>
          <div v-if="!hasAnyBackground" class="cw-empty-sub">
            <span>未登记成长背景信息</span>
          </div>
        </div>
      </div>

      <!-- 生活与住所 -->
      <div class="cw-info-section cw-life-section">
        <h4 class="cw-section-title">
          <SvgIcon name="mapPin" :size="15" />
          <span>生活环境与联系</span>
        </h4>
        <div class="cw-desc-list">
          <div class="cw-desc-item">
            <span class="cw-desc-k">常驻住处</span>
            <span class="cw-desc-v">{{ place(player?.生活?.住处id) }}</span>
          </div>
          <div class="cw-desc-item">
            <span class="cw-desc-k">日常活动</span>
            <span class="cw-desc-v">{{ player?.生活?.日常活动 || '日常活动待展开' }}</span>
          </div>
          <div class="cw-desc-item">
            <span class="cw-desc-k">联系方式</span>
            <span class="cw-desc-v">{{ contactText }}</span>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useWorldState, locationName } from '../../utils/context';
import { resolveAccountName } from '../../utils/entity';
import SvgIcon from '../icons/SvgIcon.vue';
import CharacterAvatar from '../shared/CharacterAvatar.vue';
import OccupationTags from '../shared/OccupationTags.vue';

const state = useWorldState();
const place = (id: any) => locationName(state?.value, id);

const props = defineProps<{
  player: any;
}>();

const contactText = computed(() => {
  const list = props.player?.生活?.联系方式 || [];
  if (!list.length) return '暂无公开联系方式';
  return list.map((accId: string) => resolveAccountName(state?.value, accId)).join('、');
});

const hasAnyBackground = computed(() => {
  const bg = props.player?.背景;
  return Boolean(
    bg &&
      (bg.成长背景 ||
        bg.家庭背景 ||
        bg.教育经历 ||
        bg.重要过往 ||
        bg.当前生活背景),
  );
});
</script>

<style scoped lang="scss">
.cw-player-info-pane {
  container-type: inline-size;
  container-name: cw-profile;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cw-profile-header-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);

  .cw-profile-avatar {
    width: 52px;
    height: 52px;
    border-radius: var(--cw-radius-full);
    background: var(--cw-accent-bg);
    color: var(--cw-accent);
    border: 2px solid var(--cw-accent-border);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .cw-profile-titles {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .cw-name-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;

    .cw-profile-name {
      font-size: 18px;
      font-weight: 700;
      color: var(--cw-text-primary);
    }
    .cw-profile-nickname {
      font-size: 14px;
      color: var(--cw-text-secondary);
    }
  }

  .cw-sub-row {
    font-size: 13px;
    color: var(--cw-text-secondary);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    margin-top: 2px;

    .cw-sub-line {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      line-height: 1.4;

      .cw-sub-k {
        font-size: 12px;
        color: var(--cw-text-muted);
      }
      .cw-sub-v {
        font-size: 13px;
        color: var(--cw-text-primary);
        font-weight: 500;
      }
      .cw-sub-extra {
        font-size: 12px;
        color: var(--cw-text-secondary);
      }
    }
  }
}

.cw-info-sections {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-areas: 'appearance life' 'background background';
  gap: 10px;
}
.cw-appearance-section {
  grid-area: appearance;
}
.cw-life-section {
  grid-area: life;
}
.cw-background-section {
  grid-area: background;
}
.cw-background-section .cw-desc-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
}
.cw-life-section .cw-desc-item {
  flex-direction: column;
  gap: 3px;
}
@container cw-profile (max-width: 520px) {
  .cw-info-sections {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: 'appearance' 'life' 'background';
  }
  .cw-background-section .cw-desc-list {
    grid-template-columns: minmax(0, 1fr);
  }
}

@container cw-profile (max-width: 360px) {
  .cw-info-grid {
    grid-template-columns: minmax(0, 1fr);

    .cw-info-cell.cw-cell-span2 {
      grid-column: 1 / -1;
    }
  }
}

.cw-info-section {
  padding: 10px 12px;
  min-width: 0;
  overflow-wrap: anywhere;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card);
  border: 1px solid var(--cw-border);

  .cw-section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 8px;
    font-size: 14px;
    font-weight: 600;
    color: var(--cw-text-primary);
    border-bottom: 1px solid var(--cw-border);
    padding-bottom: 6px;
  }
}

.cw-info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;

  .cw-info-cell {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 8px;
    justify-content: space-between;
    padding: 5px 7px;
    border-radius: var(--cw-radius-sm);
    background: var(--cw-bg-card-subtle);
    font-size: 13px;

    .cw-cell-k {
      color: var(--cw-text-muted);
    }
    .cw-cell-v {
      font-weight: 500;
      color: var(--cw-text-primary);
    }

    &.cw-cell-span2 {
      grid-column: 1 / -1;
    }
  }
}

.cw-prose-field-block {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed var(--cw-border);
}

.cw-field-sub-header {
  margin-bottom: 6px;
}

.cw-field-sub-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--cw-text-secondary);
}

.cw-prose-paragraph {
  margin: 0;
  font-size: 14px;
  line-height: 1.8;
  color: var(--cw-text-primary);
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.cw-background-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cw-background-item {
  padding: 10px 12px;
  border-radius: var(--cw-radius-sm);
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);
  display: flex;
  flex-direction: column;
  gap: 6px;

  .cw-bg-item-header {
    display: flex;
    align-items: center;
  }

  .cw-bg-item-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--cw-accent);
    background: var(--cw-accent-bg);
    padding: 2px 7px;
    border-radius: var(--cw-radius-xs, 4px);
    border: 1px solid var(--cw-accent-border);
  }
}

.cw-desc-list {
  display: flex;
  flex-direction: column;
  gap: 8px;

  .cw-desc-item {
    display: flex;
    gap: 8px;
    font-size: 13px;
    line-height: 1.6;

    .cw-desc-k {
      width: 92px;
      flex-shrink: 0;
      color: var(--cw-text-muted);
    }
    .cw-desc-v {
      min-width: 0;
      flex: 1;
      color: var(--cw-text-primary);
    }
  }
}

.cw-empty-sub {
  font-size: 13px;
  color: var(--cw-text-muted);
  padding: 6px 0;
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
