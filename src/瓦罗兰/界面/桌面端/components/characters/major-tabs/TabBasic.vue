<template>
  <div class="cw-tab-pane cw-char-tab-basic">
    <!-- 1. 好感度与信任度双进度条卡片（放在基础信息Tab顶部） -->
    <div class="cw-relation-bars-card">
      <div class="cw-rel-bar-group">
        <!-- 好感度：-100 ~ 100 -->
        <div
          class="cw-rel-bar-row"
          :class="{ 'is-unknown': favorValue === null }"
          tabindex="0"
          role="meter"
          aria-label="对玩家的好感度"
          :aria-valuemin="-100"
          :aria-valuemax="100"
          :aria-valuenow="favorValue ?? undefined"
          :aria-valuetext="favorTooltip"
          :data-cw-tooltip="favorTooltip"
          data-cw-tooltip-touch
        >
          <span class="cw-bar-label">好感</span>
          <!-- 双向进度条：-100 ~ 100，中间为 0 -->
          <div class="cw-bipolar-track">
            <!-- 负轴 (左侧) -->
            <div class="cw-track-half cw-track-neg">
              <div
                v-if="favorValue !== null && favorValue < 0"
                class="cw-fill-neg"
                :style="{ width: `${Math.min(100, Math.abs(favorValue))}%` }"
              ></div>
            </div>
            <!-- 中心0基准线 -->
            <div class="cw-bipolar-center"></div>
            <!-- 正轴 (右侧) -->
            <div class="cw-track-half cw-track-pos">
              <div
                v-if="favorValue !== null && favorValue > 0"
                class="cw-fill-pos"
                :style="{ width: `${Math.min(100, favorValue)}%` }"
              ></div>
            </div>
          </div>
        </div>

        <!-- 信任度：-100 ~ 100，中间为 0 -->
        <div
          class="cw-rel-bar-row"
          :class="{ 'is-unknown': trustValue === null }"
          tabindex="0"
          role="meter"
          aria-label="对玩家的信任度"
          :aria-valuemin="-100"
          :aria-valuemax="100"
          :aria-valuenow="trustValue ?? undefined"
          :aria-valuetext="trustTooltip"
          :data-cw-tooltip="trustTooltip"
          data-cw-tooltip-touch
        >
          <span class="cw-bar-label">信任</span>
          <div class="cw-bipolar-track cw-trust-track">
            <div class="cw-track-half cw-track-neg">
              <div
                v-if="trustValue !== null && trustValue < 0"
                class="cw-fill-neg"
                :style="{ width: `${Math.min(100, Math.abs(trustValue))}%` }"
              ></div>
            </div>
            <div class="cw-bipolar-center"></div>
            <div class="cw-track-half cw-track-pos">
              <div
                v-if="trustValue !== null && trustValue > 0"
                class="cw-fill-pos"
                :style="{ width: `${Math.min(100, trustValue)}%` }"
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. 基础档案（紧凑网格展示） -->
    <div class="cw-char-section-card cw-section-archive">
      <h4 class="cw-section-title">
        <SvgIcon name="user" :size="15" />
        <span>基础档案</span>
      </h4>

      <div class="cw-details-grid">
        <div class="cw-detail-cell">
          <span class="cw-cell-k">姓名</span>
          <span class="cw-cell-v">{{ char?.基础信息?.姓名 || char?.姓名 || '未设定' }}</span>
        </div>
        <div class="cw-detail-cell">
          <span class="cw-cell-k">称呼 / 昵称</span>
          <span class="cw-cell-v">{{ char?.基础信息?.称呼 || char?.称呼 || '无' }}</span>
        </div>
        <div class="cw-detail-cell">
          <span class="cw-cell-k">性别</span>
          <span class="cw-cell-v">{{ char?.基础信息?.性别 || char?.性别 || '未设定' }}</span>
        </div>
        <div class="cw-detail-cell">
          <span class="cw-cell-k">年龄</span>
          <span class="cw-cell-v">{{ char?.年龄 != null ? char.年龄 + ' 岁' : '未知' }}</span>
        </div>
        <div class="cw-detail-cell cw-cell-full cw-species-cell">
          <span class="cw-cell-k">种族</span>
          <span class="cw-cell-v">{{ show(char?.种族) }}</span>
        </div>
        <div class="cw-detail-cell cw-cell-full">
          <span class="cw-cell-k">身份</span>
          <OccupationTags :value="char?.身份" />
        </div>
      </div>
    </div>

    <!-- 3. 人物简介（单栏阅读段落，解决原“社会身份与单位”标题与内容不符的问题） -->
    <div class="cw-char-section-card cw-section-bio">
      <h4 class="cw-section-title">
        <SvgIcon name="bookmark" :size="15" />
        <span>人物简介</span>
      </h4>
      <div class="cw-long-text-block">
        <p
          class="cw-prose-paragraph"
          :class="{ 'is-clamped': !bioExpanded && isBioLong }"
        >
          {{ char?.简介 || '尚未登记人物简介' }}
        </p>
        <button
          v-if="isBioLong"
          type="button"
          class="cw-expand-toggle-btn"
          @click="emit('toggleExpand', 'basic:bio')"
        >
          <span>{{ bioExpanded ? '收起简介' : '展开全文' }}</span>
          <SvgIcon :name="bioExpanded ? 'chevronUp' : 'chevronDown'" :size="12" />
        </button>
      </div>
    </div>

    <!-- 4. 外貌与身形（短指标紧凑网格 + 长描述独立段落） -->
    <div class="cw-char-section-card cw-section-appearance">
      <h4 class="cw-section-title">
        <SvgIcon name="userCheck" :size="15" />
        <span>外貌与身形</span>
      </h4>

      <!-- 身体指标紧凑网格 -->
      <div v-if="hasAppearanceMetrics" class="cw-details-grid cw-appearance-metrics">
        <div v-if="char?.外貌?.身高" class="cw-detail-cell">
          <span class="cw-cell-k">身高</span>
          <span class="cw-cell-v">{{ char.外貌.身高 }} cm</span>
        </div>
        <div v-if="char?.外貌?.体重" class="cw-detail-cell">
          <span class="cw-cell-k">体重</span>
          <span class="cw-cell-v">{{ char.外貌.体重 }} kg</span>
        </div>
        <div v-if="char?.外貌?.整体体型" class="cw-detail-cell cw-cell-full">
          <span class="cw-cell-k">体态轮廓</span>
          <span class="cw-cell-v">{{ char.外貌.整体体型 }}</span>
        </div>
        <div v-if="femaleMeasurements" class="cw-detail-cell cw-cell-full">
          <span class="cw-cell-k">三围 / 罩杯</span>
          <span class="cw-cell-v">{{ femaleMeasurements }}</span>
        </div>
      </div>

      <!-- 详细外表描述段落 -->
      <div class="cw-prose-field-block">
        <div class="cw-field-sub-header">
          <span class="cw-field-sub-title">外貌细节描述</span>
        </div>
        <div class="cw-long-text-block">
          <p
            class="cw-prose-paragraph"
            :class="{ 'is-clamped': !appearanceExpanded && isAppearanceLong }"
          >
            {{ char?.外貌?.详细外表 || '尚未登记详细外貌描述' }}
          </p>
          <button
            v-if="isAppearanceLong"
            type="button"
            class="cw-expand-toggle-btn"
            @click="emit('toggleExpand', 'basic:appearance')"
          >
            <span>{{ appearanceExpanded ? '收起描述' : '展开全文' }}</span>
            <SvgIcon :name="appearanceExpanded ? 'chevronUp' : 'chevronDown'" :size="12" />
          </button>
        </div>
      </div>

      <!-- 今日穿搭 (如果有) -->
      <div v-if="char?.外貌?.今日穿搭" class="cw-prose-field-block">
        <div class="cw-field-sub-header">
          <span class="cw-field-sub-title">今日穿搭</span>
        </div>
        <p class="cw-prose-paragraph">{{ char.外貌.今日穿搭 }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useWorldState, show } from '../../../utils/context';
import { favorDescription, trustDescription } from '../../../utils/relationship-labels';
const worldState = useWorldState();
import SvgIcon from '../../icons/SvgIcon.vue';
import OccupationTags from '../../shared/OccupationTags.vue';

const props = defineProps<{
  char: any;
  expandedFields: Record<string, boolean>;
}>();

const emit = defineEmits<{
  (e: 'toggleExpand', field: string): void;
}>();

// 由档案窗口按角色保存，切换 Tab 后仍与阅读位置保持一致。
const bioExpanded = computed(() => !!props.expandedFields['basic:bio']);
const appearanceExpanded = computed(() => !!props.expandedFields['basic:appearance']);

const isBioLong = computed(() => {
  const text = props.char?.简介;
  if (!text || typeof text !== 'string') return false;
  return text.length > 180 || (text.match(/\n/g) || []).length >= 4;
});

const isAppearanceLong = computed(() => {
  const text = props.char?.外貌?.详细外表;
  if (!text || typeof text !== 'string') return false;
  return text.length > 180 || (text.match(/\n/g) || []).length >= 4;
});

const hasAppearanceMetrics = computed(() => {
  const a = props.char?.外貌;
  return Boolean(a?.身高 || a?.体重 || a?.整体体型 || femaleMeasurements.value);
});

const isMale = computed(() => {
  const g = props.char?.基础信息?.性别 || props.char?.性别;
  return g === '男' || g === '男性';
});

const femaleMeasurements = computed(() => {
  if (isMale.value) return null;
  const m = props.char?.外貌?.三围信息;
  const cup = props.char?.外貌?.罩杯;
  if (!m && !cup) return null;
  const parts: string[] = [];
  if (cup) parts.push(`罩杯 ${cup}`);
  if (m && (m.胸围 != null || m.腰围 != null || m.臀围 != null)) {
    const bwh = [
      m.胸围 != null ? `胸围 ${m.胸围}cm` : null,
      m.腰围 != null ? `腰围 ${m.腰围}cm` : null,
      m.臀围 != null ? `臀围 ${m.臀围}cm` : null,
    ]
      .filter(Boolean)
      .join(' / ');
    if (bwh) parts.push(`三围 (${bwh})`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
});

// 读取对玩家的好感度与信任度（来源于关系网中的玩家id或直接字段）
const relationWithPlayer = computed(() => {
  const net = props.char?.关系网;
  if (!net) return null;
  return net[worldState?.value?.玩家?.id] ?? null;
});

const favorValue = computed(() => {
  return relationWithPlayer.value?.好感度 ?? null;
});

const trustValue = computed(() => {
  return relationWithPlayer.value?.信任度 ?? null;
});

const favorTooltip = computed(() => favorDescription(favorValue.value));
const trustTooltip = computed(() => trustDescription(trustValue.value));

const hasSignatures = computed(() => {
  const s = props.char?.专属标识;
  return Boolean(
    s &&
      ((s.身体印记 && s.身体印记.length > 0) ||
        (s.随身信物 && s.随身信物.length > 0) ||
        s.感官特征 ||
        s.破防弱点),
  );
});
</script>

<style scoped lang="scss">
.cw-char-tab-basic {
  display: flex;
  flex-direction: column;
  gap: 18px; // 分区间距约 16-24px
}

.cw-relation-bars-card,
.cw-char-section-card {
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

/* 关系轨卡片 */
.cw-rel-bar-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cw-relation-bars-card {
  padding: 12px 16px;
}
.cw-rel-bar-row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-height: 18px;
  cursor: help;
  border-radius: 3px;
}
.cw-rel-bar-row:focus-visible {
  outline: 2px solid var(--cw-accent);
  outline-offset: 3px;
}
.cw-bar-label {
  font-size: 11px;
  color: var(--cw-text-secondary);
}
.is-unknown :is(.cw-bipolar-track, .cw-trust-track) {
  background: repeating-linear-gradient(120deg, var(--cw-bg-card-subtle) 0 5px, var(--cw-border) 5px 7px);
}

/* 双向好感度进度条 */
.cw-bipolar-track {
  width: 100%;
  height: 12px;
  background: var(--cw-bg-card-subtle);
  border-radius: var(--cw-radius-full);
  border: 1px solid var(--cw-border);
  display: flex;
  position: relative;
  overflow: hidden;

  .cw-track-half {
    flex: 1;
    height: 100%;
    position: relative;
  }

  .cw-track-neg {
    display: flex;
    justify-content: flex-end;
  }

  .cw-fill-neg {
    height: 100%;
    background: linear-gradient(90deg, #dc3545, #e67e22);
    border-radius: var(--cw-radius-full) 0 0 var(--cw-radius-full);
    transition: width 0.3s;
  }

  .cw-fill-pos {
    height: 100%;
    background: linear-gradient(90deg, #c4783c, #e6a23c);
    border-radius: 0 var(--cw-radius-full) var(--cw-radius-full) 0;
    transition: width 0.3s;
  }

  .cw-bipolar-center {
    width: 2px;
    height: 100%;
    background: var(--cw-text-muted);
    z-index: 2;
  }
}

/* 信任度单向长条 */
.cw-trust-track {
  width: 100%;
  height: 10px;
  background: var(--cw-bg-card-subtle);
  border-radius: var(--cw-radius-full);
  border: 1px solid var(--cw-border);
  overflow: hidden;

  .cw-trust-fill {
    height: 100%;
    background: linear-gradient(90deg, #17a2b8, #2176c7);
    border-radius: var(--cw-radius-full);
    transition: width 0.3s;
  }
}

/* 短字段紧凑网格 */
.cw-details-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px 12px; // 字段间距约 10-16px

  .cw-detail-cell {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border-radius: var(--cw-radius-sm);
    background: var(--cw-bg-card-subtle);
    font-size: 13px;

    .cw-cell-k {
      color: var(--cw-text-muted);
      flex-shrink: 0;
    }
    .cw-cell-v {
      font-weight: 500;
      color: var(--cw-text-primary);
      text-align: right;
    }

    &.cw-cell-full {
      grid-column: span 2;
      justify-content: space-between;
    }
  }
}

.cw-appearance-metrics {
  margin-bottom: 14px;
}

/* 独立子字段与长文本段落容器 */
.cw-prose-field-block {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed var(--cw-border);
}

.cw-field-sub-header {
  margin-bottom: 8px;
}

.cw-field-sub-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--cw-text-secondary);
}

.cw-long-text-block {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.cw-prose-paragraph {
  margin: 0;
  font-size: 14px;
  line-height: 1.8;
  color: var(--cw-text-primary);
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;

  &.is-clamped {
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}

.cw-expand-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  padding: 3px 10px;
  border-radius: var(--cw-radius-sm);
  border: 1px solid var(--cw-border);
  background: var(--cw-bg-card-subtle);
  color: var(--cw-accent);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: var(--cw-accent-bg);
    border-color: var(--cw-accent-border);
  }
}
</style>
