<template>
  <div class="cw-roster-tab">
    <!-- 自动角色调度主控面板 -->
    <CharacterAutoControl
      :disabled="saving"
      @saving="autoSaving = $event"
      @feedback="emit('feedback', $event)"
    />

    <!-- 开启上限与轮换人数配额配置 -->
    <section class="cw-roster-card">
      <div class="cw-card-header-bar">
        <div class="cw-card-title-group">
          <div class="cw-title-icon-badge">
            <SvgIcon name="sliders" :size="16" />
          </div>
          <div class="cw-title-texts">
            <h4 class="cw-card-title">角色在场配额与轮换步长</h4>
            <span class="cw-card-subtitle">控制不同层级角色同时活跃的最大席位及单次轮换规模</span>
          </div>
        </div>

        <details class="cw-roster-help-details">
          <summary class="cw-help-summary">
            <SvgIcon name="info" :size="13" />
            <span>调度规则说明</span>
          </summary>
          <div class="cw-help-content">
            <div class="cw-help-item">
              <span class="cw-help-bullet">·</span>
              <p><strong>轮换机制</strong>：轮换人数为 0 时停止主动轮换。配置将在下一次正文或手机互动前自动执行；单轮重试不重复换人。</p>
            </div>
            <div class="cw-help-item">
              <span class="cw-help-bullet">·</span>
              <p><strong>保留策略</strong>：在场、正文明确点名及手机互动中的人物优先绝对保留；当前互动人数超限时暂时保留全体参与者。</p>
            </div>
          </div>
        </details>
      </div>

      <form @submit.prevent="save">
        <fieldset :disabled="saving || autoSaving || !runtime" class="cw-roster-fieldset">
          <div class="cw-tier-quota-grid">
            <div
              v-for="group in controls"
              :key="group.tier"
              class="cw-quota-cabin"
              :class="group.tier === '主要' ? 'is-major-tier' : 'is-minor-tier'"
            >
              <div class="cw-cabin-header">
                <div class="cw-cabin-title-row">
                  <span class="cw-tier-badge" :class="group.tier === '主要' ? 'badge-major' : 'badge-minor'">
                    {{ group.tier }}角色席位
                  </span>
                  <span class="cw-current-quota-tag">
                    当前活跃: {{ active[group.tier].length }} / {{ draft[group.limit] }} 席
                  </span>
                </div>
              </div>

              <div class="cw-quota-inputs-row">
                <div class="cw-quota-field">
                  <label class="cw-field-label">在场上限人数</label>
                  <div class="cw-number-input-wrap">
                    <input
                      v-model.number="draft[group.limit]"
                      type="number"
                      min="0"
                      step="1"
                      required
                      class="cw-number-input"
                      :aria-label="`${group.tier}角色开启上限`"
                    />
                    <span class="cw-input-unit">人上限</span>
                  </div>
                </div>

                <div class="cw-quota-field">
                  <label class="cw-field-label">单轮轮换步长</label>
                  <div class="cw-number-input-wrap">
                    <input
                      v-model.number="draft[group.rotation]"
                      type="number"
                      min="0"
                      :max="draft[group.limit]"
                      step="1"
                      required
                      class="cw-number-input"
                      :aria-label="`${group.tier}角色每轮轮换人数`"
                    />
                    <span class="cw-input-unit">人 / 轮</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="cw-roster-actions-bar">
            <div class="cw-dirty-hint">
              <span v-if="dirty" class="cw-badge cw-badge-warning cw-dirty-badge">● 未保存的配额变更</span>
            </div>
            <div class="cw-action-btns">
              <button
                type="button"
                class="cw-btn cw-btn-ghost cw-btn-sm"
                :disabled="!dirty"
                @click="reset"
              >
                撤销修改
              </button>
              <button
                type="submit"
                class="cw-btn cw-btn-primary cw-btn-sm"
                :disabled="!dirty"
              >
                <SvgIcon name="check" :size="14" />
                <span>保存调度配置</span>
              </button>
            </div>
          </div>
        </fieldset>
      </form>

      <div v-if="error" class="cw-error-banner" role="alert">
        <SvgIcon name="alertCircle" :size="14" />
        <span>{{ error }}</span>
      </div>
      <div v-if="notice" role="status" class="cw-success-banner">
        <SvgIcon name="check" :size="14" />
        <span>{{ notice }}</span>
      </div>
    </section>

    <!-- 当前开启角色库展示面板 -->
    <section class="cw-roster-card" aria-label="当前开启角色" aria-live="polite">
      <div class="cw-card-header-bar">
        <div class="cw-card-title-group">
          <div class="cw-title-icon-badge">
            <SvgIcon name="users" :size="16" />
          </div>
          <div class="cw-title-texts">
            <h4 class="cw-card-title">当前在场角色席位</h4>
            <span class="cw-card-subtitle">显示当前已实际载入交互上下文的活跃角色名单</span>
          </div>
        </div>

        <span class="cw-badge cw-badge-accent cw-total-roster-badge">
          主要 {{ active.主要.length }} 人 · 次要 {{ active.次要.length }} 人
        </span>
      </div>

      <!-- 结构化提示条替代大段平铺文字 -->
      <div class="cw-info-callout">
        <SvgIcon name="info" :size="14" class="cw-callout-icon" />
        <span class="cw-callout-text">
          名单随正文及手机互动自动结算，新创建角色将在下一次互动前自动归入配额整理。
        </span>
      </div>

      <!-- 两个独立的在场席位舱 -->
      <div class="cw-active-cabins-list">
        <div
          v-for="group in controls"
          :key="group.tier"
          class="cw-active-cabin-box"
          :class="group.tier === '主要' ? 'is-major-box' : 'is-minor-box'"
        >
          <div class="cw-active-cabin-head">
            <div class="cw-cabin-label-group">
              <span class="cw-cabin-dot" :class="group.tier === '主要' ? 'dot-major' : 'dot-minor'"></span>
              <span class="cw-cabin-heading">{{ group.tier }}角色席位</span>
            </div>
            <span class="cw-cabin-count-tag">
              在场 {{ active[group.tier].length }} 人 / 上限 {{ saved[group.limit] }} 席
            </span>
          </div>

          <div v-if="active[group.tier].length" class="cw-roster-grid">
            <div
              v-for="person in active[group.tier]"
              :key="person.id"
              class="cw-roster-person-card"
              :class="{ 'is-in-rotation': rotationIds.has(person.id) }"
            >
              <CharacterAvatar
                :name="person.name"
                :size="26"
                shape="rounded"
                class="cw-person-avatar"
              />
              <span class="cw-person-name" :title="person.name">{{ person.name }}</span>
              <span
                v-if="rotationIds.has(person.id)"
                class="cw-badge cw-badge-xs cw-badge-warning cw-rotation-pill"
                title="已进入待轮换队列"
              >
                待轮换
              </span>
            </div>
          </div>

          <div v-else class="cw-empty-cabin-placeholder">
            <SvgIcon name="users" :size="20" class="cw-empty-cabin-icon" />
            <span>当前没有在场的{{ group.tier }}角色</span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { klona } from 'klona';
import { RuntimeKey, type Runtime } from '../../../../运行/host';
import { CharacterRosterSettingsSchema, type CharacterRosterSettings } from '../../../../运行/settings';
import SvgIcon from '../icons/SvgIcon.vue';
import CharacterAutoControl from './CharacterAutoControl.vue';
import CharacterAvatar from '../shared/CharacterAvatar.vue';

const runtime = inject<Runtime | null>(RuntimeKey, null);
const emit = defineEmits<{ (e: 'feedback', msg: string): void }>();
const controls = [
  { tier: '主要', limit: 'majorLimit', rotation: 'majorRotation' },
  { tier: '次要', limit: 'minorLimit', rotation: 'minorRotation' },
] as const;
const saved = computed(() => CharacterRosterSettingsSchema.parse(runtime?.settings.characterRoster ?? {}));
const draft = ref<CharacterRosterSettings>(klona(saved.value));
const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(saved.value));
const saving = ref(false), autoSaving = ref(false), error = ref(''), notice = ref('');

watch(() => JSON.stringify(saved.value), (_next, previous) => {
  if (JSON.stringify(draft.value) === previous) draft.value = klona(saved.value);
});

const active = computed(() => {
  const rows = Object.entries(runtime?.view.data?.角色 ?? {}).map(([id, person]) => ({
    id,
    name: person.姓名 || id,
    tier: person.层级
  }));
  return {
    主要: rows.filter(person => person.tier === '主要'),
    次要: rows.filter(person => person.tier === '次要'),
  };
});

const rotationIds = computed(() => new Set(runtime?.view.characterLibrary?.rotationIds ?? []));

function reset() {
  draft.value = klona(saved.value);
  error.value = '';
  notice.value = '';
}

async function save() {
  if (!runtime || saving.value || autoSaving.value) return;
  const parsed = CharacterRosterSettingsSchema.safeParse(klona(draft.value));
  if (!parsed.success) {
    error.value = parsed.error.issues.find(issue => issue.code === 'custom')?.message ?? '开启上限与轮换人数必须填写非负整数。';
    notice.value = '';
    return;
  }
  saving.value = true;
  error.value = '';
  notice.value = '';
  try {
    await runtime.saveSettings({ ...klona(runtime.settings), characterRoster: parsed.data });
    draft.value = klona(saved.value);
    notice.value = '角色调度配置已保存，将在下一次正文或手机互动前生效。';
    emit('feedback', notice.value);
  } catch (cause) {
    error.value = String(cause);
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.cw-roster-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 统一的外层卡片与边框设计 */
.cw-roster-card {
  padding: 16px 18px;
  border-radius: var(--cw-radius, 12px);
  background: var(--cw-bg-card);
  border: 1px solid var(--cw-border);
  box-shadow: var(--cw-shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* 卡片标题行 */
.cw-card-header-bar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.cw-card-title-group {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.cw-title-icon-badge {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: var(--cw-accent-bg, rgba(56, 189, 248, 0.1));
  color: var(--cw-accent, #0284c7);
  border: 1px solid rgba(56, 189, 248, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.cw-title-texts {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cw-card-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--cw-text-primary);
  letter-spacing: -0.2px;
}

.cw-card-subtitle {
  font-size: 12px;
  color: var(--cw-text-secondary);
}

.cw-total-roster-badge {
  font-size: 11px;
  padding: 3px 8px;
}

/* 折叠规则说明 */
.cw-roster-help-details {
  font-size: 12px;
}

.cw-help-summary {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  color: var(--cw-text-muted);
  user-select: none;
  font-weight: 500;
  padding: 3px 8px;
  border-radius: var(--cw-radius-sm);
  border: 1px solid var(--cw-border);
  background: var(--cw-bg-surface);
  transition: all 0.15s ease;
}

.cw-help-summary:hover {
  color: var(--cw-accent, #0284c7);
  border-color: var(--cw-accent, #0284c7);
}

.cw-help-content {
  margin-top: 8px;
  padding: 10px 14px;
  border-radius: var(--cw-radius-sm, 8px);
  background: var(--cw-bg-subtle, rgba(0, 0, 0, 0.02));
  border: 1px solid var(--cw-border);
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--cw-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.cw-help-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.cw-help-bullet {
  color: var(--cw-accent, #0284c7);
  font-weight: 700;
}

.cw-help-item p {
  margin: 0;
}

.cw-help-item strong {
  color: var(--cw-text-primary);
}

/* 配额输入表单 */
.cw-roster-fieldset {
  border: 0;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cw-tier-quota-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

@media (max-width: 600px) {
  .cw-tier-quota-grid {
    grid-template-columns: 1fr;
  }
}

.cw-quota-cabin {
  padding: 12px 14px;
  border-radius: var(--cw-radius-sm, 8px);
  background: var(--cw-bg-surface);
  border: 1px solid var(--cw-border);
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: all 0.15s ease;
}

.cw-quota-cabin.is-major-tier {
  border-left: 3px solid var(--cw-accent, #0284c7);
}

.cw-quota-cabin.is-minor-tier {
  border-left: 3px solid var(--cw-text-muted, #94a3b8);
}

.cw-cabin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cw-cabin-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.cw-tier-badge {
  font-size: 12px;
  font-weight: 700;
}

.cw-tier-badge.badge-major {
  color: var(--cw-accent, #0284c7);
}

.cw-tier-badge.badge-minor {
  color: var(--cw-text-secondary);
}

.cw-current-quota-tag {
  font-size: 11px;
  color: var(--cw-text-muted);
}

.cw-quota-inputs-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 440px) {
    grid-template-columns: 1fr;
  }
}

.cw-quota-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cw-field-label {
  font-size: 11px;
  color: var(--cw-text-secondary);
  font-weight: 500;
}

.cw-number-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.cw-number-input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 42px 6px 8px;
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius-sm);
  background: var(--cw-bg-card);
  color: var(--cw-text-primary);
  font-size: 13px;
  font-weight: 600;
  transition: border-color 0.15s ease;
}

.cw-number-input:focus {
  border-color: var(--cw-accent, #0284c7);
  outline: none;
}

.cw-input-unit {
  position: absolute;
  right: 8px;
  font-size: 10.5px;
  color: var(--cw-text-muted);
  pointer-events: none;
}

/* 操作底部栏 */
.cw-roster-actions-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
  padding-top: 4px;
}

.cw-dirty-badge {
  font-size: 11px;
  font-weight: 600;
}

.cw-action-btns {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-left: auto;
}

/* 提示栏替代大段暴露文字 */
.cw-info-callout {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: var(--cw-radius-sm);
  background: var(--cw-bg-subtle, rgba(0, 0, 0, 0.02));
  border: 1px solid var(--cw-border);
  color: var(--cw-text-secondary);
  font-size: 12px;
}

.cw-callout-icon {
  color: var(--cw-accent, #0284c7);
  flex-shrink: 0;
}

.cw-callout-text {
  line-height: 1.4;
}

/* 在场席位展示舱 */
.cw-active-cabins-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cw-active-cabin-box {
  padding: 12px 14px;
  border-radius: var(--cw-radius-sm, 8px);
  background: var(--cw-bg-surface);
  border: 1px solid var(--cw-border);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cw-active-cabin-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--cw-border-subtle, var(--cw-border));
}

.cw-cabin-label-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.cw-cabin-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.cw-cabin-dot.dot-major {
  background: var(--cw-accent, #0284c7);
  box-shadow: 0 0 6px var(--cw-accent, #0284c7);
}

.cw-cabin-dot.dot-minor {
  background: var(--cw-text-muted);
}

.cw-cabin-heading {
  font-size: 13px;
  font-weight: 700;
  color: var(--cw-text-primary);
}

.cw-cabin-count-tag {
  font-size: 11px;
  color: var(--cw-text-muted);
}

/* 角色席位网格 */
.cw-roster-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
}

.cw-roster-person-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: var(--cw-radius-sm, 8px);
  background: var(--cw-bg-card);
  border: 1px solid var(--cw-border);
  font-size: 12px;
  transition: all 0.15s ease;
  min-width: 0;
}

.cw-roster-person-card:hover {
  border-color: var(--cw-accent, #0284c7);
  transform: translateY(-1px);
}

.cw-roster-person-card.is-in-rotation {
  border-color: rgba(245, 158, 11, 0.4);
  background: rgba(245, 158, 11, 0.04);
}

.cw-person-avatar {
  flex-shrink: 0;
}

.cw-person-name {
  font-weight: 600;
  color: var(--cw-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.cw-rotation-pill {
  flex-shrink: 0;
  font-size: 10px;
  padding: 1px 4px;
}

/* 空席位占位 */
.cw-empty-cabin-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px;
  border-radius: var(--cw-radius-sm);
  border: 1px dashed var(--cw-border);
  color: var(--cw-text-muted);
  font-size: 12px;
}

.cw-empty-cabin-icon {
  opacity: 0.5;
}

/* 状态横幅 */
.cw-error-banner,
.cw-success-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: var(--cw-radius-sm);
  font-size: 12px;
}

.cw-error-banner {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: var(--cw-danger, #ef4444);
}

.cw-success-banner {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #10b981;
}

[data-theme='dark'] {
  .cw-quota-cabin {
    background: rgba(255, 255, 255, 0.02);
  }
  .cw-active-cabin-box {
    background: rgba(255, 255, 255, 0.02);
  }
  .cw-roster-person-card {
    background: rgba(255, 255, 255, 0.04);
  }
}
</style>
