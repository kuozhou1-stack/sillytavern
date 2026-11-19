<template>
  <form class="cw-api-form" @submit.prevent="save">
    <div v-if="!hideNotice" class="cw-callout cw-callout-info">
      <SvgIcon name="info" :size="15" class="cw-callout-icon" />
      <div class="cw-callout-body">
        <p>各通道单独保存，同一酒馆账号可跨端读取。</p>
      </div>
    </div>
    <div v-if="runtime?.view.settingsWarning && !notice && !error" class="cw-callout cw-callout-warning" role="status">
      <SvgIcon name="alertTriangle" :size="15" class="cw-callout-icon" />
      <div class="cw-callout-body">
        <p>{{ runtime.view.settingsWarning }}</p>
      </div>
    </div>
    <fieldset :disabled="saving || runtime?.view.busy || runtime?.view.updating">
      <div v-if="channel === 'variable'" class="cw-api-section-card">
        <label class="cw-api-toggle">
          <input v-model="draft.independent" type="checkbox" />
          <span class="cw-form-label">独立正文变量结算</span>
        </label>
        <p class="cw-api-note">{{ draft.independent ? '正文生成后，另发一次请求更新变量。' : '正文和变量在同一次回复中生成。下方连接仍可供资料选择使用。' }}</p>
      </div>
      <div class="cw-api-section-card">
        <div class="cw-card-header">
          <SvgIcon name="sliders" :size="15" />
          <span class="cw-card-title">连接设置</span>
        </div>
        <label v-if="channel === 'information'" class="cw-api-toggle">
          <input v-model="draft.reuseVariable" type="checkbox" />
          <span>跟随正文变量配置</span>
        </label>
        <div v-if="connectionMode === 'reuse'" class="cw-api-connection-summary">
          <span>当前连接</span><strong>{{ reusedConnection?.mode === 'main' ? '酒馆当前正文 API' : reusedConnection?.name || reusedConnection?.model || '正文变量模型尚未配置' }}</strong>
          <template v-if="reusedConnection?.mode === 'extra' && reusedConnection.autoFailover && reusedConnection.backups.length">
            <span>自动切换</span><strong>{{ reusedConnection.backups.length }} 个备用连接</strong>
          </template>
          <span>失败重试</span><strong>{{ reusedConnection?.retries || 0 }} 次</strong>
        </div>
        <label v-else class="cw-form-row">
          <span class="cw-form-label">连接方式</span>
          <select v-model="connectionMode" class="cw-select" :aria-label="`${channelLabel}使用的连接`">
            <option value="main">使用酒馆当前正文 API</option>
            <option value="extra">独立配置 API</option>
          </select>
        </label>
      </div>
      <template v-if="connectionMode === 'extra'">
        <div class="cw-api-section-card">
          <div class="cw-card-header cw-profile-heading">
            <span class="cw-card-title"><SvgIcon name="sliders" :size="15" />连接顺序</span>
            <button type="button" class="cw-btn cw-btn-secondary cw-btn-sm" @click="addProfile">
              <SvgIcon name="plus" :size="14" />添加 API
            </button>
          </div>
          <label class="cw-form-row">
            <span class="cw-form-label">编辑连接</span>
            <select v-model="selectedIndex" class="cw-select">
              <option v-for="(profile, index) in profiles" :key="index" :value="index">
                {{ index === 0 ? '首选' : '备用 ' + index }} · {{ profile.name || profile.model || '未命名连接' }}
              </option>
            </select>
          </label>
          <div v-if="profiles.length > 1" class="cw-profile-actions">
            <button type="button" class="cw-btn cw-btn-secondary cw-btn-sm" :disabled="selectedIndex === 0" @click="moveProfile(-1)">
              <SvgIcon name="arrowUp" :size="14" />提前
            </button>
            <button type="button" class="cw-btn cw-btn-secondary cw-btn-sm" :disabled="selectedIndex === profiles.length - 1" @click="moveProfile(1)">
              <SvgIcon name="arrowDown" :size="14" />延后
            </button>
            <button type="button" class="cw-btn cw-btn-secondary cw-btn-sm" @click="removeProfile">
              <SvgIcon name="trash" :size="14" />移除
            </button>
          </div>
          <div class="cw-profile-fields">
            <label class="cw-form-row">
              <span class="cw-form-label">连接名称</span>
              <input v-model.trim="currentProfile.name" class="cw-input" placeholder="例如：主用 Gemini" autocomplete="off" />
            </label>
            <label class="cw-form-row">
              <span class="cw-form-label">接口类型</span>
              <select v-model="currentProfile.source" class="cw-select">
                <option value="openai_compatible">OpenAI 兼容接口</option>
                <option value="google">Google Gemini 接口</option>
                <option value="vertex">Google Cloud Vertex AI（Gemini）</option>
              </select>
            </label>
          </div>
          <template v-if="currentProfile.source === 'vertex'">
            <div class="cw-vertex-import">
              <div class="cw-vertex-import-copy">
                <strong>Vertex 服务账号</strong>
                <p class="cw-api-note">选择 Google Cloud 的 JSON 密钥文件。私钥保存在当前浏览器。</p>
              </div>
              <button type="button" class="cw-btn cw-btn-primary cw-vertex-file-button" :disabled="importing" @click="credentialFile?.click()">
                <SvgIcon name="folder" :size="17" />
                {{ importing ? '正在导入…' : currentProfile.vertexCredentialId ? '重新导入服务账号 JSON' : '导入服务账号 JSON' }}
              </button>
              <input ref="credentialFile" class="cw-vertex-file-input" type="file" hidden accept=".json,application/json" @change="importCredential" />
            </div>
            <div class="cw-profile-fields">
              <label class="cw-form-row">
                <span class="cw-form-label">Google Cloud 项目 ID</span>
                <input v-model.trim="currentProfile.projectId" class="cw-input" placeholder="导入时从凭据读取" autocomplete="off" />
              </label>
              <label class="cw-form-row">
                <span class="cw-form-label">Vertex 区域</span>
                <input v-model.trim="currentProfile.region" class="cw-input" placeholder="global" autocomplete="off" />
              </label>
            </div>
          </template>
          <template v-else>
            <label class="cw-form-row">
              <span class="cw-form-label">API 接入地址</span>
              <input v-model="currentProfile.apiurl" :type="channel === 'variable' && !draft.independent ? 'text' : 'url'"
                class="cw-input" placeholder="https://api.example.com/v1" autocomplete="off" />
            </label>
            <div class="cw-form-row">
              <label class="cw-form-label" :for="`cw-key-${channel}`">API 访问密钥</label>
              <div class="cw-input-with-btn">
                <input :id="`cw-key-${channel}`" v-model="currentProfile.key" :type="visibleKey ? 'text' : 'password'" class="cw-input"
                  placeholder="填入 API Key" autocomplete="off" />
                <button type="button" class="cw-btn cw-btn-secondary cw-btn-sm" :aria-label="visibleKey ? '隐藏密钥' : '显示密钥'" @click="visibleKey = !visibleKey">
                  <SvgIcon :name="visibleKey ? 'eyeOff' : 'eye'" :size="14" />{{ visibleKey ? '隐藏' : '显示' }}
                </button>
              </div>
            </div>
          </template>
        </div>

        <div class="cw-api-section-card">
          <div class="cw-card-header">
            <SvgIcon name="target" :size="15" />
            <span class="cw-card-title">模型配置</span>
          </div>
          <label class="cw-form-row">
            <span class="cw-form-label">模型标识</span>
            <input v-model.lazy.trim="selectedModel" class="cw-input" placeholder="手动填写模型名，或从下方列表选择" autocomplete="off" />
          </label>
          <div class="cw-form-row">
            <label class="cw-form-label" :for="`cw-model-list-${channel}`">从服务选择模型</label>
            <div class="cw-input-with-btn">
              <select :id="`cw-model-list-${channel}`" v-model="selectedModel" class="cw-select" :disabled="loadingModels || !models.length">
                <option value="" disabled>{{ models.length ? '选择模型' : '未拉取模型列表' }}</option>
                <option v-if="currentProfile.model && !models.includes(currentProfile.model)" :value="currentProfile.model">
                  {{ currentProfile.model }}（当前填写）
                </option>
                <option v-for="model in models" :key="model" :value="model">{{ model }}</option>
              </select>
              <button type="button" class="cw-btn cw-btn-secondary cw-btn-sm" :disabled="loadingModels || importing || !canFetchModels" @click="fetchModels">
                <SvgIcon name="refreshCw" :size="14" :class="{ 'cw-spin': loadingModels }" />
                {{ loadingModels ? '获取中…' : '获取最新列表' }}
              </button>
            </div>
          </div>
          <label v-if="currentProfile.source === 'vertex'" class="cw-form-row">
            <span class="cw-form-label">思考强度</span>
            <select v-model="currentProfile.vertexThinkingLevel" class="cw-select" :disabled="thinkingLevels.length < 2">
              <option v-for="level in thinkingLevels" :key="level" :value="level">{{ thinkingLabels[level] }}</option>
            </select>
          </label>
          <p v-if="modelFeedback" class="cw-api-note" :role="modelFailed ? 'alert' : 'status'">{{ modelFeedback }}</p>
        </div>
      </template>

      <div v-if="connectionMode !== 'reuse'" class="cw-api-section-card">
        <template v-if="connectionMode === 'extra'">
          <label class="cw-api-toggle">
            <input v-model="draft.autoFailover" type="checkbox" />
            <span>失败时自动切换到下一个 API</span>
          </label>
          <p class="cw-api-note">{{ draft.autoFailover ? '先使用首选连接，失败后按备用顺序尝试。' : '每次请求都使用首选连接。' }}</p>
        </template>
        <label class="cw-form-row">
          <span class="cw-form-label">{{ connectionMode === 'extra' && draft.autoFailover ? '全部连接失败后的重试轮数' : '请求失败自动重试' }}</span>
          <select v-model="draft.retries" class="cw-select">
            <option :value="0">不自动重试</option>
            <option v-for="count in [1, 2, 3, 5]" :key="count" :value="count">{{ count }} 次</option>
          </select>
        </label>
      </div>
    </fieldset>

    <!-- 每组操作按钮清楚归属于对应配置区，避免多个固定操作栏互相叠压 -->
    <div class="cw-api-form-actions">
      <div class="cw-bar-status">
        <span v-if="isDirty" class="cw-badge cw-badge-warning">未保存草稿</span>
        <div v-if="notice" class="cw-callout cw-callout-success" role="status">
          <SvgIcon name="checkCircle" :size="14" class="cw-callout-icon" />
          <div class="cw-callout-body">
            <p>{{ notice }}</p>
          </div>
        </div>
        <div v-if="error" class="cw-callout cw-callout-danger" role="alert">
          <SvgIcon name="alertTriangle" :size="14" class="cw-callout-icon" />
          <div class="cw-callout-body">
            <p>{{ error }}</p>
          </div>
        </div>
      </div>
      <div class="cw-bar-actions">
        <button type="button" class="cw-btn cw-btn-secondary cw-btn-sm" :disabled="saving" @click="syncShared">
          读取共用配置
        </button>
        <button type="button" class="cw-btn cw-btn-secondary cw-btn-sm" :disabled="saving || !isDirty" @click="reset">
          撤销修改
        </button>
        <button type="submit" class="cw-btn cw-btn-primary cw-btn-sm" :disabled="saving || importing">
          <SvgIcon :name="saving ? 'refreshCw' : 'check'" :size="14" :class="{ 'cw-spin': saving }" />
          <span>{{ saving ? '保存中…' : `保存${channelLabel}配置` }}</span>
        </button>
      </div>
    </div>
  </form>
</template>

<script setup lang="ts">
import { inject, reactive, ref, watch, onBeforeUnmount, computed } from 'vue';
import { klona } from 'klona';
import { z } from 'zod';
import { RuntimeKey, type Runtime } from '../../../../运行/host';
import { ApiProfileSchema, type ApiProfile, ApiSettingsSchema, VariableApiSettingsSchema, InformationApiSettingsSchema, validateApi, type ApiChannel } from '../../../../运行/settings';
import { importVertexServiceAccount, listVertexModels, vertexThinkingLevels, type VertexThinkingLevel } from '../../../../运行/vertex';
import SvgIcon from '../icons/SvgIcon.vue';

const props = withDefaults(
  defineProps<{
    channel: ApiChannel;
    hideNotice?: boolean;
  }>(),
  {
    hideNotice: false,
  },
);
const channelLabel = computed(() => ({ variable: '正文变量', phone: '手机与奇遇', information: '资料选择' })[props.channel]);
const runtime = inject<Runtime | null>(RuntimeKey, null);
const reusedConnection = computed(() => runtime?.settings.variable);
const DraftSchema = InformationApiSettingsSchema.extend({ independent: VariableApiSettingsSchema.shape.independent });

// 解决 F26：模块级草稿缓存，切页、切Tab或关闭再打开不会静默丢失未保存输入
const globalDraftCache: Record<string, any> = (window as any).__CW_API_DRAFTS__ || {};
(window as any).__CW_API_DRAFTS__ = globalDraftCache;

function loadInitialState() {
  const cached = globalDraftCache[props.channel];
  if (cached) {
    return klona(cached);
  }
  return DraftSchema.parse(runtime?.settings[props.channel] ?? {});
}

const draft = reactive(DraftSchema.parse(loadInitialState()));
const connectionMode = computed<'reuse' | 'main' | 'extra'>({
  get: () => props.channel === 'information' && draft.reuseVariable ? 'reuse' : draft.mode,
  set: value => {
    if (props.channel === 'information') draft.reuseVariable = value === 'reuse';
    if (value !== 'reuse') draft.mode = value;
  },
});

// 同步草稿至缓存
watch(
  draft,
  val => {
    globalDraftCache[props.channel] = klona(val);
  },
  { deep: true },
);

// 判断是否有未保存修改
const isDirty = computed(() => {
  const currentSaved = JSON.stringify(DraftSchema.parse(runtime?.settings[props.channel] ?? {}));
  const currentDraft = JSON.stringify(DraftSchema.parse(draft));
  return currentSaved !== currentDraft;
});

const selectedIndex = ref(0);
const profiles = computed<ApiProfile[]>(() => [draft, ...draft.backups]);
const currentProfile = computed(() => profiles.value[selectedIndex.value] ?? draft);
const credentialFile = ref<HTMLInputElement>();
const thinkingLevels = computed(() => vertexThinkingLevels(currentProfile.value.model));
const thinkingLabels: Record<VertexThinkingLevel, string> = {
  default: '模型默认', minimal: '最低（Minimal）', low: '低（Low）', medium: '中（Medium）', high: '高（High）', xhigh: '极高（XHigh）',
};
const selectedModel = computed({
  get: () => currentProfile.value.model,
  set: (model: string) => {
    const profile = currentProfile.value;
    profile.model = model;
    if (profile.source === 'vertex' && !vertexThinkingLevels(model).includes(profile.vertexThinkingLevel)) {
      profile.vertexThinkingLevel = 'default';
    }
  },
});
const saving = ref(false);
const visibleKey = ref(false);
const importing = ref(false);
const loadingModels = ref(false);
const models = ref<string[]>([]);
const notice = ref('');
const error = ref('');
const modelFeedback = ref('');
const modelFailed = ref(false);
const canFetchModels = computed(() => {
  const profile = currentProfile.value;
  return profile.source === 'vertex' ? Boolean(profile.projectId && profile.region && profile.vertexCredentialId) : Boolean(profile.apiurl);
});
let modelRequest = 0;
let vertexListRequest: AbortController | undefined;
let importRequest = 0;

function clearModelList() {
  modelRequest++;
  vertexListRequest?.abort();
  vertexListRequest = undefined;
  models.value = [];
  modelFeedback.value = '';
  loadingModels.value = false;
}

watch(
  () => {
    const profile = currentProfile.value;
    return [selectedIndex.value, profile.source, profile.apiurl, profile.key, profile.projectId, profile.region, profile.vertexCredentialId, connectionMode.value];
  },
  clearModelList,
  { flush: 'sync' },
);

function leaveProfile() {
  importRequest++;
  importing.value = false;
  visibleKey.value = false;
  error.value = '';
  notice.value = '';
  clearModelList();
}

watch([selectedIndex, () => currentProfile.value.source, connectionMode], leaveProfile, { flush: 'sync' });

onBeforeUnmount(() => {
  clearModelList();
  importRequest++;
});

function addProfile() {
  draft.backups.push(ApiProfileSchema.parse({}));
  selectedIndex.value = draft.backups.length;
}

function moveProfile(delta: number) {
  const next = selectedIndex.value + delta;
  if (next < 0 || next >= profiles.value.length) return;
  const current = currentProfile.value;
  const other = profiles.value[next];
  const copy = ApiProfileSchema.parse(current);
  Object.assign(current, ApiProfileSchema.parse(other));
  Object.assign(other, copy);
  selectedIndex.value = next;
}

function removeProfile() {
  if (!draft.backups.length) return;
  leaveProfile();
  if (selectedIndex.value === 0) Object.assign(draft, draft.backups.shift());
  else draft.backups.splice(selectedIndex.value - 1, 1);
  selectedIndex.value = Math.min(selectedIndex.value, draft.backups.length);
}

function reset() {
  leaveProfile();
  selectedIndex.value = 0;
  Object.assign(draft, DraftSchema.parse(runtime?.settings[props.channel] ?? {}));
  delete globalDraftCache[props.channel];
  notice.value = '已恢复至当前保存的配置。';
}

async function syncShared() {
  if (!runtime || saving.value) return;
  saving.value = true;
  error.value = '';
  notice.value = '';
  try {
    const warning = await runtime.reloadSettings(props.channel);
    if (warning) { error.value = warning; return; }
    reset();
    notice.value = '已读取酒馆共用配置，并更新浏览器副本。';
  } catch (cause) {
    error.value = `同步失败：${cause instanceof Error ? cause.message : String(cause)}`;
  } finally {
    saving.value = false;
  }
}

async function importCredential(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  input.value = '';
  const current = ++importRequest;
  importing.value = true;
  clearModelList();
  try {
    const content = await file.text();
    if (current !== importRequest) return;
    const credential = await importVertexServiceAccount(content);
    if (current !== importRequest) return;
    Object.assign(currentProfile.value, credential);
    importing.value = false;
    await fetchModels();
  } catch (cause) {
    if (current === importRequest) {
      modelFailed.value = true;
      modelFeedback.value = `服务账号导入失败：${cause instanceof Error ? cause.message : String(cause)}`;
    }
  } finally {
    if (current === importRequest) importing.value = false;
  }
}

async function fetchModels() {
  if (!runtime) {
    modelFailed.value = true;
    modelFeedback.value = '离线展示不连接 API';
    return;
  }
  const profile = ApiProfileSchema.parse(currentProfile.value);
  const current = ++modelRequest;
  loadingModels.value = true;
  modelFeedback.value = '';
  modelFailed.value = false;
  try {
    validateApi(ApiSettingsSchema.parse({ ...profile, model: profile.model || 'model-list' }), channelLabel.value);
    vertexListRequest?.abort();
    vertexListRequest = profile.source === 'vertex' ? new AbortController() : undefined;
    const result = profile.source === 'vertex'
      ? await listVertexModels(profile, vertexListRequest?.signal)
      : await getModelList({ apiurl: profile.apiurl, key: profile.key });
    if (current !== modelRequest) return;
    const names = [...new Set(z.array(z.string()).parse(result).filter(Boolean))];
    models.value = profile.source === 'vertex' ? names : names.sort();
    if (!currentProfile.value.model && models.value.length === 1) selectedModel.value = models.value[0];
    modelFeedback.value = models.value.length ? `已获取 ${models.value.length} 个模型。` : '服务未返回模型，可手动填写模型标识。';
  } catch (cause) {
    if (current !== modelRequest) return;
    models.value = [];
    modelFailed.value = true;
    modelFeedback.value = profile.source === 'vertex'
      ? `Vertex 模型获取失败：${cause instanceof Error ? cause.message : String(cause)}`
      : '获取模型失败，请检查地址和密钥，或手动填写模型标识。';
  } finally {
    if (current === modelRequest) {
      loadingModels.value = false;
      vertexListRequest = undefined;
    }
  }
}

async function save() {
  if (!runtime) {
    error.value = '离线展示不保存 API 设置';
    return;
  }
  if (saving.value || importing.value) return;
  saving.value = true;
  error.value = '';
  notice.value = '';
  try {
    const schema = props.channel === 'information' ? InformationApiSettingsSchema
      : props.channel === 'variable' ? VariableApiSettingsSchema : ApiSettingsSchema;
    const api = schema.parse(klona(draft));
    const warning = await runtime.saveSettings({ [props.channel]: api }, props.channel);
    delete globalDraftCache[props.channel];
    if (warning) error.value = warning;
    else notice.value = `${channelLabel.value} API 已保存到酒馆和当前浏览器。`;
  } catch (e) {
    error.value = `保存失败：${e instanceof Error ? e.message : String(e)}`;
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped lang="scss">
.cw-api-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  position: relative;
  min-width: 0;
  container: api-form / inline-size;
}

fieldset {
  min-width: 0;
  border: 0;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cw-api-section-card {
  background: var(--cw-bg-card);
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;

  .cw-card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--cw-border);

    .cw-card-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--cw-text-primary);
    }
  }
}

.cw-profile-heading {
  justify-content: space-between;
  .cw-card-title { display: inline-flex; align-items: center; gap: 8px; }
}

.cw-profile-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.cw-profile-actions { margin-top: -4px; }
.cw-profile-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
  gap: 12px;
}
.cw-vertex-import {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  padding: 12px;
  border: 1px solid var(--cw-border-hover);
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card-subtle);
}
.cw-vertex-import-copy {
  flex: 1 1 12rem;
  min-width: 0;
  strong { display: block; color: var(--cw-text-primary); font-size: 13px; }
  p { margin-top: 4px; }
}
.cw-vertex-file-input[hidden] { display: none; }
.cw-api-form .cw-btn {
  min-height: 32px;
  line-height: 1.3;
  &:focus-visible { outline: 2px solid var(--cw-border-active); outline-offset: 2px; }
}
.cw-api-form .cw-btn-secondary {
  color: var(--cw-text-primary);
  background: var(--cw-bg-surface);
  border: 1px solid var(--cw-border-hover);
}
.cw-api-form .cw-btn-primary {
  color: #fff;
  border: 1px solid transparent;
  background: color-mix(in srgb, var(--cw-accent), #000 32%);
  &:hover:not(:disabled) { background: color-mix(in srgb, var(--cw-accent), #000 42%); }
}
.cw-api-form .cw-vertex-file-button {
  flex: 0 1 auto;
  min-height: 38px;
  padding: 8px 13px;
  font-size: 13px;
}

.cw-form-row {
  display: flex;
  flex-direction: column;
  gap: 6px;

  .cw-form-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--cw-text-secondary);
  }
}

.cw-input,
.cw-select {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius-sm);
  background: var(--cw-bg-input, var(--cw-bg-surface));
  color: var(--cw-text-primary);
  font-size: 12px;
  transition: border-color 0.15s ease;

  &:focus {
    border-color: var(--cw-accent);
    outline: none;
  }
}

.cw-input-with-btn {
  display: flex;
  gap: 8px;
  align-items: center;

  .cw-input,
  .cw-select {
    flex: 1;
    min-width: 0;
  }

  button {
    flex-shrink: 0;
  }
}

.cw-api-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--cw-text-primary);
  cursor: pointer;
  user-select: none;
}

.cw-api-note { margin: 0; font-size: 12px; line-height: 1.6; color: var(--cw-text-secondary); }
.cw-api-connection-summary {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 5px 12px;
  padding: 9px 12px;
  border-radius: var(--cw-radius-sm);
  background: var(--cw-bg-card-subtle);
  font-size: 12px;
  color: var(--cw-text-secondary);
}
.cw-api-connection-summary strong { font-weight: 500; overflow-wrap: anywhere; color: var(--cw-text-primary); }

/* 各配置区专属操作栏：自然置于表单底部，避免多卡片展开时互相叠压 */
.cw-api-form-actions {
  margin-top: 4px;
  padding-top: 14px;
  border-top: 1px solid var(--cw-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;

  .cw-bar-status {
    flex: 1;
    min-width: 0;

    .cw-callout {
      padding: 6px 10px;
      font-size: 12px;
      line-height: 1.4;
    }
  }

  .cw-bar-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    max-width: 100%;
  }
}
@container api-form (max-width: 28rem) {
  .cw-api-form-actions, .cw-bar-actions { align-items: stretch; }
  .cw-api-form-actions { flex-direction: column; }
  .cw-api-form-actions .cw-bar-actions > button { flex: 1 1 auto; }
  .cw-api-form-actions .cw-bar-actions > button[type='submit'] { flex-basis: 100%; }
}
@container api-form (max-width: 21rem) {
  .cw-input-with-btn { flex-wrap: wrap; }
  .cw-input-with-btn > .cw-select { flex-basis: 100%; }
  .cw-vertex-file-button { width: 100%; }
}
</style>
