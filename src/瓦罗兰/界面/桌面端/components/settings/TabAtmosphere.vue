<template>
  <form class="cw-atmosphere-form" @submit.prevent="save">
    <div class="cw-callout cw-callout-info">
      <SvgIcon name="info" :size="15" class="cw-callout-icon" />
      <div class="cw-callout-body">
        <p>填写希望呈现的氛围、互动方式、关系节奏或事件倾向。保存会同步角色卡世界书，按原生位置影响正文；也用于资料选择、人物自主生活和经历，以及手机互动与奇遇创作。</p>
        <p>瓦罗兰独立按酒馆账号保存，另留当前浏览器副本。可随时修改或留空保存；保存后用于后续 AI 请求。另一端已打开时，可点击“读取共用配置”。</p>
      </div>
    </div>
    <div v-if="runtime?.view.settingsWarning && !notice && !error" class="cw-callout cw-callout-warning" role="status">
      {{ runtime.view.settingsWarning }}
    </div>
    <label for="valoran-atmosphere-design" class="cw-form-label">氛围设计</label>
    <textarea
      id="valoran-atmosphere-design"
      v-model="draft"
      class="cw-input cw-atmosphere-input"
      rows="8"
      placeholder="例如：魔法与科技融入日常，人物主动交流，关系慢慢发展；异常发生后，生活安排和城市修复持续变化。"
    />
    <div v-if="notice" class="cw-callout cw-callout-success" role="status">{{ notice }}</div>
    <div v-if="error" class="cw-callout cw-callout-danger" role="alert">{{ error }}</div>
    <div class="cw-atmosphere-actions">
      <span v-if="dirty" class="cw-badge cw-badge-warning">未保存修改</span>
      <div class="cw-atmosphere-buttons">
        <button type="button" class="cw-btn cw-btn-ghost cw-btn-sm" :disabled="saving" @click="syncShared">读取共用配置</button>
        <button type="button" class="cw-btn cw-btn-ghost cw-btn-sm" :disabled="saving || !dirty" @click="reset">撤销修改</button>
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
const emit = defineEmits<{ (e: 'feedback', message: string): void }>();
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
    else notice.value = submitted.trim() ? '氛围设计已保存并同步世界书，将用于后续 AI 请求。' : '氛围设计已清空，世界书条目已停用。';
    emit('feedback', warning || notice.value);
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
.cw-atmosphere-form { display: flex; flex-direction: column; gap: 14px; }
.cw-atmosphere-input { width: 100%; box-sizing: border-box; resize: vertical; line-height: 1.7; }
.cw-atmosphere-actions, .cw-atmosphere-buttons { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.cw-atmosphere-actions { justify-content: space-between; }
.cw-atmosphere-buttons { margin-left: auto; }
</style>
