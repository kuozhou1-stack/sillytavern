<template>
  <section class="cw-information-quota">
    <div class="cw-quota-heading">
      <SvgIcon name="sliders" :size="16" />
      <h4>{{ kind }}资料配额</h4>
      <span v-if="dirty" class="cw-badge cw-badge-warning">未保存修改</span>
    </div>
    <form @submit.prevent="save">
      <label>资料开启上限<input v-model.number="draft.limit" type="number" min="0" step="1" required :disabled="blocked" :aria-label="`${kind}开启上限`" /></label>
      <label>每轮最多轮换<input v-model.number="draft.rotation" type="number" min="0" :max="draft.limit" step="1" required :disabled="blocked" :aria-label="`${kind}每轮最多轮换`" /></label>
      <div class="cw-quota-footer">
        <span>必要资料和手动展开项优先保留。</span>
        <button type="submit" class="cw-btn cw-btn-primary cw-btn-sm" :disabled="blocked || !dirty">保存配额</button>
      </div>
    </form>
    <p v-if="error" class="cw-quota-error" role="alert">{{ error }}</p>
    <p v-else-if="notice" role="status">{{ notice }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { klona } from 'klona';
import { RuntimeKey, type Runtime } from '../../../../运行/host';
import SvgIcon from '../icons/SvgIcon.vue';
import { InformationRosterSettingsSchema } from '../../../../运行/settings';

const props = defineProps<{ kind: '地点' | '组织' }>();
const runtime = inject<Runtime | null>(RuntimeKey, null);
const key = computed(() => props.kind === '地点' ? 'locationRoster' : 'organizationRoster');
const saved = computed(() => runtime?.settings[key.value] ?? (props.kind === '地点' ? { limit: 6, rotation: 2 } : { limit: 3, rotation: 1 }));
const draft = ref(klona(saved.value));
const saving = ref(false), error = ref(''), notice = ref('');
const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(saved.value));
const blocked = computed(() => !runtime || runtime.view.readOnly || runtime.view.busy || runtime.view.updating || saving.value);
watch(() => JSON.stringify(saved.value), (_value, previous) => {
  if (JSON.stringify(draft.value) === previous) draft.value = klona(saved.value);
});
async function save() {
  if (!runtime) return;
  saving.value = true; error.value = ''; notice.value = '';
  try {
    const quota = InformationRosterSettingsSchema.parse(draft.value);
    await runtime.saveSettings({ [key.value]: quota }, 'general');
    notice.value = `${props.kind}配额已保存，下一次正文资料选择时生效。`;
  } catch (cause) {
    error.value = String(cause);
  } finally { saving.value = false; }
}
</script>

<style scoped>
.cw-information-quota { display: grid; gap: 12px; padding: 14px 16px; border: 1px solid var(--cw-border); border-radius: var(--cw-radius); background: var(--cw-bg-card); }
.cw-quota-heading, .cw-quota-footer { display: flex; align-items: center; gap: 8px; }
.cw-quota-heading { color: var(--cw-accent); }
.cw-quota-heading h4 { margin: 0; color: var(--cw-text-primary); font-size: 14px; }
.cw-quota-heading .cw-badge { margin-left: auto; }
form { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }
label { display: grid; gap: 6px; font-size: 12px; color: var(--cw-text-secondary); }
input { min-width: 0; width: 100%; box-sizing: border-box; padding: 7px 10px; font: inherit; color: var(--cw-text-primary); background: var(--cw-bg-input); border: 1px solid var(--cw-border); border-radius: var(--cw-radius-sm); }
.cw-quota-footer { grid-column: 1/-1; justify-content: space-between; flex-wrap: wrap; padding-top: 8px; border-top: 1px solid var(--cw-border); font-size: 12px; color: var(--cw-text-secondary); }
p { margin: 0; font-size: 12px; }
.cw-quota-error { color: var(--cw-danger); }
</style>
