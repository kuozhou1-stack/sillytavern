<template>
  <section class="cw-information-quota">
    <h4>{{ kind }}资料配额</h4>
    <p>按剧情相关性选择，可少于上限；轮换不足时可少换。当前必要资料和手动展开优先保留，完整档案不会删除。</p>
    <form @submit.prevent="save">
      <label>开启上限<input v-model.number="draft.limit" type="number" min="0" step="1" required :disabled="blocked" :aria-label="`${kind}开启上限`" /></label>
      <label>每轮最多轮换<input v-model.number="draft.rotation" type="number" min="0" :max="draft.limit" step="1" required :disabled="blocked" :aria-label="`${kind}每轮最多轮换`" /></label>
      <button type="submit" class="cw-btn cw-btn-primary cw-btn-sm" :disabled="blocked || !dirty">保存配额</button>
    </form>
    <p v-if="error" class="cw-quota-error" role="alert">{{ error }}</p>
    <p v-else-if="notice" role="status">{{ notice }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { klona } from 'klona';
import { RuntimeKey, type Runtime } from '../../../../运行/host';
import { InformationRosterSettingsSchema } from '../../../../运行/settings';

const props = defineProps<{ kind: '地点' | '组织' }>();
const runtime = inject<Runtime | null>(RuntimeKey, null);
const emit = defineEmits<{ (e: 'feedback', text: string): void }>();
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
    emit('feedback', notice.value);
  } catch (cause) {
    error.value = String(cause);
  } finally { saving.value = false; }
}
</script>

<style scoped>
.cw-information-quota { padding: 16px; border: 1px solid var(--cw-border, #ddd); border-radius: 12px; }
h4 { margin: 0 0 8px; }
p { margin: 8px 0; font-size: 12px; line-height: 1.6; opacity: .8; }
form { display: flex; align-items: end; gap: 12px; flex-wrap: wrap; }
label { display: grid; gap: 6px; font-size: 12px; }
input { width: 100px; padding: 7px; color: inherit; background: transparent; border: 1px solid var(--cw-border, #ccc); border-radius: 6px; }
.cw-quota-error { color: var(--cw-danger, #bc3b3b); opacity: 1; }
</style>
