<template>
  <section class="cw-auto-control-panel">
    <label class="cw-auto-control-main">
      <span class="cw-control-icon-box"><SvgIcon :name="icon" :size="19" /></span>
      <span class="cw-control-texts">
        <strong>{{ title }}</strong>
        <span class="cw-control-sub">{{ description }}</span>
      </span>
      <input type="checkbox" role="switch" :aria-label="title" :checked="enabled" :disabled="disabled" @change="emit('change', $event)" />
    </label>
    <details class="cw-auto-details-box">
      <summary>调度规则</summary>
      <div class="cw-details-content"><slot /></div>
    </details>
    <div v-if="error" class="cw-callout cw-callout-danger" role="alert">{{ error }}</div>
  </section>
</template>

<script setup lang="ts">
import SvgIcon from '../icons/SvgIcon.vue';
defineProps<{ title: string; description: string; icon: string; enabled: boolean; disabled?: boolean; error?: string }>();
const emit = defineEmits<{ (e: 'change', event: Event): void }>();
</script>

<style scoped>
.cw-auto-control-panel {
  display: grid;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card);
}
.cw-auto-control-main { display: flex; align-items: center; gap: 10px; cursor: pointer; }
.cw-control-icon-box { display: grid; flex-shrink: 0; place-items: center; width: 34px; height: 34px; border-radius: var(--cw-radius-sm); color: var(--cw-accent); background: var(--cw-accent-bg); }
.cw-control-texts { flex: 1; min-width: 0; display: grid; gap: 3px; font-size: 14px; color: var(--cw-text-primary); }
.cw-control-sub, .cw-auto-details-box { color: var(--cw-text-secondary); font-size: 12px; line-height: 1.6; }
.cw-auto-control-main input {
  appearance: none;
  width: 38px;
  height: 22px;
  margin: 0;
  padding: 2px;
  flex-shrink: 0;
  box-sizing: border-box;
  background: var(--cw-text-muted);
  border: 1px solid var(--cw-border);
  border-radius: 14px;
  cursor: pointer;
}
.cw-auto-control-main input::before {
  content: "";
  display: block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: white;
}
.cw-auto-control-main input:checked { background: var(--cw-accent); }
.cw-auto-control-main input:checked::before { transform: translateX(16px); }
.cw-auto-control-main input:focus-visible { outline: 2px solid var(--cw-accent); outline-offset: 2px; }
.cw-auto-control-main input:disabled { opacity: .6; cursor: not-allowed; }
.cw-auto-details-box { border-top: 1px solid var(--cw-border); padding-top: 8px; }
.cw-auto-details-box summary { cursor: pointer; }
.cw-details-content { margin-top: 6px; }
.cw-details-content :slotted(p) { margin: 4px 0; }
</style>
