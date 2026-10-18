<template>
  <div class="cw-step-pane">
    <div class="cw-step-header">
      <div class="cw-header-left">
        <h3 class="cw-step-title">第五步：初始结识角色配置与本地导入</h3>
        <p class="cw-step-subtitle">
          配置开局已结识的城市人物与人际关系（非必填，可完全留空开局后自主结识）。支持手动录入或选择本地 JSON 角色文件识别载入。
        </p>
      </div>
      <div class="cw-header-actions">
        <button class="cw-btn cw-btn-sm" :class="{ 'cw-btn-primary': activeSubTab === 'catalog' }" @click="activeSubTab = 'catalog'">
          <SvgIcon name="users" :size="14" /><span>预置角色库</span>
        </button>
        <button
          class="cw-btn cw-btn-sm"
          :class="{ 'cw-btn-primary': activeSubTab === 'manual' }"
          @click="activeSubTab = 'manual'"
        >
          <SvgIcon name="userPlus" :size="14" />
          <span>手动添加角色</span>
        </button>
        <button
          class="cw-btn cw-btn-sm"
          :class="{ 'cw-btn-primary': activeSubTab === 'import' }"
          @click="activeSubTab = 'import'"
        >
          <SvgIcon name="share2" :size="14" />
          <span>本地 JSON 导入</span>
        </button>
      </div>
    </div>

    <!-- 待提交名录与开局羁绊设定 (与远程预置角色库完全一致的舒展通栏格式) -->
    <section class="cw-catalog-panel cw-initial-panel">
      <div class="cw-catalog-header">
        <div class="cw-catalog-title-col">
          <h4 class="cw-catalog-title">
            <SvgIcon name="users" :size="16" />
            <span>待提交初始角色名录</span>
            <span class="cw-badge cw-badge-primary">已入选 {{ initialCharacters.length }} 位</span>
            <span v-if="bondedCount > 0" class="cw-badge cw-badge-accent">⭐ 开局结识 {{ bondedCount }} 位</span>
          </h4>
          <p class="cw-text-muted">
            入选人物将纳入世界角色库；在此填写<strong>相识依据</strong>或勾选<strong>已交换邻信</strong>的人物，将作为<strong>开局已结识的直接联系人物</strong>优先登场。
          </p>
        </div>
      </div>

      <!-- 搜索工具栏与分层过滤 (与远程预置角色库一致) -->
      <div v-if="initialCharacters.length > 0" class="cw-search-toolbar">
        <div class="cw-search-input-wrap">
          <SvgIcon name="search" :size="15" class="cw-search-icon" />
          <input
            v-model="characterQuery"
            type="search"
            class="cw-input cw-catalog-search-input"
            placeholder="搜索已入选角色的姓名、职业身份、种族..."
            aria-label="搜索已入选角色"
          />
          <button
            v-if="characterQuery"
            type="button"
            class="cw-btn-clear"
            title="清空搜索"
            @click="characterQuery = ''"
          >
            <SvgIcon name="close" :size="12" />
          </button>
        </div>

        <div class="cw-tier-chips">
          <button
            type="button"
            class="cw-chip"
            :class="{ active: tierFilter === 'all' }"
            @click="tierFilter = 'all'"
          >
            全部 ({{ initialCharacters.length }})
          </button>
          <button
            type="button"
            class="cw-chip"
            :class="{ active: tierFilter === '主要' }"
            @click="tierFilter = '主要'"
          >
            主要角色 ({{ initialCharacters.filter(c => (c.层级 || '主要') === '主要').length }})
          </button>
          <button
            type="button"
            class="cw-chip"
            :class="{ active: tierFilter === '次要' }"
            @click="tierFilter = '次要'"
          >
            次要角色 ({{ initialCharacters.filter(c => c.层级 === '次要').length }})
          </button>
          <button
            type="button"
            class="cw-chip cw-chip-bonded"
            :class="{ active: tierFilter === 'bonded' }"
            @click="tierFilter = 'bonded'"
          >
            ⭐ 开局结识 ({{ bondedCount }})
          </button>
        </div>
      </div>

      <!-- 操作栏与计数 (与远程预置角色库一致) -->
      <div v-if="initialCharacters.length > 0" class="cw-catalog-actions-bar">
        <div class="cw-action-btns">
          <button
            type="button"
            class="cw-btn cw-btn-ghost cw-btn-xs"
            @click="clearAllCharacters"
          >
            清空待提交名录
          </button>
        </div>
        <span class="cw-catalog-count-badge">
          显示 {{ filteredCharacters.length }} / {{ initialCharacters.length }} 位角色 · 其中开局结识 {{ bondedCount }} 位
        </span>
      </div>

      <!-- 角色名录卡片列表 (与远程预置角色库格式完全一致) -->
      <div v-if="initialCharacters.length > 0" ref="characterList" class="cw-catalog-list cw-initial-chars-list">
        <div
          v-for="c in pagedCharacters"
          :key="c.id"
          class="cw-catalog-entry-card cw-initial-entry-card"
          :class="{
            'is-bonded': hasBond(c.id),
            'is-expanded': expandedId === c.id
          }"
        >
          <!-- 卡片主要展示行 -->
          <div class="cw-entry-main-row">
            <CharacterAvatar
              :name="c.基础信息?.姓名 || c.姓名"
              :size="36"
              shape="rounded"
              class="cw-entry-avatar"
            />
            <div class="cw-entry-info">
              <div class="cw-entry-top">
                <span class="cw-entry-name">{{ c.基础信息?.姓名 || c.姓名 || '未命名角色' }}</span>
                <span
                  class="cw-badge cw-badge-xs"
                  :class="(c.层级 || '主要') === '主要' ? 'cw-badge-accent' : 'cw-badge-muted'"
                >
                  {{ c.层级 || '主要' }}
                </span>
                <span
                  class="cw-badge cw-badge-xs"
                  :class="hasBond(c.id) ? 'cw-badge-bond' : 'cw-badge-subtle'"
                >
                  {{ hasBond(c.id) ? '⭐ 开局已结识' : '入库待机' }}
                </span>
              </div>
              <div class="cw-entry-desc">
                {{ c.身份 || c.基础信息?.身份 || '瓦罗兰居民' }}
                <span v-if="c.年龄"> · {{ c.年龄 }}岁</span>
                <span v-if="getRelation(c.id).basis" class="cw-entry-basis-tag">
                  · 依据：{{ getRelation(c.id).basis }}
                </span>
              </div>
            </div>

            <!-- 右侧操作区：关系配置按钮与移除按钮 -->
            <div class="cw-entry-actions">
              <button
                type="button"
                class="cw-btn cw-btn-xs"
                :class="hasBond(c.id) ? 'cw-btn-primary' : 'cw-btn-secondary'"
                @click="toggleExpand(c.id)"
              >
                <SvgIcon :name="hasBond(c.id) ? 'heart' : 'edit'" :size="12" />
                <span>{{ expandedId === c.id ? '收起配置' : hasBond(c.id) ? '开局羁绊设定' : '设定开局关系' }}</span>
              </button>
              <button
                type="button"
                class="cw-btn cw-btn-ghost cw-btn-xs cw-btn-del"
                title="从待提交名录中移出"
                @click="removeCharacterById(c.id)"
              >
                <SvgIcon name="close" :size="13" />
              </button>
            </div>
          </div>

          <!-- 展开的开局人际关系编辑栏 -->
          <div v-if="expandedId === c.id" class="cw-entry-expand-box">
            <div class="cw-rel-row">
              <div class="cw-rel-field">
                <label class="cw-rel-label">相识依据 (填写后开局即刻结识)：</label>
                <input
                  :value="getRelation(c.id).basis"
                  placeholder="例如：大学同窗、租房邻居、委托客户"
                  class="cw-input cw-input-sm"
                  @input="updateRelField(c.id, 'basis', ($event.target as HTMLInputElement).value)"
                />
              </div>
              <div class="cw-rel-field">
                <label class="cw-rel-label">关系性质：</label>
                <input
                  :value="getRelation(c.id).relation"
                  placeholder="例如：好友、熟人、工作伙伴"
                  class="cw-input cw-input-sm"
                  @input="updateRelField(c.id, 'relation', ($event.target as HTMLInputElement).value)"
                />
              </div>
            </div>
            <div class="cw-rel-bottom-row">
              <label class="cw-checkbox-row">
                <input
                  type="checkbox"
                  :checked="getRelation(c.id).contact"
                  @change="updateRelField(c.id, 'contact', ($event.target as HTMLInputElement).checked)"
                />
                <span class="cw-checkbox-text">已交换邻信（在开局手机通讯录中直接拥有该人物联系方式）</span>
              </label>
              <button type="button" class="cw-btn cw-btn-ghost cw-btn-xs" @click="expandedId = null">
                完成设置
              </button>
            </div>
          </div>
        </div>

        <div v-if="filteredCharacters.length === 0" class="cw-empty-filtered">
          未检索到符合条件的待提交角色
        </div>
      </div>

      <nav v-if="filteredCharacters.length > pageSize" class="cw-character-pages" aria-label="初始角色分页">
        <button type="button" class="cw-btn cw-btn-sm" :disabled="characterPage === 0" @click="characterPage--">上一页</button>
        <span>第 {{ characterPage + 1 }} / {{ pageCount }} 页 · 每页 {{ pageSize }} 位</span>
        <button type="button" class="cw-btn cw-btn-sm" :disabled="characterPage + 1 >= pageCount" @click="characterPage++">下一页</button>
      </nav>

      <!-- 空列表状态 -->
      <div v-if="initialCharacters.length === 0" class="cw-empty-chars-box">
        <SvgIcon name="users" :size="32" class="cw-empty-icon" />
        <div class="cw-empty-text-group">
          <strong>暂未添加待提交角色</strong>
          <span>您可以通过下方「预置角色库」批量加入角色，或选择手动录入 / 本地导入。也支持完全空白开局，在日常剧情中自主结识新市民。</span>
        </div>
      </div>
    </section>

    <CharacterCatalogImport v-if="activeSubTab === 'catalog'" :existing="initialCharacters" :import-characters="addImportedBatch" />

    <!-- 子面板 1：手动新增角色表单 -->
    <div v-if="activeSubTab === 'manual'" class="cw-sub-panel cw-manual-panel">
      <h4 class="cw-panel-title">
        <SvgIcon name="edit" :size="15" />
        <span>手动录入新角色</span>
      </h4>

      <!-- 解决 F31：替换原生 alert/prompt 的行内错误反馈 -->
      <div v-if="manualError" class="cw-alert-banner cw-alert-danger">
        <SvgIcon name="alertTriangle" :size="14" />
        <span>{{ manualError }}</span>
      </div>

      <div class="cw-form-grid">
        <div class="cw-form-item">
          <label class="cw-label"><span class="cw-required">*</span> 角色姓名：</label>
          <input v-model="manualForm.姓名" placeholder="例如：顾晴川" class="cw-input" />
        </div>
        <div class="cw-form-item">
          <label class="cw-label">日常称呼：</label>
          <input v-model="manualForm.称呼" placeholder="例如：晴川" class="cw-input" />
        </div>
        <div class="cw-form-item">
          <label class="cw-label">性别：</label>
          <select v-model="manualGenderType" class="cw-select" aria-label="选择性别">
            <option value="">未知 / 不适用</option>
            <option value="女">女</option>
            <option value="男">男</option>
            <option value="其他">其他</option>
          </select>
          <input
            v-if="manualGenderType === '其他'"
            v-model="manualCustomGender"
            placeholder="填写自定义性别设定"
            class="cw-input cw-input-sm"
            style="margin-top: 4px;"
            maxlength="20"
          />
        </div>
        <div class="cw-form-item">
          <label class="cw-label">年龄 (岁)：</label>
          <input v-model.number="manualForm.年龄" type="number" placeholder="留空表示未知" class="cw-input" />
        </div>
        <div class="cw-form-item">
          <label class="cw-label">身份：</label>
          <input v-model="manualForm.身份" placeholder="例如：艺术画廊策展人" class="cw-input" />
        </div>
        <div class="cw-form-item">
          <label class="cw-label">角色层级：</label>
          <select v-model="manualForm.层级" class="cw-select">
            <option value="主要">主要角色 (具有深度互动与六大 Tab 档案)</option>
            <option value="次要">次要角色 (偶遇浅层人物，单页呈现)</option>
          </select>
        </div>
        <div class="cw-form-item cw-item-full">
          <label class="cw-label">角色简要印象：</label>
          <input v-model="manualForm.简介" placeholder="简要外貌气质或社交印象..." class="cw-input" />
        </div>
      </div>
      <div class="cw-panel-actions">
        <button class="cw-btn cw-btn-primary cw-btn-sm" @click="handleConfirmManualAdd">
          <SvgIcon name="check" :size="14" />
          <span>确认加入待提交列表</span>
        </button>
      </div>
    </div>

    <CharacterBatchImport
      v-show="activeSubTab === 'import'"
      :existing="Object.fromEntries(initialCharacters.map(c => [c.id, c]))"
      :import-characters="addImportedBatch"
      staged
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import { initialConnectionIds } from '../../../../运行/creation';
import SvgIcon from '../icons/SvgIcon.vue';
import CharacterAvatar from '../shared/CharacterAvatar.vue';
import { parseAndValidateCharacterJson } from '../../utils/char_importer';
import CharacterBatchImport from '../shared/CharacterBatchImport.vue';
import CharacterCatalogImport from './CharacterCatalogImport.vue';

const props = withDefaults(
  defineProps<{
    initialCharacters: any[];
    relations?: Record<string, any>;
  }>(),
  {
    relations: () => ({}),
  },
);

const emit = defineEmits<{
  (e: 'addCharacter', char: any): void;
  (e: 'addCharacters', chars: any[]): void;
  (e: 'removeCharacter', index: number): void;
  (e: 'update:relations', rels: Record<string, any>): void;
}>();

const activeSubTab = ref<'catalog' | 'manual' | 'import'>('catalog');
const manualError = ref('');
const characterQuery = ref('');
const pageSize = 20;
const characterPage = ref(0);
const characterList = ref<HTMLElement | null>(null);
const tierFilter = ref('all');
const selectedCharacterId = ref<string | null>(null);
const expandedId = ref<string | null>(null);
const mobileViewMode = ref<'list' | 'detail'>('list');

const filteredCharacters = computed(() => {
  const query = characterQuery.value.trim().toLocaleLowerCase();
  return props.initialCharacters.filter(c => {
    if (tierFilter.value === '主要' && (c.层级 || '主要') !== '主要') return false;
    if (tierFilter.value === '次要' && c.层级 !== '次要') return false;
    if (tierFilter.value === 'bonded' && !hasBond(c.id)) return false;
    if (query) {
      const match = [c.基础信息?.姓名, c.姓名, c.身份, c.基础信息?.身份, c.种族].some(
        value => typeof value === 'string' && value.toLocaleLowerCase().includes(query)
      );
      if (!match) return false;
    }
    return true;
  });
});
const activeCharacter = computed(() => filteredCharacters.value.find(c => c.id === selectedCharacterId.value) ?? filteredCharacters.value[0]);
const pageCount = computed(() => Math.max(1, Math.ceil(filteredCharacters.value.length / pageSize)));
const pagedCharacters = computed(() => filteredCharacters.value.slice(characterPage.value * pageSize, (characterPage.value + 1) * pageSize));
watch([characterQuery, tierFilter], () => { characterPage.value = 0; });
watch(pageCount, count => { characterPage.value = Math.min(characterPage.value, count - 1); });
watch([characterPage, characterQuery, tierFilter], async () => {
  await nextTick();
  if (characterList.value) characterList.value.scrollTop = 0;
});

function handleSelectChar(id: string) {
  selectedCharacterId.value = id;
  mobileViewMode.value = 'detail';
}

function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id;
}

function removeCharacterById(id: string) {
  const idx = props.initialCharacters.findIndex(c => c.id === id);
  if (idx !== -1) emit('removeCharacter', idx);
}

function clearAllCharacters() {
  for (let i = props.initialCharacters.length - 1; i >= 0; i--) {
    emit('removeCharacter', i);
  }
}

const bondedIds = computed(() => new Set(initialConnectionIds({ characters: props.initialCharacters, details: { 初始关系: props.relations } })));
function hasBond(id: string): boolean { return bondedIds.value.has(id); }

const bondedCount = computed(() => {
  return props.initialCharacters.filter(c => hasBond(c.id)).length;
});

// 渲染只读取关系；用户编辑或导入时才初始化，避免渲染触发整份草稿写入。
function getRelation(id: string, importedCharacter?: any) {
  if (!id) return { basis: '', relation: '', contact: false };
  if (!props.relations[id]) {
    const character = importedCharacter ?? props.initialCharacters.find(character => character.id === id);
    const template = character?.__package ? undefined : character?.关系网?.player;
    return {
      basis: template?.关系备注 ?? '',
      relation: template?.关系 ?? '',
      contact: false,
      basisEdited: false,
      relationEdited: false,
    };
  }
  return props.relations[id];
}

function updateRelField(id: string, field: 'basis' | 'relation' | 'contact', value: any) {
  if (!id) return;
  const current = { ...getRelation(id), [field]: value };
  if (field === 'basis' || field === 'relation') current[field + 'Edited'] = true;
  emit('update:relations', { ...props.relations, [id]: current });
}

// 手动录入表单
const manualGenderType = ref('');
const manualCustomGender = ref('');

const manualForm = ref({
  姓名: '',
  称呼: '',
  性别: '',
  年龄: null as number | null,
  身份: '',
  层级: '主要' as '主要' | '次要',
  简介: '',
});

function handleConfirmManualAdd() {
  manualError.value = '';
  if (!manualForm.value.姓名.trim()) {
    manualError.value = '请至少填写角色姓名！';
    return;
  }
  const name = manualForm.value.姓名.trim();
  const gender = manualGenderType.value === '其他'
    ? manualCustomGender.value.trim() || '其他'
    : manualGenderType.value || null;

  const result = parseAndValidateCharacterJson({
    姓名: name,
    性别: gender,
    年龄: manualForm.value.年龄 === '' ? null : manualForm.value.年龄,
    身份: manualForm.value.身份.trim() || null,
    层级: manualForm.value.层级,
    简介: manualForm.value.简介.trim() || null,
  });

  if (!result.success) {
    manualError.value = result.error || '录入失败，请检查数据格式。';
    return;
  }

  emit('addCharacter', { id: result.charId, ...result.mappedCharacter });

  // 清空表单
  manualGenderType.value = '';
  manualCustomGender.value = '';
  manualForm.value = {
    姓名: '',
    称呼: '',
    性别: '',
    年龄: null,
    身份: '',
    层级: '主要',
    简介: '',
  };
}

async function addImportedBatch(values: any[]) {
  emit('addCharacters', values);
  // 一次替换名单，关系槽按查看人物初始化，避免 171 次重写完整浏览器草稿。
  if (values[0]?.id) {
    selectedCharacterId.value = values[0].id;
    emit('update:relations', { ...props.relations, [values[0].id]: getRelation(values[0].id, values[0]) });
  }
}

function removeCharacter(idx: number) {
  emit('removeCharacter', idx);
}
</script>

<style scoped lang="scss">
.cw-step-pane {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.cw-character-pages {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 12px;
  color: var(--cw-text-secondary);
}

@media (max-width: 640px) {
  .cw-step-header {
    flex-direction: column;
    .cw-header-left { width: 100%; min-width: 0; }
    .cw-header-actions { width: 100%; flex-wrap: wrap; }
  }
}

.cw-step-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  border-bottom: 1px solid var(--cw-border);
  padding-bottom: 12px;
  gap: 16px;

  .cw-header-left {
    flex: 1;

    .cw-step-title {
      margin: 0 0 4px;
      font-size: 17px;
      font-weight: 700;
      color: var(--cw-text-primary);
    }

    .cw-step-subtitle {
      margin: 0;
      font-size: 13px;
      color: var(--cw-text-secondary);
      line-height: 1.5;
    }
  }

  .cw-header-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }
}

/* 待提交初始角色名录：通栏舒展卡片格式 (与远程预置角色库格式统一) */
.cw-catalog-panel.cw-initial-panel {
  padding: 16px 20px;
  border-radius: var(--cw-radius, 12px);
  background: var(--cw-bg-card);
  border: 1px solid var(--cw-border);
  box-shadow: var(--cw-shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 14px;

  .cw-catalog-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;

    .cw-catalog-title-col {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .cw-catalog-title {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
      color: var(--cw-text-primary);
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;

      .cw-badge {
        font-size: 11px;
        font-weight: 600;
      }
    }

    .cw-text-muted {
      margin: 0;
      font-size: 12px;
      color: var(--cw-text-muted);
      line-height: 1.5;

      strong {
        color: var(--cw-text-secondary);
      }
    }
  }

  .cw-search-toolbar {
    display: flex;
    flex-direction: column;
    gap: 10px;

    .cw-search-input-wrap {
      position: relative;
      display: flex;
      align-items: center;
      width: 100%;

      .cw-search-icon {
        position: absolute;
        left: 12px;
        color: var(--cw-text-muted);
        pointer-events: none;
      }

      .cw-catalog-search-input {
        width: 100%;
        padding-left: 36px;
        padding-right: 32px;
        height: 36px;
        font-size: 13px;
        border-radius: var(--cw-radius-sm);
        background: var(--cw-bg-input, var(--cw-bg-surface));
      }

      .cw-btn-clear {
        position: absolute;
        right: 10px;
        background: transparent;
        border: none;
        color: var(--cw-text-muted);
        cursor: pointer;
        padding: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;

        &:hover {
          color: var(--cw-text-primary);
          background: var(--cw-bg-card-subtle);
        }
      }
    }

    .cw-tier-chips {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;

      .cw-chip {
        padding: 5px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 500;
        background: var(--cw-bg-surface);
        border: 1px solid var(--cw-border);
        color: var(--cw-text-secondary);
        cursor: pointer;
        transition: all 0.15s ease;
        display: inline-flex;
        align-items: center;
        gap: 4px;

        &:hover {
          border-color: var(--cw-accent);
          color: var(--cw-text-primary);
        }

        &.active {
          background: var(--cw-accent);
          border-color: var(--cw-accent);
          color: #fff;
          font-weight: 600;
          box-shadow: 0 2px 6px rgba(56, 189, 248, 0.25);
        }

        &.cw-chip-bonded.active {
          background: #ef4444;
          border-color: #ef4444;
          box-shadow: 0 2px 6px rgba(239, 68, 68, 0.25);
        }
      }
    }
  }

  .cw-catalog-actions-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px 12px;
    padding: 6px 10px;
    background: var(--cw-bg-surface);
    border: 1px solid var(--cw-border-subtle, var(--cw-border));
    border-radius: var(--cw-radius-sm);
    font-size: 12px;

    .cw-action-btns {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px 8px;
    }

    .cw-catalog-count-badge {
      color: var(--cw-text-muted);
      font-size: 11px;
    }
  }

  .cw-initial-chars-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 480px;
    overflow-y: auto;
    padding-right: 4px;

    &::-webkit-scrollbar {
      width: 6px;
    }
    &::-webkit-scrollbar-thumb {
      background: var(--cw-border);
      border-radius: 3px;
    }
  }

  .cw-initial-entry-card {
    display: flex;
    flex-direction: column;
    padding: 10px 14px;
    background: var(--cw-bg-surface);
    border: 1px solid var(--cw-border);
    border-radius: var(--cw-radius-sm, 8px);
    transition: all 0.15s ease;
    gap: 10px;

    &:hover {
      border-color: var(--cw-accent);
      background: var(--cw-bg-card-subtle);
    }

    &.is-bonded {
      border-left: 3px solid #ef4444;
      background: rgba(239, 68, 68, 0.03);
    }

    &.is-expanded {
      border-color: var(--cw-accent);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    }

    .cw-entry-main-row {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .cw-entry-avatar {
      flex-shrink: 0;
    }

    .cw-entry-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;

      .cw-entry-top {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;

        .cw-entry-name {
          font-size: 13px;
          font-weight: 600;
          color: var(--cw-text-primary);
        }

        .cw-badge-bond {
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #ef4444;
          font-weight: 600;
        }

        .cw-badge-subtle {
          background: var(--cw-bg-card);
          border: 1px solid var(--cw-border);
          color: var(--cw-text-muted);
        }
      }

      .cw-entry-desc {
        font-size: 11px;
        color: var(--cw-text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;

        .cw-entry-basis-tag {
          color: var(--cw-accent);
          font-weight: 500;
        }
      }
    }

    .cw-entry-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;

      .cw-btn-del {
        color: var(--cw-text-muted);
        padding: 4px 6px;

        &:hover {
          color: var(--cw-danger, #ef4444);
          background: rgba(239, 68, 68, 0.1);
        }
      }
    }

    .cw-entry-expand-box {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px;
      background: var(--cw-bg-card);
      border: 1px dashed var(--cw-border);
      border-radius: var(--cw-radius-sm);
      animation: cwFadeIn 0.15s ease-out;

      .cw-rel-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;

        @media (max-width: 640px) {
          grid-template-columns: 1fr;
        }

        .cw-rel-field {
          display: flex;
          flex-direction: column;
          gap: 4px;

          .cw-rel-label {
            font-size: 11px;
            font-weight: 500;
            color: var(--cw-text-secondary);
          }
        }
      }

      .cw-rel-bottom-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        padding-top: 4px;
        border-top: 1px solid var(--cw-border-subtle, var(--cw-border));

        .cw-checkbox-row {
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          user-select: none;

          .cw-checkbox-text {
            font-size: 11px;
            color: var(--cw-text-secondary);
          }
        }
      }
    }
  }

  .cw-empty-filtered {
    text-align: center;
    padding: 32px 16px;
    color: var(--cw-text-muted);
    font-size: 12px;
  }
}

.cw-empty-chars-box {
  padding: 32px 20px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: var(--cw-text-muted);
  font-size: 13px;
  background: var(--cw-bg-card);
  border: 1px dashed var(--cw-border);
  border-radius: var(--cw-radius, 12px);

  .cw-empty-icon {
    opacity: 0.6;
    color: var(--cw-text-muted);
  }

  p {
    margin: 0;
  }
}

.cw-sub-panel {
  padding: 16px;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card);
  border: 1px solid var(--cw-border);
  display: flex;
  flex-direction: column;
  gap: 12px;

  .cw-panel-title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--cw-text-primary);
    display: flex;
    align-items: center;
    gap: 8px;
  }
}

.cw-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }

  .cw-form-item {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;

    &.cw-item-full {
      grid-column: 1 / -1;
    }
  }
}

.cw-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--cw-text-primary);
}

.cw-input,
.cw-select {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 10px;
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius-sm);
  background: var(--cw-bg-input, var(--cw-bg-surface));
  color: var(--cw-text-primary);
  font-size: 12px;

  &.cw-input-sm {
    padding: 5px 8px;
    font-size: 11px;
  }

  &:focus {
    border-color: var(--cw-accent);
    outline: none;
  }
}

.cw-panel-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}

.cw-alert-banner {
  padding: 8px 12px;
  border-radius: var(--cw-radius-sm);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;

  &.cw-alert-danger {
    background: rgba(192, 57, 43, 0.1);
    border: 1px solid rgba(192, 57, 43, 0.3);
    color: var(--cw-danger);
  }
}

[data-theme='dark'] {
  .cw-catalog-panel.cw-initial-panel {
    background: rgba(255, 255, 255, 0.02);
  }
  .cw-initial-entry-card {
    background: rgba(255, 255, 255, 0.03);
    &.is-bonded {
      background: rgba(239, 68, 68, 0.06);
    }
  }
}
</style>
