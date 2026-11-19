<template>
  <div class="cw-tab-pane cw-char-tab-personality">
    <!-- 1. 性格与习惯核心区域 -->
    <div class="cw-char-section-card cw-section-personality">
      <h4 class="cw-section-title">
        <SvgIcon name="smile" :size="15" />
        <span>性格与习惯</span>
      </h4>

      <div v-if="personalityItems.length > 0" class="cw-personality-list">
        <div
          v-for="item in personalityItems"
          :key="item.key"
          class="cw-personality-card"
        >
          <div class="cw-personality-header">
            <span class="cw-personality-label">{{ item.label }}</span>
          </div>
          <div class="cw-long-text-block">
            <p
              class="cw-prose-paragraph"
              :class="{ 'is-clamped': !expandedPersonality[item.key] && item.isLong }"
            >
              {{ item.value }}
            </p>
            <button
              v-if="item.isLong"
              type="button"
              class="cw-expand-toggle-btn"
              @click="togglePersonalityExpand(item.key)"
            >
              <span>{{ expandedPersonality[item.key] ? '收起' : '展开全文' }}</span>
              <SvgIcon :name="expandedPersonality[item.key] ? 'chevronUp' : 'chevronDown'" :size="12" />
            </button>
          </div>
        </div>
      </div>
      <div v-else class="cw-empty-sub">
        <span>尚未登记性格与习惯特征</span>
      </div>
    </div>

    <!-- 2. 专属标识 (信物、印记、气味、相处触动点) -->
    <div v-if="hasSignatures" class="cw-char-section-card cw-signature-card">
      <h4 class="cw-section-title">
        <SvgIcon name="bookmark" :size="15" />
        <span>专属标识</span>
      </h4>
      <div class="cw-details-grid">
        <div v-if="char?.专属标识?.身体印记 && char.专属标识.身体印记.length > 0" class="cw-detail-cell cw-cell-full">
          <span class="cw-cell-k">身体印记</span>
          <div class="cw-badge-wrap">
            <span v-for="(mark, idx) in char.专属标识.身体印记" :key="idx" class="cw-badge cw-badge-signature">
              {{ mark }}
            </span>
          </div>
        </div>
        <div v-if="char?.专属标识?.随身信物 && char.专属标识.随身信物.length > 0" class="cw-detail-cell cw-cell-full">
          <span class="cw-cell-k">随身信物</span>
          <div class="cw-badge-wrap">
            <span v-for="(item, idx) in char.专属标识.随身信物" :key="idx" class="cw-badge cw-badge-keepsake">
              {{ item }}
            </span>
          </div>
        </div>
        <div v-if="char?.专属标识?.感官特征" class="cw-detail-cell cw-cell-full">
          <span class="cw-cell-k">感官特征</span>
          <span class="cw-cell-v">{{ char.专属标识.感官特征 }}</span>
        </div>
        <div v-if="char?.专属标识?.破防弱点" class="cw-detail-cell cw-cell-full">
          <span class="cw-cell-k" tabindex="0" :data-cw-tooltip="emotionalTriggerDescription" data-cw-tooltip-touch>{{ emotionalTriggerLabel }}</span>
          <span class="cw-cell-v cw-weakness-v">{{ char.专属标识.破防弱点 }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { emotionalTriggerDescription, emotionalTriggerLabel } from '../../../utils/relationship-labels';
import SvgIcon from '../../icons/SvgIcon.vue';

const props = defineProps<{
  char: any;
  expandedFields: Record<string, boolean>;
}>();

const emit = defineEmits<{
  (e: 'toggleExpand', field: string): void;
}>();

const expandedPersonality = computed(() =>
  Object.fromEntries(personalityItems.value.map(item => [item.key, !!props.expandedFields[`personality:${item.key}`]])),
);

function togglePersonalityExpand(key: string) {
  emit('toggleExpand', `personality:${key}`);
}

// 结构化性格条目（表性格、里性格、爱好、厌恶、小习惯、语言习惯 + 任何其他字段）
const personalityItems = computed(() => {
  const raw = props.char?.性格;
  if (!raw || typeof raw !== 'object') return [];

  const standardKeys = [
    { key: '表性格', label: '表性格' },
    { key: '里性格', label: '里性格' },
    { key: '爱好', label: '爱好' },
    { key: '厌恶', label: '厌恶' },
    { key: '小习惯', label: '小习惯' },
    { key: '语言习惯', label: '语言习惯' },
  ];

  const result: Array<{ key: string; label: string; value: string; isLong: boolean }> = [];

  for (const item of standardKeys) {
    const val = raw[item.key];
    if (val != null && String(val).trim()) {
      const strVal = String(val).trim();
      result.push({
        key: item.key,
        label: item.label,
        value: strVal,
        isLong: strVal.length > 160 || (strVal.match(/\n/g) || []).length >= 4,
      });
    }
  }

  // 补入非标准的其他性格字段（完整保留原始字段内容）
  for (const [k, v] of Object.entries(raw)) {
    if (!standardKeys.some(s => s.key === k) && v != null && String(v).trim()) {
      const strVal = String(v).trim();
      result.push({
        key: k,
        label: k,
        value: strVal,
        isLong: strVal.length > 160 || (strVal.match(/\n/g) || []).length >= 4,
      });
    }
  }

  return result;
});

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
.cw-char-tab-personality {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

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

.cw-personality-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cw-personality-card {
  padding: 12px 14px;
  border-radius: var(--cw-radius-sm);
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);
  display: flex;
  flex-direction: column;
  gap: 6px;

  .cw-personality-header {
    display: flex;
    align-items: center;
  }

  .cw-personality-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--cw-accent);
    background: var(--cw-accent-bg);
    padding: 2px 8px;
    border-radius: var(--cw-radius-xs, 4px);
    border: 1px solid var(--cw-accent-border);
  }
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

/* 专属标识与弱点 */
.cw-signature-card {
  border-left: 3px solid var(--cw-accent, #e599b2);
}

.cw-details-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px 12px;

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

.cw-badge-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.cw-badge-signature {
  background: rgba(229, 153, 178, 0.15);
  color: #e599b2;
  border: 1px solid rgba(229, 153, 178, 0.3);
  font-size: 12px;
  padding: 2px 8px;
  border-radius: var(--cw-radius-full);
}

.cw-badge-keepsake {
  background: rgba(156, 220, 254, 0.15);
  color: #9cdcfe;
  border: 1px solid rgba(156, 220, 254, 0.3);
  font-size: 12px;
  padding: 2px 8px;
  border-radius: var(--cw-radius-full);
}

.cw-weakness-v {
  color: #f48771;
  font-weight: 500;
}

.cw-empty-sub {
  font-size: 13px;
  color: var(--cw-text-muted);
  padding: 8px 0;
}
</style>
