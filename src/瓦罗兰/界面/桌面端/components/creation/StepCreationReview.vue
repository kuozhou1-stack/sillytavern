<template>
  <div class="cw-step-pane">
    <div class="cw-step-header">
      <h3 class="cw-step-title">第六步：全貌复核与确认保存</h3>
      <p class="cw-step-subtitle">
        请全面复核本次填写的市民档案、生平过往、开局时空、资产与初始随身物品。点击各项右侧的“修改”可直接跳转修正。
      </p>
    </div>

    <!-- 提交失败错误提示条 -->
    <div v-if="submitError" class="cw-alert-banner cw-alert-danger">
      <SvgIcon name="alertTriangle" :size="16" />
      <span>{{ submitError }}（已填写内容保留，可修正后重试）</span>
    </div>

    <div class="cw-review-sections">
      <!-- 1. 基本身份与外貌特征 -->
      <div class="cw-review-card">
        <div class="cw-card-top-header">
          <div class="cw-card-title">
            <SvgIcon name="user" :size="15" />
            <span>基本身份与外貌体貌</span>
          </div>
          <button type="button" class="cw-btn-link" @click="emit('goToStep', 1)">修改身份</button>
        </div>
        <div class="cw-rows-grid">
          <div class="cw-r-item">
            <span class="cw-k">登记姓名：</span>
            <span class="cw-v"
              >{{ player.姓名 || '未填写' }} <template v-if="player.称呼">({{ player.称呼 }})</template></span
            >
          </div>
          <div class="cw-r-item">
            <span class="cw-k">性别与年龄：</span>
            <span class="cw-v"
              >{{ player.性别 || '未知' }} · {{ player.年龄 !== null ? `${player.年龄}岁` : '未知' }}</span
            >
          </div>
          <div class="cw-r-item">
            <span class="cw-k">种族：</span>
            <span class="cw-v">{{ player.种族 || '暂未填写' }}</span>
          </div>
          <div class="cw-r-item">
            <span class="cw-k">身形尺寸：</span>
            <span class="cw-v">
              {{ player.身高 ? `${player.身高}cm` : '身高未知' }} ·
              {{ player.体重 ? `${player.体重}kg` : '体重未知' }} ·
              {{ player.体型 || '体型未详述' }}
            </span>
          </div>
          <div class="cw-r-item">
            <span class="cw-k">发型与特征：</span>
            <span class="cw-v">{{ player.发型 || '普通' }} · {{ player.显著特征 || '无特殊外貌特征' }}</span>
          </div>
          <div class="cw-r-item cw-r-full">
            <span class="cw-k">外貌整体描述：</span>
            <span class="cw-v">{{ player.整体外貌描述 || '暂未填写外貌长段描写' }}</span>
          </div>
        </div>
      </div>

      <!-- 2. 生平背景与过往经历 -->
      <div class="cw-review-card">
        <div class="cw-card-top-header">
          <div class="cw-card-title">
            <SvgIcon name="target" :size="15" />
            <span>身份背景与重要生平</span>
          </div>
          <button type="button" class="cw-btn-link" @click="emit('goToStep', 3)">修改经历</button>
        </div>
        <div class="cw-rows-grid">
          <div class="cw-r-item">
            <span class="cw-k">身份：</span>
            <span class="cw-v">{{ player.身份 || '自由职业 / 暂无' }}</span>
          </div>
          <div class="cw-r-item cw-r-full">
            <span class="cw-k">重要过往经历：</span>
            <span class="cw-v">{{ player.重要过往 || '暂未填写重要过往设定' }}</span>
          </div>
          <div class="cw-r-item cw-r-full">
            <span class="cw-k">当前生活背景：</span>
            <span class="cw-v">{{ player.当前生活背景 || '暂未描写当前生活状态' }}</span>
          </div>
        </div>
      </div>

      <!-- 3. 居所环境与开局时空 -->
      <div class="cw-review-card">
        <div class="cw-card-top-header">
          <div class="cw-card-title">
            <SvgIcon name="mapPin" :size="15" />
            <span>开局时空与居所环境</span>
          </div>
          <button type="button" class="cw-btn-link" @click="emit('goToStep', 4)">修改时空</button>
        </div>
        <div class="cw-rows-grid">
          <div class="cw-r-item">
            <span class="cw-k">开局时间：</span>
            <span class="cw-v">{{ startTime ? startTime.replace('T', ' ') : '使用角色卡默认时空' }}</span>
          </div>
          <div class="cw-r-item">
            <span class="cw-k">天气状况：</span>
            <span class="cw-v">{{ weather || '未知 (留待开场生成)' }}</span>
          </div>
          <div class="cw-r-item">
            <span class="cw-k">开场所在地点：</span>
            <span class="cw-v">{{ locations?.[startLocation]?.名称 || '暂未指定特定地点' }}</span>
          </div>
          <div class="cw-r-item">
            <span class="cw-k">常驻片区：</span>
            <span class="cw-v">{{ districtName }} ({{ player.片区id || '未选' }})</span>
          </div>
          <div class="cw-r-item cw-r-full">
            <span class="cw-k">住处环境描述：</span>
            <span class="cw-v">{{ player.住处描述 || '暂未描写具体起居生活处所' }}</span>
          </div>
          <div class="cw-r-item cw-r-full">
            <span class="cw-k">开局身体机能：</span>
            <span class="cw-v">
              饱食度：{{ player.饱食度 ?? 100 }}/100 · 水分值：{{ player.水分值 ?? 100 }}/100
              · 体力值：{{ player.体力值 ?? 100 }}/100
            </span>
          </div>
        </div>
      </div>

      <!-- 4. 初始资产与随身物品 -->
      <div class="cw-review-card">
        <div class="cw-card-top-header">
          <div class="cw-card-title">
            <SvgIcon name="coins" :size="15" />
            <span>初始资产、社交账号与随身物品</span>
          </div>
          <button type="button" class="cw-btn-link" @click="emit('goToStep', 4)">修改资产</button>
        </div>
        <div class="cw-rows-grid">
          <div class="cw-r-item">
            <span class="cw-k">初始余额：</span>
            <span class="cw-v">{{ balance === '' || balance == null ? '未知' : `${balance} 金币` }}</span>
          </div>
          <div class="cw-r-item cw-r-full">
            <span class="cw-k">邻信账号：</span>
            <span class="cw-v">{{ phoneName || (hasPlayerAccount ? '已有账号，名称待填' : '未建立（开局无邻信账号）') }}</span>
          </div>
          <div class="cw-r-item cw-r-full">
            <span class="cw-k">随身携带物品：</span>
            <div v-if="startingItems && startingItems.length > 0" class="cw-items-badges-flow">
              <span v-for="(it, i) in startingItems" :key="i" class="cw-item-chip">
                {{ it.名称 || '未命名物品' }} <template v-if="it.数量 != null && it.数量 !== ''">× {{ it.数量 }}{{ it.单位 || '' }}</template>
                <span v-if="it.类别" class="cw-chip-cat">({{ it.类别 }})</span>
              </span>
            </div>
            <span v-else class="cw-v cw-muted">无预设随身物品</span>
          </div>
        </div>
      </div>

      <!-- 5. 初始角色库与重点人际关系 (解决 F28/问题02/问题03：171人平铺卡顿与超长滚轮) -->
      <div class="cw-review-card cw-card-full">
        <div class="cw-card-top-header">
          <div class="cw-card-title">
            <SvgIcon name="users" :size="15" />
            <span>初始市民与人际关系配置</span>
          </div>
          <button type="button" class="cw-btn-link" @click="emit('goToStep', 5)">返回修改人际</button>
        </div>

        <!-- 角色库状态汇总数据栏 -->
        <div class="cw-char-stats-summary">
          <div class="cw-stat-pill">
            <span class="cw-stat-num">{{ initialCharacters.length }}</span>
            <span class="cw-stat-lbl">入库总人数</span>
          </div>
          <div class="cw-stat-pill cw-stat-highlight">
            <span class="cw-stat-num">{{ bondedCharacters.length }}</span>
            <span class="cw-stat-lbl">已确立开局羁绊</span>
          </div>
          <div class="cw-stat-pill">
            <span class="cw-stat-num">{{ contactCount }}</span>
            <span class="cw-stat-lbl">已通邻信好友</span>
          </div>
          <div class="cw-stat-pill">
            <span class="cw-stat-num">{{ standbyCharacters.length }}</span>
            <span class="cw-stat-lbl">待地点调度</span>
          </div>
        </div>

        <!-- 5.1 开局重点结识/地点相关人物 (优先展示，一般 1~8 人) -->
        <div class="cw-focus-chars-block">
          <div class="cw-sub-block-title">
            <SvgIcon name="sparkles" :size="14" />
            <span>明确建立联系的人物 ({{ priorityCharacters.length }} 人)</span>
            <span class="cw-block-tip">地点相关人物由调度器在保存后选定</span>
          </div>

          <div v-if="priorityCharacters.length > 0" class="cw-chars-review-list">
            <div v-for="c in priorityCharacters" :key="c.id" class="cw-char-review-row">
              <CharacterAvatar :name="c.基础信息?.姓名 || c.姓名" :size="36" />
              <div class="cw-char-rev-info">
                <div class="cw-char-rev-top">
                  <strong class="cw-char-rev-name">{{ c.基础信息?.姓名 || c.姓名 }}</strong>
                  <span class="cw-badge cw-badge-sm">{{ c.层级 || '主要' }}</span>
                  <span class="cw-char-rev-sub">{{ c.身份 || c.基础信息?.职业 || '居民' }}</span>
                  <span v-if="relations[c.id]?.contact" class="cw-badge-contact">
                    <SvgIcon name="phone" :size="10" /> 邻信
                  </span>
                </div>
                <div class="cw-char-rev-rel">
                  <span>渊源：<strong>{{ relations[c.id]?.basis || '未填写' }}</strong></span>
                  <span>·</span>
                  <span>态度：{{ relations[c.id]?.relation || '普通相识' }}</span>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="cw-empty-compact">
            <SvgIcon name="users" :size="16" class="cw-empty-icon" />
            <span>尚未明确建立联系。保存时会按开场地点选择相关人物，其余人物进入轮转。</span>
          </div>
        </div>

        <!-- 5.2 其余入库待机角色 (折叠收纳，防止 171 人卡死页面) -->
        <details v-if="standbyCharacters.length > 0" class="cw-standby-chars-details">
          <summary class="cw-standby-summary">
            <div class="cw-summary-left">
              <SvgIcon name="chevronRight" :size="14" class="cw-fold-arrow" />
              <span>浏览其余入库人物 ({{ standbyCharacters.length }} 位)</span>
            </div>
            <span class="cw-summary-tip">按开场地点调度，未选中的人物进入轮转</span>
          </summary>

          <div class="cw-standby-chars-panel">
            <div class="cw-standby-search-bar">
              <SvgIcon name="search" :size="13" class="cw-standby-s-icon" />
              <input
                v-model="standbyQuery"
                type="search"
                class="cw-input cw-input-sm"
                placeholder="在待机名录中快速检索姓名或身份..."
              />
            </div>

            <div class="cw-standby-chips-grid">
              <div
                v-for="c in filteredStandbyCharacters"
                :key="c.id"
                class="cw-standby-char-chip"
                :title="c.身份 || '瓦罗兰居民'"
              >
                <CharacterAvatar :name="c.基础信息?.姓名 || c.姓名" :size="20" />
                <span class="cw-chip-name">{{ c.基础信息?.姓名 || c.姓名 }}</span>
                <span class="cw-chip-tier">{{ c.层级 || '待机' }}</span>
              </div>
              <div v-if="filteredStandbyCharacters.length === 0" class="cw-standby-empty">
                无匹配人物
              </div>
            </div>
          </div>
        </details>
      </div>
    </div>

    <!-- 明确保存与开局语义提示 -->
    <div class="cw-notice-box">
      <div class="cw-notice-title">
        <SvgIcon name="info" :size="15" />
        <span>开局生成与变量结算机制</span>
      </div>
      <p class="cw-notice-text">
        保存后先依据地点和已确立的关系生成开场正文。随后模型会结合正文、当前档案和导入资料整理玩家与开局人物，包括补全未知项，以及有依据地修订或清空已填写的设定。
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { initialConnectionIds } from '../../../../运行/creation';
import { cityDistrictNames } from '../../utils/city';
import SvgIcon from '../icons/SvgIcon.vue';
import CharacterAvatar from '../shared/CharacterAvatar.vue';

const props = withDefaults(
  defineProps<{
    player: any;
    initialCharacters: any[];
    relations?: Record<string, any>;
    startTime?: string;
    weather?: string;
    startLocation?: string;
    accountName?: string;
    balance?: string | number;
    phoneName?: string;
    hasPlayerAccount?: boolean;
    startingItems?: any[];
    locations?: Record<string, any>;
    submitError?: string;
  }>(),
  {
    relations: () => ({}),
    startingItems: () => [],
    locations: () => ({}),
  },
);

const emit = defineEmits<{
  (e: 'goToStep', step: number): void;
}>();

const districtName = computed(() => {
  return cityDistrictNames[props.player.片区id] || props.player.片区id || '未指定';
});

const standbyQuery = ref('');

// 计算已确立羁绊的角色
const bondedCharacters = computed(() => {
  const ids = new Set(initialConnectionIds({ characters: props.initialCharacters, details: { 初始关系: props.relations } }));
  return props.initialCharacters.filter(c => ids.has(c.id));
});

// 计算已添加联系方式的人数
const contactCount = computed(() => {
  return props.initialCharacters.filter(c => !!props.relations[c.id]?.contact).length;
});

// 开局优先展示的人物（有相识设定或地点相关，避免长平铺）
const priorityCharacters = computed(() => {
  return bondedCharacters.value;
});

const priorityCharIds = computed(() => new Set(priorityCharacters.value.map(c => c.id)));

// 其余待机角色
const standbyCharacters = computed(() => {
  return props.initialCharacters.filter(c => !priorityCharIds.value.has(c.id));
});

const filteredStandbyCharacters = computed(() => {
  const q = standbyQuery.value.trim().toLowerCase();
  if (!q) return standbyCharacters.value;
  return standbyCharacters.value.filter(c => {
    const name = (c.基础信息?.姓名 || c.姓名 || '').toLowerCase();
    const identity = (c.身份 || '').toLowerCase();
    return name.includes(q) || identity.includes(q);
  });
});
</script>

<style scoped lang="scss">
.cw-step-pane {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cw-step-header {
  border-bottom: 1px solid var(--cw-border);
  padding-bottom: 12px;

  .cw-step-title {
    margin: 0 0 6px;
    font-size: 17px;
    font-weight: 700;
    color: var(--cw-text-primary);
  }

  .cw-step-subtitle {
    margin: 0;
    font-size: 13px;
    color: var(--cw-text-secondary);
    line-height: 1.6;
  }
}

.cw-review-sections {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cw-review-card {
  padding: 14px 18px;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card);
  border: 1px solid var(--cw-border);
  display: flex;
  flex-direction: column;
  gap: 10px;

  .cw-card-top-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--cw-border);

    .cw-card-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--cw-text-primary);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .cw-btn-link {
      background: none;
      border: none;
      color: var(--cw-accent);
      font-size: 12px;
      cursor: pointer;
      padding: 0;

      &:hover {
        text-decoration: underline;
      }
    }
  }
}

.cw-rows-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 16px;

  .cw-r-item {
    display: flex;
    gap: 6px;
    font-size: 12px;
    line-height: 1.5;

    &.cw-r-full {
      grid-column: 1 / -1;
    }

    .cw-k {
      color: var(--cw-text-muted);
      flex-shrink: 0;
    }
    .cw-v {
      color: var(--cw-text-primary);
      word-break: break-all;
    }
  }
}

.cw-items-badges-flow {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.cw-item-chip {
  padding: 3px 8px;
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius-full);
  font-size: 11px;
  color: var(--cw-text-primary);

  .cw-chip-cat {
    color: var(--cw-text-muted);
  }
}

/* 角色列表与统计摘要 */
.cw-char-stats-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-bottom: 6px;

  .cw-stat-pill {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 8px 10px;
    background: var(--cw-bg-surface);
    border: 1px solid var(--cw-border);
    border-radius: var(--cw-radius-sm);
    gap: 2px;

    .cw-stat-num {
      font-size: 16px;
      font-weight: 700;
      color: var(--cw-text-primary);
    }

    .cw-stat-lbl {
      font-size: 11px;
      color: var(--cw-text-secondary);
    }

    &.cw-stat-highlight {
      border-color: var(--cw-accent);
      background: var(--cw-accent-bg);

      .cw-stat-num {
        color: var(--cw-accent);
      }
    }
  }
}

.cw-focus-chars-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;

  .cw-sub-block-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--cw-text-primary);
    display: flex;
    align-items: center;
    gap: 6px;

    .cw-block-tip {
      font-size: 11px;
      font-weight: 400;
      color: var(--cw-text-muted);
      margin-left: 6px;
    }
  }
}

.cw-chars-review-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cw-char-review-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--cw-bg-surface);
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius-sm);

  .cw-char-rev-info {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex: 1;
    min-width: 0;

    .cw-char-rev-top {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;

      .cw-char-rev-name {
        font-size: 13px;
        color: var(--cw-text-primary);
      }
      .cw-char-rev-sub {
        font-size: 11px;
        color: var(--cw-text-secondary);
      }
      .cw-badge-contact {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 1px 6px;
        background: rgba(39, 174, 96, 0.12);
        color: var(--cw-success, #27ae60);
        border: 1px solid rgba(39, 174, 96, 0.3);
        border-radius: var(--cw-radius-full);
        font-size: 10px;
        font-weight: 600;
      }
    }

    .cw-char-rev-rel {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--cw-text-secondary);
      flex-wrap: wrap;

      strong {
        color: var(--cw-text-primary);
      }
    }
  }
}

/* 待机角色折叠抽屉 */
.cw-standby-chars-details {
  margin-top: 10px;
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius-sm);
  background: var(--cw-bg-card-subtle);
  overflow: hidden;

  .cw-standby-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    cursor: pointer;
    user-select: none;
    font-size: 12px;
    font-weight: 500;
    color: var(--cw-text-primary);

    &:hover {
      background: var(--cw-bg-surface);
    }

    .cw-summary-left {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .cw-summary-tip {
      font-size: 11px;
      color: var(--cw-text-muted);
    }
  }

  &[open] .cw-fold-arrow {
    transform: rotate(90deg);
  }

  .cw-standby-chars-panel {
    padding: 12px 14px;
    border-top: 1px solid var(--cw-border);
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--cw-bg-surface);

    .cw-standby-search-bar {
      position: relative;
      display: flex;
      align-items: center;

      .cw-standby-s-icon {
        position: absolute;
        left: 8px;
        color: var(--cw-text-muted);
        pointer-events: none;
      }

      .cw-input-sm {
        padding-left: 26px;
        font-size: 11px;
      }
    }

    .cw-standby-chips-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      max-height: 220px;
      overflow-y: auto;
      padding-right: 4px;

      .cw-standby-char-chip {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 3px 8px 3px 4px;
        background: var(--cw-bg-card);
        border: 1px solid var(--cw-border);
        border-radius: var(--cw-radius-full);
        font-size: 11px;
        cursor: default;

        .cw-chip-name {
          font-weight: 500;
          color: var(--cw-text-primary);
        }

        .cw-chip-tier {
          font-size: 10px;
          color: var(--cw-text-muted);
        }
      }

      .cw-standby-empty {
        font-size: 11px;
        color: var(--cw-text-muted);
        padding: 8px;
      }
    }
  }
}

.cw-text-success {
  color: var(--cw-success, #27ae60);
}
.cw-text-muted {
  color: var(--cw-text-muted);
}
.cw-muted {
  color: var(--cw-text-muted);
}

.cw-empty-p {
  margin: 8px 0;
  font-size: 12px;
  color: var(--cw-text-muted);
}

.cw-empty-compact {
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: var(--cw-radius-sm);
  background: var(--cw-bg-card-subtle);
  border: 1px dashed var(--cw-border);
  color: var(--cw-text-muted);
  font-size: 12px;
  margin: 4px 0;

  .cw-empty-icon {
    opacity: 0.5;
    flex-shrink: 0;
  }
}

.cw-notice-box {
  padding: 12px 16px;
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius);
  display: flex;
  flex-direction: column;
  gap: 6px;

  .cw-notice-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--cw-accent);
  }

  .cw-notice-text {
    margin: 0;
    font-size: 11px;
    color: var(--cw-text-secondary);
    line-height: 1.5;
  }
}

.cw-alert-banner {
  padding: 10px 14px;
  border-radius: var(--cw-radius-sm);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;

  &.cw-alert-danger {
    background: rgba(192, 57, 43, 0.1);
    border: 1px solid rgba(192, 57, 43, 0.3);
    color: var(--cw-danger);
  }
}

@media (max-width: 640px) {
  .cw-rows-grid {
    grid-template-columns: 1fr;
  }

  .cw-char-stats-summary {
    grid-template-columns: repeat(2, 1fr);
  }

  .cw-standby-summary {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
}
</style>
