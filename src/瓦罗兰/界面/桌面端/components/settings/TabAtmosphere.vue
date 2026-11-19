<template>
  <form class="cw-atmosphere-form" @submit.prevent="save">
    <header class="cw-atmosphere-heading">
      <SvgIcon name="sparkles" :size="18" />
      <label for="valoran-atmosphere-design">故事氛围</label>
      <span v-if="dirty" class="cw-badge cw-badge-warning">未保存修改</span>
    </header>
    <p id="valoran-atmosphere-hint" class="cw-atmosphere-hint">写下希望的关系节奏、互动方式或事件倾向。留空可恢复默认氛围。</p>
    <div v-if="runtime?.view.settingsWarning && !notice && !error" class="cw-callout cw-callout-warning" role="status">
      {{ runtime.view.settingsWarning }}
    </div>
    <textarea
      id="valoran-atmosphere-design"
      v-model="draft"
      aria-describedby="valoran-atmosphere-hint"
      class="cw-input cw-atmosphere-input"
      rows="8"
      placeholder="例如：魔法与科技融入日常，人物主动交流，关系慢慢发展；异常发生后，生活安排和城市修复持续变化。"
    />
    <div v-if="notice" class="cw-callout cw-callout-success" role="status">{{ notice }}</div>
    <div v-if="error" class="cw-callout cw-callout-danger" role="alert">{{ error }}</div>
    <div class="cw-atmosphere-actions">
      <span class="cw-atmosphere-scope">同一酒馆账号可跨端读取</span>
      <div class="cw-atmosphere-buttons">
        <button type="button" class="cw-btn cw-btn-secondary cw-btn-sm" :disabled="saving" @click="syncShared">读取共用配置</button>
        <button type="button" class="cw-btn cw-btn-secondary cw-btn-sm" :disabled="saving || !dirty" @click="reset">撤销修改</button>
        <button type="submit" class="cw-btn cw-btn-primary cw-btn-sm" :disabled="saving">{{ saving ? '保存中…' : '保存氛围设计' }}</button>
      </div>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { RuntimeKey, type Runtime } from '../../../../运行/host';
import SvgIcon from '../icons/SvgIcon.vue';

const runtime = inject<Runtime | null>(RuntimeKey, null);
const cache = window as typeof window & { __VALORAN_ATMOSPHERE_DRAFT__?: string };
const saved = computed(() => runtime?.settings.atmosphere ?? '');
const draft = ref(cache.__VALORAN_ATMOSPHERE_DRAFT__ ?? saved.value);
const dirty = computed(() => draft.value !== saved.value);
const saving = ref(false), notice = ref(''), error = ref('');

watch(draft, value => { cache.__VALORAN_ATMOSPHERE_DRAFT__ = value; }, { flush: 'sync' });
watch(saved, (next, previous) => {
  if (draft.value === previous) {
    draft.value = next;
    delete cache.__VALORAN_ATMOSPHERE_DRAFT__;
  }
});

function reset() {
  draft.value = saved.value;
  delete cache.__VALORAN_ATMOSPHERE_DRAFT__;
  error.value = '';
  notice.value = '';
}
async function save() {
  if (!runtime) { error.value = '离线展示不保存氛围设计'; return; }
  if (saving.value) return;
  saving.value = true;
  notice.value = '';
  error.value = '';
  const submitted = draft.value;
  try {
    const warning = await runtime.saveSettings({ atmosphere: submitted }, 'atmosphere');
    if (draft.value === submitted) delete cache.__VALORAN_ATMOSPHERE_DRAFT__;
    if (warning) error.value = warning;
    else notice.value = submitted.trim() ? '氛围设计已保存，下次生成时生效。' : '氛围设计已清空。';
  } catch (cause) { error.value = `保存失败：${String(cause)}`; }
  finally { saving.value = false; }
}
async function syncShared() {
  if (!runtime || saving.value) return;
  saving.value = true;
  notice.value = '';
  error.value = '';
  try {
    const warning = await runtime.reloadSettings('atmosphere');
    reset();
    if (warning) error.value = warning;
    else notice.value = '已读取酒馆共用配置。';
  } catch (cause) { error.value = `读取失败：${String(cause)}`; }
  finally { saving.value = false; }
}
</script>

<style scoped>
.cw-atmosphere-form {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card);
}
.cw-atmosphere-heading, .cw-atmosphere-actions, .cw-atmosphere-buttons {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.cw-atmosphere-heading {
  color: var(--cw-accent);
  border-bottom: 1px solid var(--cw-border);
  padding-bottom: 10px;
}
.cw-atmosphere-heading label { color: var(--cw-text-primary); font-size: 15px; font-weight: 600; }
.cw-atmosphere-heading .cw-badge { margin-left: auto; }
.cw-atmosphere-input {
  box-sizing: border-box;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius-sm);
  color: var(--cw-text-primary);
  background: var(--cw-bg-input);
  font: inherit;
  font-size: 14px;
  line-height: 1.7;
  resize: vertical;
}
.cw-atmosphere-input:focus-visible { outline: 2px solid var(--cw-accent); outline-offset: 1px; }
.cw-atmosphere-hint, .cw-atmosphere-scope { margin: 0; color: var(--cw-text-secondary); font-size: 12px; line-height: 1.6; }
.cw-atmosphere-actions { justify-content: space-between; }
.cw-atmosphere-buttons { margin-left: auto; }
</style>
