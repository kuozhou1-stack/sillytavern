<template>
  <div class="cw-auto-control-panel" :class="{ 'is-enabled': isEnabled, 'is-disabled': !isEnabled }">
    <div class="cw-auto-control-main">
      <div class="cw-control-info">
        <div class="cw-control-icon-box">
          <SvgIcon :name="isEnabled ? 'userCheck' : 'users'" :size="20" />
        </div>
        <div class="cw-control-texts">
          <div class="cw-title-row">
            <span class="cw-control-title">自动角色调度</span>
            <span class="cw-status-pill" :class="isEnabled ? 'pill-active' : 'pill-inactive'">
              <span class="cw-status-dot"></span>
              {{ isEnabled ? '调度生效中' : '自动调度已停用' }}
            </span>
          </div>
          <span class="cw-control-sub">
            {{ isEnabled ? '正文与手机互动前将自动轮换，保持在场活跃席位' : '当前人物开启/关闭开关将严格保持现状，不进行主动换人' }}
          </span>
        </div>
      </div>

      <!-- 现代滑动开关 -->
      <label class="cw-switch-toggle" :class="{ 'is-busy': disabled || saving || !runtime }">
        <input
          type="checkbox"
          class="cw-switch-input"
          :checked="isEnabled"
          :disabled="disabled || saving || !runtime"
          @change="toggle"
        />
        <span class="cw-switch-slider"></span>
      </label>
    </div>

    <!-- 可选折叠的进阶调度说明，默认收起，不暴露大段文字 -->
    <details class="cw-auto-details-box">
      <summary class="cw-details-summary">
        <SvgIcon name="info" :size="12" />
        <span>查看调度运行机制说明</span>
      </summary>
      <div class="cw-details-content">
        <div class="cw-rule-line">
          <span class="cw-rule-bullet">·</span>
          <div class="cw-rule-text"><strong>生效时机</strong>：开局补全完成后生效，在每次正文或手机互动前自动整理在场名单。</div>
        </div>
        <div class="cw-rule-line">
          <span class="cw-rule-bullet">·</span>
          <div class="cw-rule-text"><strong>手动优先</strong>：手动强制关闭的人物不会被系统自动开启；正在互动的在场人物始终优先保留。</div>
        </div>
        <div class="cw-rule-line">
          <span class="cw-rule-bullet">·</span>
          <div class="cw-rule-text"><strong>停用效果</strong>：关闭此开关后将冻结当前角色库开启状态，维持原样不作任何变动。</div>
        </div>
      </div>
    </details>

    <div v-if="error" class="cw-error-callout" role="alert">
      <SvgIcon name="alertCircle" :size="14" />
      <span>{{ error }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { RuntimeKey, type Runtime } from '../../../../运行/host';
import SvgIcon from '../icons/SvgIcon.vue';

const runtime = inject<Runtime | null>(RuntimeKey, null);
const props = defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{ (e: 'feedback', msg: string): void; (e: 'saving', value: boolean): void }>();
const saving = ref(false), error = ref('');

const isEnabled = computed(() => runtime?.settings.characterAuto ?? true);

async function toggle(event: Event) {
  if (!runtime || props.disabled || saving.value) return;
  const checkbox = event.target as HTMLInputElement;
  const enabled = checkbox.checked;
  saving.value = true;
  emit('saving', true);
  error.value = '';
  try {
    await runtime.saveSettings({ characterAuto: enabled }, 'general');
    emit('feedback', enabled ? '自动角色调度已开启，将在下一次正文或手机互动前整理名单。' : '自动角色调度已关闭，当前人物开关保持现状。');
  } catch (cause) {
    error.value = String(cause);
  } finally {
    checkbox.checked = runtime.settings.characterAuto;
    saving.value = false;
    emit('saving', false);
  }
}
</script>

<style scoped>
.cw-auto-control-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px;
  border-radius: var(--cw-radius, 12px);
  background: var(--cw-bg-card);
  border: 1px solid var(--cw-border);
  box-shadow: var(--cw-shadow-sm);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.cw-auto-control-panel.is-enabled {
  border-color: rgba(56, 189, 248, 0.4);
  background: linear-gradient(180deg, rgba(56, 189, 248, 0.03) 0%, var(--cw-bg-card) 100%);
}

.cw-auto-control-panel.is-disabled {
  border-color: var(--cw-border);
  background: var(--cw-bg-card);
  opacity: 0.88;
}

.cw-auto-control-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.cw-control-info {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.cw-control-icon-box {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.is-enabled .cw-control-icon-box {
  background: var(--cw-accent-bg, rgba(56, 189, 248, 0.12));
  color: var(--cw-accent, #0284c7);
  border: 1px solid rgba(56, 189, 248, 0.3);
}

.is-disabled .cw-control-icon-box {
  background: var(--cw-bg-subtle, rgba(0, 0, 0, 0.04));
  color: var(--cw-text-muted);
  border: 1px solid var(--cw-border);
}

.cw-control-texts {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.cw-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.cw-control-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--cw-text-primary);
  letter-spacing: -0.2px;
}

.cw-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
}

.cw-status-pill.pill-active {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.cw-status-pill.pill-inactive {
  background: var(--cw-bg-subtle, rgba(0, 0, 0, 0.04));
  color: var(--cw-text-muted);
  border: 1px solid var(--cw-border);
}

.cw-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.pill-active .cw-status-dot {
  box-shadow: 0 0 6px currentColor;
}

.cw-control-sub {
  font-size: 12px;
  color: var(--cw-text-secondary);
  line-height: 1.45;
}

/* 现代开关 Switch */
.cw-switch-toggle {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
  cursor: pointer;
  user-select: none;
}

.cw-switch-toggle.is-busy {
  opacity: 0.6;
  cursor: not-allowed;
}

.cw-switch-input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.cw-switch-slider {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--cw-border, #cbd5e1);
  border-radius: 24px;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.cw-switch-slider::before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: #ffffff;
  border-radius: 50%;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.cw-switch-input:checked + .cw-switch-slider {
  background-color: var(--cw-accent, #0284c7);
}

.cw-switch-input:checked + .cw-switch-slider::before {
  transform: translateX(20px);
}

/* 进阶折叠说明盒 */
.cw-auto-details-box {
  border-top: 1px dashed var(--cw-border);
  padding-top: 10px;
  font-size: 12px;
}

.cw-details-summary {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  color: var(--cw-text-muted);
  font-weight: 500;
  user-select: none;
  transition: color 0.15s ease;
}

.cw-details-summary:hover {
  color: var(--cw-accent, #0284c7);
}

.cw-details-content {
  margin-top: 8px;
  padding: 10px 14px;
  border-radius: var(--cw-radius-sm, 8px);
  background: var(--cw-bg-subtle, rgba(0, 0, 0, 0.02));
  border: 1px solid var(--cw-border-subtle, var(--cw-border));
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--cw-text-secondary);
  line-height: 1.5;
}

.cw-rule-line {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.cw-rule-bullet {
  color: var(--cw-accent, #0284c7);
  font-weight: 700;
  line-height: 1.2;
}

.cw-rule-text strong {
  color: var(--cw-text-primary);
}

.cw-error-callout {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: var(--cw-radius-sm);
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: var(--cw-danger, #ef4444);
  font-size: 12px;
}

[data-theme='dark'] {
  .cw-auto-control-panel.is-enabled {
    border-color: rgba(56, 189, 248, 0.3);
    background: linear-gradient(180deg, rgba(56, 189, 248, 0.05) 0%, var(--cw-bg-card) 100%);
  }
  .cw-switch-slider {
    background-color: rgba(255, 255, 255, 0.18);
  }
}
</style>
