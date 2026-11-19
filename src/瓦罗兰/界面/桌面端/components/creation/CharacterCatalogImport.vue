<template>
  <section class="cw-catalog-panel">
    <div class="cw-catalog-header">
      <div class="cw-catalog-title-col">
        <h4 class="cw-catalog-title">
          <SvgIcon name="users" :size="16" />
          <span>远程预置角色库</span>
        </h4>
        <p class="cw-text-muted">
          从云端或本地名录检索人物并加入建档。您可按需选择部分结识人物，也可一键导入全量人物库。
        </p>
      </div>

      <!-- 高级源地址折叠 -->
      <details class="cw-advanced-source">
        <summary class="cw-advanced-summary">
          <SvgIcon name="settings" :size="13" />
          <span>配置角色库地址</span>
        </summary>
        <div class="cw-catalog-source-row">
          <input
            v-model="sourceUrl"
            class="cw-input cw-input-sm"
            aria-label="角色库链接"
            placeholder="预置角色库 JSON 链接"
            :disabled="busy"
          />
          <button
            type="button"
            class="cw-btn cw-btn-secondary cw-btn-sm"
            :disabled="busy || !sourceUrl.trim()"
            @click="load"
          >
            {{ busy ? '加载中...' : '重新读取' }}
          </button>
        </div>
      </details>
    </div>

    <div v-if="error" class="cw-catalog-error-banner" role="alert">
      <SvgIcon name="alertTriangle" :size="14" />
      <span>{{ error }}。可检查网络或使用本地 JSON 文件导入。</span>
    </div>

    <div v-if="notice" class="cw-catalog-notice-banner" role="status">
      <SvgIcon name="check" :size="14" />
      <span>{{ notice }}</span>
    </div>

    <template v-if="catalog">
      <!-- 搜索栏与分层过滤 -->
      <div class="cw-search-toolbar">
        <div class="cw-search-input-wrap">
          <SvgIcon name="search" :size="15" class="cw-search-icon" />
          <input
            v-model="query"
            type="search"
            class="cw-input cw-catalog-search-input"
            placeholder="搜索姓名、职业身份、种族或地区..."
            aria-label="搜索预置角色"
          />
          <button
            v-if="query"
            type="button"
            class="cw-btn-clear"
            title="清空搜索"
            @click="query = ''"
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
            全部
          </button>
          <button
            type="button"
            class="cw-chip"
            :class="{ active: tierFilter === '主要' }"
            @click="tierFilter = '主要'"
          >
            主要角色
          </button>
          <button
            type="button"
            class="cw-chip"
            :class="{ active: tierFilter === '次要' }"
            @click="tierFilter = '次要'"
          >
            次要角色
          </button>
        </div>
      </div>

      <!-- 操作栏与计数 -->
      <div class="cw-catalog-actions-bar">
        <div class="cw-action-btns">
          <button
            type="button"
            class="cw-btn cw-btn-secondary cw-btn-xs"
            :disabled="busy || !filtered.length"
            @click="selectFiltered"
          >
            选中当前筛选出的 ({{ filtered.length }}) 人
          </button>
          <button
            type="button"
            class="cw-btn cw-btn-ghost cw-btn-xs"
            :disabled="busy || !selectedIds.length"
            @click="selectedIds = []"
          >
            清空已选
          </button>
        </div>
        <span class="cw-catalog-count-badge">
          库中 {{ catalog.entries.length }} 人 · 已选 {{ selectedIds.length }} 人
        </span>
      </div>

      <!-- 角色名录卡片列表 -->
      <div class="cw-catalog-list">
        <label
          v-for="entry in filtered"
          :key="entry.id"
          class="cw-catalog-entry-card"
          :class="{
            'is-selected': selectedIds.includes(entry.id),
            'is-existing': existingIds.has(entry.id),
          }"
        >
          <input
            v-model="selectedIds"
            type="checkbox"
            :value="entry.id"
            :disabled="busy || existingIds.has(entry.id)"
            class="cw-entry-checkbox"
          />
          <div class="cw-entry-info">
            <div class="cw-entry-top">
              <span class="cw-entry-name">{{ entry.name }}</span>
              <span
                class="cw-badge cw-badge-xs"
                :class="entry.tier === '主要' ? 'cw-badge-accent' : 'cw-badge-muted'"
              >
                {{ entry.tier || '角色' }}
              </span>
            </div>
            <div class="cw-entry-desc">
              {{ entry.identity || entry.race || '瓦罗兰居民' }}
            </div>
          </div>
          <span v-if="existingIds.has(entry.id)" class="cw-existing-tag">
            <SvgIcon name="check" :size="12" /> 已在建档列表
          </span>
        </label>
        <div v-if="filtered.length === 0" class="cw-empty-filtered">
          未检索到符合条件的角色
        </div>
      </div>

      <!-- 底部加入操作 -->
      <div class="cw-catalog-footer">
        <button
          type="button"
          class="cw-btn cw-btn-primary cw-btn-block"
          :disabled="busy || !selectedIds.length"
          @click="addSelected"
        >
          <SvgIcon v-if="busy" name="refreshCw" :size="14" class="cw-spin" />
          <SvgIcon v-else name="plus" :size="14" />
          <span>{{ busy ? '正在解析角色完整资料...' : `将已选的 ${selectedIds.length} 位角色加入建档向导` }}</span>
        </button>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import SvgIcon from '../icons/SvgIcon.vue';
import {
  catalogCharacters,
  loadCharacterCatalog,
  defaultCharacterCatalogUrl,
  type CharacterCatalog,
} from '../../utils/character-catalog';

const props = defineProps<{
  existing: any[];
  importCharacters: (values: any[]) => Promise<void>;
}>();

const sourceUrl = ref(defaultCharacterCatalogUrl);
const catalog = ref<CharacterCatalog | null>(null);
const selectedIds = ref<string[]>([]);
const query = ref('');
const tierFilter = ref<'all' | '主要' | '次要'>('all');
const busy = ref(false);
const error = ref('');
const notice = ref('');

const existingIds = computed(() => new Set(props.existing.map(character => character.id)));

const filtered = computed(() => {
  const q = query.value.trim().toLocaleLowerCase();
  return (catalog.value?.entries ?? []).filter(entry => {
    if (tierFilter.value !== 'all' && entry.tier !== tierFilter.value) {
      return false;
    }
    if (!q) return true;
    return [entry.name, entry.identity, entry.race].some(text =>
      text?.toLocaleLowerCase().includes(q),
    );
  });
});

function selectFiltered() {
  const addable = filtered.value
    .filter(entry => !existingIds.value.has(entry.id))
    .map(entry => entry.id);
  selectedIds.value = [...new Set([...selectedIds.value, ...addable])];
}

async function load() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    catalog.value = await loadCharacterCatalog(sourceUrl.value);
    selectedIds.value = [];
    notice.value = '已就绪角色名录，挑选后点击“加入建档”即可读取完整配置。';
  } catch (e) {
    catalog.value = null;
    error.value = String(e);
  } finally {
    busy.value = false;
  }
}

async function addSelected() {
  if (busy.value || !catalog.value) return;
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    const ids = selectedIds.value.filter(id => !existingIds.value.has(id));
    const characters = await catalogCharacters(catalog.value, ids, [...existingIds.value]);
    await props.importCharacters(characters);
    selectedIds.value = [];
    notice.value = `成功添加 ${characters.length} 位人物至待建档列表。`;
  } catch (e) {
    error.value = String(e);
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<style scoped lang="scss">
.cw-catalog-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card);
}

.cw-catalog-header {
  display: flex;
  flex-direction: column;
  gap: 8px;

  .cw-catalog-title {
    margin: 0 0 4px;
    font-size: 14px;
    font-weight: 600;
    color: var(--cw-text-primary);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  p {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
  }
}

.cw-advanced-source {
  margin-top: 4px;

  .cw-advanced-summary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--cw-text-muted);
    cursor: pointer;
    user-select: none;
    padding: 2px 0;

    &:hover {
      color: var(--cw-accent);
    }
  }

  .cw-catalog-source-row {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 6px;
    padding: 8px;
    background: var(--cw-bg-surface);
    border-radius: var(--cw-radius-sm);
    border: 1px solid var(--cw-border-subtle, var(--cw-border));

    .cw-input-sm {
      flex: 1;
      padding: 6px 8px;
      font-size: 12px;
    }
  }
}

.cw-catalog-error-banner,
.cw-catalog-notice-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  padding: 8px 12px;
  border-radius: var(--cw-radius-sm);
}

.cw-catalog-error-banner {
  background: rgba(192, 57, 43, 0.1);
  color: var(--cw-danger);
  border: 1px solid rgba(192, 57, 43, 0.3);
}

.cw-catalog-notice-banner {
  background: var(--cw-accent-bg);
  color: var(--cw-accent);
  border: 1px solid var(--cw-accent-border);
}

.cw-search-toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;

  .cw-search-input-wrap {
    position: relative;
    display: flex;
    align-items: center;

    .cw-search-icon {
      position: absolute;
      left: 10px;
      color: var(--cw-text-muted);
      pointer-events: none;
    }

    .cw-catalog-search-input {
      padding-left: 32px;
      padding-right: 28px;
      height: 36px;
      border: 1px solid var(--cw-border-strong, var(--cw-border));
      background: var(--cw-bg-surface);

      &:focus {
        border-color: var(--cw-accent);
      }
    }

    .cw-btn-clear {
      position: absolute;
      right: 8px;
      background: none;
      border: none;
      color: var(--cw-text-muted);
      cursor: pointer;
      padding: 4px;
      display: flex;

      &:hover {
        color: var(--cw-text-primary);
      }
    }
  }

  .cw-tier-chips {
    display: flex;
    gap: 6px;

    .cw-chip {
      background: var(--cw-bg-surface);
      border: 1px solid var(--cw-border);
      border-radius: var(--cw-radius-full);
      color: var(--cw-text-secondary);
      font-size: 11px;
      padding: 3px 10px;
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover {
        border-color: var(--cw-accent);
        color: var(--cw-accent);
      }

      &.active {
        background: var(--cw-accent-bg);
        border-color: var(--cw-accent);
        color: var(--cw-accent);
        font-weight: 600;
      }
    }
  }
}

.cw-catalog-actions-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;

  .cw-action-btns {
    display: flex;
    gap: 6px;
  }

  .cw-catalog-count-badge {
    color: var(--cw-text-muted);
    font-size: 11px;
  }
}

.cw-catalog-list {
  max-height: 320px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-right: 4px;
}

.cw-catalog-entry-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--cw-bg-surface);
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius-sm);
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;

  &:hover {
    border-color: var(--cw-accent);
    background: var(--cw-bg-card-subtle);
  }

  &.is-selected {
    border-color: var(--cw-accent);
    background: var(--cw-accent-bg);
  }

  &.is-existing {
    opacity: 0.65;
    cursor: default;
    background: var(--cw-bg-card-subtle);
  }

  .cw-entry-checkbox {
    margin: 0;
    cursor: pointer;
  }

  .cw-entry-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;

    .cw-entry-top {
      display: flex;
      align-items: center;
      gap: 6px;

      .cw-entry-name {
        font-size: 13px;
        font-weight: 600;
        color: var(--cw-text-primary);
      }
    }

    .cw-entry-desc {
      font-size: 11px;
      color: var(--cw-text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  .cw-existing-tag {
    font-size: 11px;
    color: var(--cw-accent);
    display: flex;
    align-items: center;
    gap: 3px;
    flex-shrink: 0;
  }
}

.cw-empty-filtered {
  text-align: center;
  padding: 24px;
  color: var(--cw-text-muted);
  font-size: 12px;
}

.cw-catalog-footer {
  margin-top: 4px;

  .cw-btn-block {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px 16px;
  }
}
</style>
