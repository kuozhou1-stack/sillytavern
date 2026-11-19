<template>
  <div :class="embedded ? 'cw-library-panel' : 'cw-modal-backdrop'" @click.self="!embedded && emit('close')">
    <div class="cw-char-manage-modal" :class="embedded ? 'cw-library-content' : 'cw-modal-box'">
      <div v-if="!embedded" class="cw-modal-header">
        <div class="cw-header-title">
          <SvgIcon name="settings" :size="20" class="cw-header-icon" />
          <span>角色插拔与生命周期管理</span>
        </div>
        <button class="cw-btn cw-btn-ghost cw-close-btn" @click="emit('close')">
          <SvgIcon name="close" :size="18" />
        </button>
      </div>

      <!-- 角色管理导航 -->
      <div class="cw-modal-tabs">
        <button
          v-for="m in modes"
          :key="m.key"
          class="cw-modal-tab-btn"
          :class="{ active: currentMode === m.key }"
          :aria-pressed="currentMode === m.key"
          @click="currentMode = m.key"
        >
          <SvgIcon :name="m.icon" :size="15" />
          <span>{{ m.label }}</span>
        </button>
      </div>

      <div class="cw-modal-body">
        <!-- 分类与启停整理 -->
        <CharacterOrganizeTab
          v-show="currentMode === 'organize'"
          :characters="characters"
          @inspect-character="handleInspectChar"
        />

        <CharacterBatchImport
          v-show="currentMode === 'import'"
          :existing="characters"
          :import-characters="importCharacters"
        />

        <!-- 角色导出 -->
        <div v-if="currentMode === 'export'" class="cw-manage-pane">
          <div class="cw-select-row">
            <label class="cw-label">选择导出角色：</label>
            <input
              v-model="exportQuery"
              type="search"
              placeholder="搜索角色姓名/ID/层级..."
              class="cw-manage-search-input"
              aria-label="搜索导出角色"
            />
            <select v-model="exportCharId" class="cw-manage-select" aria-label="选择导出角色列表">
              <option v-for="[id, c] in filteredExportChars" :key="id" :value="id" :title="`${c.基础信息?.姓名 || c.姓名 || id} (${c.层级 || '主要'})`">
                {{ formatCharOption(c.基础信息?.姓名 || c.姓名 || id, c.层级 || '主要') }}
              </option>
            </select>
            <button class="cw-btn cw-btn-primary" :disabled="!exportCharId" @click="handleGenerateExport">
              <SvgIcon name="share2" :size="14" />
              <span>生成导出 JSON</span>
            </button>
          </div>

          <div v-if="exportResultJson" class="cw-export-result">
            <textarea readonly :value="exportResultJson" class="cw-manage-textarea" rows="8"></textarea>
            <div class="cw-export-actions">
              <button class="cw-btn cw-btn-primary" @click="downloadExport">下载 JSON 文件</button>
              <button class="cw-btn cw-btn-ghost" @click="copyExportJson">
                <SvgIcon name="bookmark" :size="14" />
                <span>{{ copied ? '已复制到剪贴板！' : '复制 JSON 数据' }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 角色升格 -->
        <div v-else-if="currentMode === 'promote'" class="cw-manage-pane">
          <div class="cw-select-row">
            <label class="cw-label">选择次要角色：</label>
            <input
              v-model="promoteQuery"
              type="search"
              placeholder="搜索待升格角色..."
              class="cw-manage-search-input"
              aria-label="搜索次要角色"
            />
            <select v-model="promoteCharId" class="cw-manage-select" aria-label="选择次要角色列表">
              <option v-for="c in filteredMinorList" :key="c.id" :value="c.id" :title="`${c.name} (${c.occupation || '次要角色'})`">
                {{ formatCharOption(c.name, c.occupation || '次要角色') }}
              </option>
            </select>
            <button class="cw-btn cw-btn-primary" :disabled="!promoteCharId" @click="handlePromote">
              <SvgIcon name="star" :size="14" />
              <span>确认升格</span>
            </button>
          </div>
        </div>

        <!-- 角色删除 (F32) -->
        <div v-else-if="currentMode === 'delete'" class="cw-manage-pane">
          <div class="cw-pane-desc cw-danger-text">
            <strong>注意：永久移除档案与专属账号</strong
            >（依照规则，他人已发生的记忆、聊天记录及共同历史将予以妥善保护）。
            <br />
            若您仅需要暂时不让角色参与后续剧情或停用其生成，请在【分类与启停】中关闭其开关即可，无需永久移除。
          </div>
          <div class="cw-select-row">
            <label class="cw-label">选择要删除的角色：</label>
            <input
              v-model="deleteQuery"
              type="search"
              placeholder="搜索角色名/ID..."
              class="cw-manage-search-input"
              aria-label="搜索删除角色"
            />
            <select v-model="deleteCharId" class="cw-manage-select" aria-label="选择要删除的角色" @change="showDeleteConfirm = false">
              <option value="">-- 请选择角色 --</option>
              <option v-for="[id, c] in filteredDeleteChars" :key="id" :value="id" :title="`${c.基础信息?.姓名 || c.姓名 || id} (${id})`">
                {{ formatCharOption(c.基础信息?.姓名 || c.姓名 || id, id) }}
              </option>
            </select>
            <button
              v-if="!showDeleteConfirm"
              class="cw-btn cw-btn-danger"
              :disabled="!deleteCharId"
              @click="handleRequestDelete"
            >
              <SvgIcon name="trash" :size="14" />
              <span>评估并准备删除</span>
            </button>
          </div>

          <!-- 二次确认与影响分析卡片 (F32) -->
          <div v-if="showDeleteConfirm && targetDeleteChar" class="cw-delete-confirm-box">
            <div class="cw-confirm-header">
              <SvgIcon name="alertTriangle" :size="20" class="cw-danger-icon" />
              <h4 class="cw-confirm-title">
                确认删除角色档案：{{ targetDeleteChar.基础信息?.姓名 || targetDeleteChar.姓名 || deleteCharId }}？
              </h4>
            </div>

            <div class="cw-impact-analysis">
              <div class="cw-impact-row">
                <span class="cw-impact-k">角色标识：</span>
                <span class="cw-impact-v">{{ deleteCharId }} ({{ targetDeleteChar.层级 || '主要' }}角色)</span>
              </div>
              <div class="cw-impact-row">
                <span class="cw-impact-k">直接影响：</span>
                <span class="cw-impact-v">将从当前存档中移除该角色的专属属性、认知、经历与住址。</span>
              </div>
              <div class="cw-impact-row">
                <span class="cw-impact-k">专属账号：</span>
                <span class="cw-impact-v">{{
                  deleteImpactAccounts.length > 0 ? deleteImpactAccounts.join('、') : '名下无专属网络账号'
                }}</span>
              </div>
              <div class="cw-impact-row">
                <span class="cw-impact-k">规则保护：</span>
                <span class="cw-impact-v cw-safe-hint"
                  >他人既有记忆、聊天楼层中已记录的交集与共同历史将继续保留，不受破坏。</span
                >
              </div>
            </div>

            <div class="cw-confirm-actions">
              <button class="cw-btn cw-btn-ghost" @click="showDeleteConfirm = false">取消</button>
              <button class="cw-btn cw-btn-danger" @click="handleExecuteDelete">
                <SvgIcon name="trash" :size="14" />
                <span>确认永久移除</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useWorldState } from '../../utils/context';
import { exportCharacter } from '../../../../运行/characters';
import SvgIcon from '../icons/SvgIcon.vue';
import CharacterBatchImport from '../shared/CharacterBatchImport.vue';
import CharacterOrganizeTab from './CharacterOrganizeTab.vue';

const state = useWorldState();

const props = defineProps<{
  characters: Record<string, any>;
  embedded?: boolean;
  exportCharacter?: (id: string) => unknown;
  importCharacters: (values: any[], submissionId: string) => Promise<void>;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'importCharacter', data: any): void;
  (e: 'deleteCharacter', charId: string): void;
  (e: 'promoteCharacter', charId: string): void;
  (e: 'inspectCharacter', charId: string): void;
}>();

function handleKeydown(e: KeyboardEvent) {
  if (!props.embedded && e.key === 'Escape') {
    emit('close');
  }
}
onMounted(() => window.addEventListener('keydown', handleKeydown));
onUnmounted(() => window.removeEventListener('keydown', handleKeydown));

const modes = [
  { key: 'organize', label: '分类与启停', icon: 'layers' },
  { key: 'import', label: '角色导入', icon: 'userPlus' },
  { key: 'export', label: '角色导出', icon: 'share2' },
  { key: 'promote', label: '次要角色升格', icon: 'star' },
  { key: 'delete', label: '角色移除', icon: 'trash' },
];

const currentMode = ref('organize');

function handleInspectChar(charId: string) {
  emit('inspectCharacter', charId);
}

// 导出
const exportCharId = ref(Object.keys(props.characters || {})[0] || '');
const exportResultJson = ref('');
const copied = ref(false);
const exportQuery = ref('');
const promoteQuery = ref('');
const deleteQuery = ref('');

function formatCharOption(name: string, sub: string, maxLen = 20) {
  const combined = `${name} (${sub})`;
  if (combined.length <= maxLen) return combined;
  const cutName = name.length > 9 ? name.slice(0, 9) + '…' : name;
  const cutSub = sub.length > 7 ? sub.slice(0, 7) + '…' : sub;
  return `${cutName} (${cutSub})`;
}

const filteredExportChars = computed(() => {
  const q = exportQuery.value.trim().toLocaleLowerCase();
  const entries = Object.entries(props.characters || {});
  if (!q) return entries;
  return entries.filter(([id, c]: [string, any]) => {
    const name = c.基础信息?.姓名 || c.姓名 || id;
    const tier = c.层级 || '主要';
    return name.toLocaleLowerCase().includes(q) || id.toLocaleLowerCase().includes(q) || tier.toLocaleLowerCase().includes(q);
  });
});

function handleGenerateExport() {
  if (!exportCharId.value) return;
  exportResultJson.value = JSON.stringify(
    props.exportCharacter
      ? props.exportCharacter(exportCharId.value)
      : exportCharacter(state.value, exportCharId.value),
    null,
    2,
  );
}

async function copyExportJson() {
  if (!exportResultJson.value) return;
  try {
    await navigator.clipboard.writeText(exportResultJson.value);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    // 降级提示
    copied.value = false;
  }
}

function downloadExport() {
  if (!exportResultJson.value) return;
  const url = URL.createObjectURL(new Blob([exportResultJson.value], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = '瓦洛兰人物-' + exportCharId.value.replace(/[\\/:*?"<>|]/g, '_') + '.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 升格 (F09: 规范读取身份字符串)
const minorList = computed(() => {
  return Object.entries(props.characters || {})
    .filter(([id, c]: [string, any]) => c.层级 === '次要' && !state.value._系统.角色停用标识[id])
    .map(([id, c]: [string, any]) => ({
      id,
      name: c.基础信息?.姓名 || c.姓名 || id,
      occupation: (typeof c.身份 === 'string' ? c.身份 : null) || c.身份?.身份 || c.基础信息?.职业,
    }));
});
const promoteCharId = ref(minorList.value[0]?.id || '');

const filteredMinorList = computed(() => {
  const q = promoteQuery.value.trim().toLocaleLowerCase();
  if (!q) return minorList.value;
  return minorList.value.filter(c => {
    return c.name.toLocaleLowerCase().includes(q) || c.id.toLocaleLowerCase().includes(q) || (c.occupation && c.occupation.toLocaleLowerCase().includes(q));
  });
});

function handlePromote() {
  if (promoteCharId.value) {
    emit('promoteCharacter', promoteCharId.value);
  }
}

// 删除 (F32: 二次确认与影响分析)
const deleteCharId = ref('');
const showDeleteConfirm = ref(false);

const filteredDeleteChars = computed(() => {
  const q = deleteQuery.value.trim().toLocaleLowerCase();
  const entries = Object.entries(props.characters || {});
  if (!q) return entries;
  return entries.filter(([id, c]: [string, any]) => {
    const name = c.基础信息?.姓名 || c.姓名 || id;
    return name.toLocaleLowerCase().includes(q) || id.toLocaleLowerCase().includes(q);
  });
});

const targetDeleteChar = computed(() => {
  if (!deleteCharId.value) return null;
  return props.characters[deleteCharId.value] || null;
});

const deleteImpactAccounts = computed(() => {
  if (!deleteCharId.value) return [];
  const accs = state?.value?.手机?.账号 || {};
  return Object.values(accs)
    .filter((a: any) => a.人物id === deleteCharId.value)
    .map((a: any) => (a.昵称 ? `${a.昵称}(${a.平台})` : a.账号名));
});

function handleRequestDelete() {
  if (!deleteCharId.value) return;
  showDeleteConfirm.value = true;
}

function handleExecuteDelete() {
  if (deleteCharId.value) {
    emit('deleteCharacter', deleteCharId.value);
    deleteCharId.value = '';
    showDeleteConfirm.value = false;
  }
}
</script>

<style scoped lang="scss">
.cw-char-manage-modal {
  width: 900px;
  height: 640px;
  max-width: calc(100% - 16px);
  max-height: calc(100% - 16px);

  @media (max-width: 640px) {
    width: 100%;
    height: 100%;
    max-height: 100%;
    border-radius: 0;
  }
}

.cw-modal-header {
  padding: 14px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--cw-border);
  background: var(--cw-bg-card-subtle);

  .cw-header-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 15px;
    font-weight: 600;
  }
}

.cw-modal-tabs {
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--cw-border);
  background: var(--cw-bg-surface);
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }

  .cw-modal-tab-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: var(--cw-radius);
    border: 1px solid transparent;
    background: transparent;
    color: var(--cw-text-secondary);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;

    &:hover {
      background: var(--cw-bg-card-subtle);
      color: var(--cw-text-primary);
    }

    &.active {
      background: var(--cw-accent-bg);
      color: var(--cw-accent);
      border-color: var(--cw-accent-border);
      font-weight: 600;
    }
  }
}

.cw-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

.cw-pane-desc {
  font-size: 13px;
  color: var(--cw-text-muted);
  line-height: 1.6;
  margin-bottom: 16px;

  &.cw-danger-text {
    color: var(--cw-danger);
  }
}

.cw-manage-textarea {
  width: 100%;
  padding: 12px;
  border-radius: var(--cw-radius);
  border: 1px solid var(--cw-border);
  background: var(--cw-bg-input);
  font-family: monospace, sans-serif;
  font-size: 12px;
  color: var(--cw-text-primary);
  resize: vertical;
  outline: none;

  &:focus {
    border-color: var(--cw-accent);
  }
}

.cw-import-actions,
.cw-export-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}

.cw-preview-card {
  margin-top: 16px;
  padding: 14px 18px;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);
  display: flex;
  flex-direction: column;
  gap: 8px;

  .cw-prev-header {
    display: flex;
    align-items: center;
    justify-content: space-between;

    .cw-prev-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--cw-text-primary);
    }
  }

  .cw-prev-desc {
    margin: 0;
    font-size: 13px;
    color: var(--cw-text-secondary);
  }
}

.cw-select-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;

  .cw-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--cw-text-secondary);
    white-space: nowrap;
    width: 100%;
  }

  .cw-manage-search-input,
  .cw-manage-select {
    padding: 7px 12px;
    border-radius: var(--cw-radius);
    border: 1px solid var(--cw-border);
    background: var(--cw-bg-surface);
    color: var(--cw-text-primary);
    font-size: 13px;
    outline: none;
    flex: 1 1 160px;
    min-width: 0;
    max-width: 100%;

    &:focus {
      border-color: var(--cw-accent);
    }
  }

  .cw-btn {
    flex-shrink: 0;
    white-space: nowrap;
  }
}

.cw-delete-confirm-box {
  margin-top: 16px;
  padding: 16px;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-danger);

  .cw-confirm-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;

    .cw-danger-icon {
      color: var(--cw-danger);
    }
    .cw-confirm-title {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--cw-danger);
    }
  }

  .cw-impact-analysis {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    border-radius: var(--cw-radius-sm);
    background: var(--cw-bg-surface);
    border: 1px solid var(--cw-border);
    margin-bottom: 14px;
    font-size: 13px;

    .cw-impact-row {
      display: flex;
      align-items: flex-start;
      gap: 8px;

      .cw-impact-k {
        color: var(--cw-text-secondary);
        white-space: nowrap;
        font-weight: 500;
      }
      .cw-impact-v {
        color: var(--cw-text-primary);
      }
      .cw-safe-hint {
        color: var(--cw-text-muted);
        font-size: 12px;
      }
    }
  }

  .cw-confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }
}

.cw-library-panel {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.cw-library-content.cw-char-manage-modal {
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 0;
  height: auto;
  max-height: none;
  margin: 0;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
.cw-embedded-back {
  align-self: flex-start;
  margin: 4px 10px;
}
@media (max-width: 640px) {
  .cw-modal-tabs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    padding: 6px 8px;
    gap: 2px 4px;

    .cw-modal-tab-btn {
      justify-content: center;
      min-height: 28px;
      padding: 3px 1px;
      font-size: 12px;
      gap: 3px;
    }
  }
}
</style>
