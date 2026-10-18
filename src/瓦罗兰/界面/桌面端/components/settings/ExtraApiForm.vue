<template>
  <form class="cw-api-form" @submit.prevent="save">
    <div v-if="!hideNotice" class="cw-callout cw-callout-info">
      <SvgIcon name="info" :size="15" class="cw-callout-icon" />
      <div class="cw-callout-body">
        <p>瓦罗兰配置独立保存在酒馆与当前浏览器，重新导卡后可复用。电脑与手机使用同一酒馆账号；另一端已打开时，可点击“读取共用配置”。</p>
      </div>
    </div>
    <div v-if="runtime?.view.settingsWarning && !notice && !error" class="cw-callout cw-callout-warning" role="status">
      <SvgIcon name="alertTriangle" :size="15" class="cw-callout-icon" />
      <div class="cw-callout-body">
        <p>{{ runtime.view.settingsWarning }}</p>
      </div>
    </div>
    <fieldset :disabled="saving || runtime?.view.busy || runtime?.view.updating">
      <div v-if="channel === 'information'" class="cw-api-section-card">
        <div class="cw-card-header">
          <SvgIcon name="sliders" :size="15" />
          <span class="cw-card-title">资料选择使用的连接</span>
        </div>
        <div class="cw-form-row">
          <label class="cw-form-label">连接模式</label>
          <select v-model="draft.reuseVariable" class="cw-select" aria-label="资料选择使用的连接">
            <option :value="true">复用正文变量 API</option>
            <option :value="false">独立配置 API</option>
          </select>
        </div>
        <div v-if="draft.reuseVariable" class="cw-callout cw-callout-info cw-reuse-callout">
          <SvgIcon name="info" :size="15" class="cw-callout-icon" />
          <div class="cw-callout-body">
            <span class="cw-callout-title">当前复用正文变量连接</span>
            <p>模型：<strong>{{ runtime?.settings.variable.model || '正文变量 API 尚未配置' }}</strong></p>
            <p>地址：<code>{{ runtime?.settings.variable.apiurl || '未配置' }}</code></p>
          </div>
        </div>
      </div>
      <template v-if="channel !== 'information' || !draft.reuseVariable">
      <!-- 卡片 1：连接与认证 -->
      <div class="cw-api-section-card">
        <div class="cw-card-header">
          <SvgIcon name="terminal" :size="15" />
          <span class="cw-card-title">连接与认证</span>
          <span v-if="isDirty" class="cw-badge cw-badge-warning">未保存草稿</span>
        </div>
        <div class="cw-form-row">
          <label class="cw-form-label">接口类型</label>
          <select v-model="draft.source" class="cw-select">
            <option value="openai_compatible">OpenAI 兼容接口</option>
            <option value="google">Google Gemini 接口</option>
          </select>
        </div>
        <div class="cw-form-row">
          <label class="cw-form-label">API 接入地址</label>
          <input
            v-model="draft.apiurl"
            type="url"
            class="cw-input"
            placeholder="https://api.example.com/v1"
            autocomplete="off"
          />
        </div>
        <div class="cw-form-row">
          <label class="cw-form-label">API 访问密钥</label>
          <div class="cw-input-with-btn">
            <input
              v-model="draft.key"
              :type="visibleKey ? 'text' : 'password'"
              class="cw-input"
              placeholder="填入 API Key"
              autocomplete="off"
            />
            <button
              type="button"
              class="cw-btn cw-btn-ghost cw-btn-sm"
              :title="visibleKey ? '隐藏密钥' : '显示密钥'"
              @click="visibleKey = !visibleKey"
            >
              <SvgIcon :name="visibleKey ? 'eyeOff' : 'eye'" :size="14" />
              <span>{{ visibleKey ? '隐藏' : '显示' }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 卡片 2：模型配置 -->
      <div class="cw-api-section-card">
        <div class="cw-card-header">
          <SvgIcon name="target" :size="15" />
          <span class="cw-card-title">模型配置</span>
        </div>
        <div class="cw-form-row">
          <label class="cw-form-label">模型标识</label>
          <input
            v-model="draft.model"
            class="cw-input"
            placeholder="手动填写模型名，或点击下方获取后从列表选择"
            autocomplete="off"
          />
        </div>
        <div class="cw-form-row">
          <label class="cw-form-label">从服务快速选择</label>
          <div class="cw-input-with-btn">
            <select
              v-model="draft.model"
              class="cw-select"
              aria-label="选择模型"
              :disabled="loadingModels || !models.length"
            >
              <option value="" disabled>{{ models.length ? '请从获取到的模型中选择' : '未拉取模型列表' }}</option>
              <option v-if="draft.model && !models.includes(draft.model)" :value="draft.model">
                {{ draft.model }}（当前填写的模型）
              </option>
              <option v-for="model in models" :key="model" :value="model">{{ model }}</option>
            </select>
            <button
              type="button"
              class="cw-btn cw-btn-ghost cw-btn-sm"
              :disabled="loadingModels || !draft.apiurl"
              @click="fetchModels"
            >
              <SvgIcon :name="loadingModels ? 'refreshCw' : 'activity'" :size="14" />
              <span>{{ loadingModels ? '获取中…' : '获取模型列表' }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 卡片 3：请求策略与重试 -->
      <div class="cw-api-section-card">
        <div class="cw-card-header">
          <SvgIcon name="settings" :size="15" />
          <span class="cw-card-title">请求策略与重试</span>
        </div>
        <div v-if="channel !== 'information'" class="cw-form-row">
          <label class="cw-api-toggle">
            <input v-model="draft.sendPreset" type="checkbox" />
            <span>{{ channel === 'phone' ? '手机变量结算携带酒馆角色卡预设' : '携带酒馆角色卡预设 (系统提示词等)' }}</span>
          </label>
          <div class="cw-api-tip-box">
            <SvgIcon name="info" :size="13" />
            <span>
              {{ channel === 'phone' ? '奇遇刷新始终使用独立内容提示词；此选项只影响手机变量结算。' : '两种模式均会依据角色卡变量更新规则结算变量。' }}
              获取模型仅测试网络连接，不触发生成和变量结算。
            </span>
          </div>
        </div>
        <div class="cw-form-row">
          <label class="cw-form-label">请求失败自动重试</label>
          <select v-model="draft.retries" class="cw-select">
            <option :value="0">不自动重试</option>
            <option :value="1">1 次</option>
            <option :value="2">2 次</option>
            <option :value="3">3 次</option>
            <option :value="5">5 次</option>
          </select>
        </div>
      </div>
      </template>
    </fieldset>

    <!-- 每组操作按钮清楚归属于对应配置区，避免多个固定操作栏互相叠压 -->
    <div class="cw-api-form-actions">
      <div class="cw-bar-status">
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
        <button type="button" class="cw-btn cw-btn-ghost cw-btn-sm" :disabled="saving" @click="syncShared">
          读取共用配置
        </button>
        <button type="button" class="cw-btn cw-btn-ghost cw-btn-sm" :disabled="saving || !isDirty" @click="reset">
          撤销修改
        </button>
        <button type="submit" class="cw-btn cw-btn-primary cw-btn-sm" :disabled="saving">
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
import { ApiSettingsSchema, InformationApiSettingsSchema, validateApi, type ApiChannel } from '../../../../运行/settings';
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
const emit = defineEmits<{ (e: 'feedback', message: string): void }>();
const runtime = inject<Runtime | null>(RuntimeKey, null);

// 解决 F26：模块级草稿缓存，切页、切Tab或关闭再打开不会静默丢失未保存输入
const globalDraftCache: Record<string, any> = (window as any).__CW_API_DRAFTS__ || {};
(window as any).__CW_API_DRAFTS__ = globalDraftCache;

function loadInitialState() {
  const cached = globalDraftCache[props.channel];
  if (cached) {
    return klona(cached);
  }
  return InformationApiSettingsSchema.parse(runtime?.settings[props.channel] ?? {});
}

const draft = reactive(InformationApiSettingsSchema.parse(loadInitialState()));

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
  const currentSaved = JSON.stringify(InformationApiSettingsSchema.parse(runtime?.settings[props.channel] ?? {}));
  const currentDraft = JSON.stringify(InformationApiSettingsSchema.parse(draft));
  return currentSaved !== currentDraft;
});

const saving = ref(false),
  visibleKey = ref(false),
  loadingModels = ref(false);
const models = ref<string[]>([]),
  notice = ref(''),
  error = ref('');
let modelRequest = 0;

watch(
  () => [draft.apiurl, draft.key, draft.source],
  () => {
    modelRequest++;
    models.value = [];
    loadingModels.value = false;
    error.value = '';
  },
  { flush: 'sync' },
);

onBeforeUnmount(() => {
  modelRequest++;
});

function reset() {
  const fresh = InformationApiSettingsSchema.parse(runtime?.settings[props.channel] ?? {});
  Object.assign(draft, fresh);
  delete globalDraftCache[props.channel];
  error.value = '';
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

async function fetchModels() {
  if (!runtime) {
    error.value = '离线展示不连接 API';
    return;
  }
  try {
    validateApi({ ...draft, model: draft.model || 'model-list' }, channelLabel.value);
  } catch (cause) {
    error.value = String(cause);
    return;
  }
  const current = ++modelRequest;
  loadingModels.value = true;
  error.value = '';
  notice.value = '';
  try {
    const result = await getModelList({ apiurl: draft.apiurl, key: draft.key });
    if (current !== modelRequest) return;
    models.value = [...new Set(z.array(z.string()).parse(result).filter(Boolean))].sort();
    if (!draft.model && models.value.length === 1) draft.model = models.value[0];
    notice.value = models.value.length
      ? `已获取 ${models.value.length} 个模型，选择后保存。`
      : '未返回模型，可手动填写。';
  } catch {
    if (current === modelRequest) error.value = '获取模型失败，请检查地址、密钥或手动填写模型名。';
  } finally {
    if (current === modelRequest) loadingModels.value = false;
  }
}

async function save() {
  if (!runtime) {
    error.value = '离线展示不保存 API 设置';
    return;
  }
  if (saving.value) return;
  saving.value = true;
  error.value = '';
  notice.value = '';
  try {
    const api = (props.channel === 'information' ? InformationApiSettingsSchema : ApiSettingsSchema).parse(klona(draft));
    if (props.channel !== 'information' || !draft.reuseVariable) validateApi(api, channelLabel.value, false);
    const warning = await runtime.saveSettings({ ...klona(runtime.settings), [props.channel]: api }, props.channel);
    delete globalDraftCache[props.channel];
    notice.value = warning ? `${channelLabel.value} API 已保存到酒馆，请查看配置提示。`
      : `${channelLabel.value} API 已保存到酒馆和当前浏览器。`;
    if (warning) error.value = warning;
    emit('feedback', notice.value);
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
  min-height: 100%;
}

fieldset {
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

.cw-api-tip-box {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 6px;
  padding: 8px 10px;
  border-radius: var(--cw-radius-sm);
  background: var(--cw-bg-subtle, rgba(0, 0, 0, 0.03));
  border: 1px solid var(--cw-border-subtle, rgba(0, 0, 0, 0.06));
  color: var(--cw-text-secondary);
  font-size: 11px;
  line-height: 1.5;

  :deep(svg) {
    flex-shrink: 0;
    margin-top: 2px;
    color: var(--cw-primary);
  }
}

.cw-badge-warning {
  margin-left: auto;
  font-size: 10px;
  background: rgba(230, 126, 34, 0.15);
  color: #e67e22;
  border: 1px solid rgba(230, 126, 34, 0.3);
  padding: 2px 6px;
  border-radius: var(--cw-radius-full);
}

.cw-reuse-callout {
  margin-top: 4px;
  code {
    font-size: 11px;
    background: rgba(0, 0, 0, 0.05);
    padding: 1px 4px;
    border-radius: 3px;
  }
}

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

  @media (max-width: 480px) {
    flex-direction: column;
    align-items: stretch;
    .cw-bar-actions {
      justify-content: flex-end;
      flex-wrap: wrap;

      button {
        flex: 1 1 auto;
        white-space: nowrap;
      }

      button[type='submit'] {
        flex-basis: 100%;
      }
    }
  }

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
    flex-shrink: 0;
  }
}
</style>
