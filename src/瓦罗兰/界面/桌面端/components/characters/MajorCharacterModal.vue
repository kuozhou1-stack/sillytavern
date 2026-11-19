<template>
  <div :class="embedded ? 'cw-library-panel' : 'cw-modal-backdrop'" @click.self="!embedded && emit('close')">
    <div
      class="cw-major-char-modal"
      :class="[embedded ? 'cw-library-content' : 'cw-modal-box cw-gameplay-panel', { 'cw-empty-result': !majorList.length }]"
    >
      <!-- 顶栏 -->
      <div v-if="!embedded" class="cw-modal-header">
        <div class="cw-header-title">
          <button
            v-if="showMobileDetail"
            class="cw-btn cw-btn-ghost cw-btn-xs cw-mobile-back-btn"
            title="返回角色名录"
            @click="showMobileDetail = false"
          >
            <SvgIcon name="arrowLeft" :size="14" />
            <span>名录</span>
          </button>
          <SvgIcon name="userCheck" :size="20" class="cw-header-icon" />
          <span>主要角色档案库</span>
          <span class="cw-badge cw-badge-accent">深度互动人物</span>
        </div>
        <div class="cw-header-actions">
          <button class="cw-btn cw-btn-ghost cw-btn-sm" @click="emit('openManagement')">
            <SvgIcon name="settings" :size="14" />
            <span>角色管理 (分类/导入/导出)</span>
          </button>
          <button class="cw-btn cw-btn-ghost cw-close-btn cw-gameplay-close" @click="emit('close')">
            <SvgIcon name="close" :size="18" />
          </button>
        </div>
      </div>

      <button
        v-if="embedded && showMobileDetail"
        class="cw-btn cw-btn-ghost cw-mobile-back-btn cw-embedded-back"
        @click="showMobileDetail = false"
      >
        <SvgIcon name="arrowLeft" :size="14" />返回名录
      </button>

      <!-- 双栏布局：左侧选人列表，右侧六大 Tab -->
      <div v-if="!majorList.length" class="cw-character-empty" role="status">
        <SvgIcon name="userCheck" :size="28" />
        <strong>暂无主要角色档案</strong>
        <p>结识主要人物或导入角色后，档案会显示在这里。</p>
        <button class="cw-btn cw-btn-primary cw-btn-sm" @click="emit('openManagement')">打开角色管理</button>
      </div>
      <div v-else class="cw-modal-main-layout">
        <!-- 统一分类、拖拽与启停侧边栏 -->
        <CharacterCategorySidebar
          :characters="characters"
          :selected-id="selectedId"
          tier="主要"
          class="cw-major-sidebar"
          :class="{ 'cw-mobile-hidden': showMobileDetail }"
          @select="handleSelectCharacter"
        />

        <!-- 右侧详细资料与六大 Tab -->
        <div class="cw-char-content-pane" :class="{ 'cw-mobile-hidden': !showMobileDetail }">
          <template v-if="currentCharacter">
            <!-- 角色顶部名片摘要 -->
            <div class="cw-char-hero-card">
              <div class="cw-hero-avatar-box">
                <CharacterAvatar
                  :name="currentCharacter.基础信息?.姓名 || currentCharacter.姓名"
                  :size="48"
                  shape="rounded"
                />
              </div>
              <div class="cw-hero-titles">
                <div class="cw-hero-name-row">
                  <h3 class="cw-hero-name">
                    {{ currentCharacter.基础信息?.姓名 || currentCharacter.姓名 || selectedId }}
                  </h3>
                  <span v-if="currentCharacter.基础信息?.称呼" class="cw-hero-nick"
                    >“{{ currentCharacter.基础信息.称呼 }}”</span
                  >
                  <span class="cw-badge cw-badge-accent">{{
                    currentCharacter.基础信息?.性别 || currentCharacter.性别 || '未知'
                  }}</span>
                  <span class="cw-badge">{{
                    currentCharacter.年龄 == null ? '年龄未知' : `${currentCharacter.年龄}岁`
                  }}</span>
                </div>
              </div>

              <!-- 右侧启停控制 -->
              <div class="cw-hero-actions">
                <div class="cw-hero-status-pill">
                  <span class="cw-hero-status-text" :class="{ 'is-disabled': isCurrentCharDisabled }">
                    {{ isCurrentCharDisabled ? '已停用 · 关闭时档案' : '已启用' }}
                  </span>
                  <CwToggleSwitch
                    silent-pending
                    :model-value="!isCurrentCharDisabled"
                    :loading="!!operationPending['char:' + selectedId]"
                    size="sm"
                    @change="handleToggleCurrentChar"
                  />
                </div>
              </div>
            </div>

            <!-- 六大/五大 Tab 导航栏 (男性彻底隐藏私密入口) -->
            <div class="cw-char-tab-bar">
              <button
                v-for="t in availableTabs"
                :key="t.key"
                :data-tab="t.key"
                class="cw-tab-nav-btn"
                :class="{ active: activeTab === t.key }"
                @click="activeTab = t.key"
              >
                <SvgIcon :name="t.icon" :size="14" />
                <span>{{ t.label }}</span>
              </button>
            </div>

            <!-- Tab 容器 -->
            <div ref="charContentView" class="cw-char-tab-view">
              <TabBasic
                v-if="activeTab === 'basic'"
                :char="currentCharacter"
                :expanded-fields="currentExpandedFields"
                @toggle-expand="toggleExpandedField"
              />
              <TabPersonality
                v-else-if="activeTab === 'personality'"
                :char="currentCharacter"
                :expanded-fields="currentExpandedFields"
                @toggle-expand="toggleExpandedField"
              />
              <TabStatus v-else-if="activeTab === 'status'" :char="currentCharacter" />
              <TabRelations
                v-else-if="activeTab === 'relations'"
                :char="currentCharacter"
                :all-characters="characters"
              />
              <TabLife v-else-if="activeTab === 'life'" :char="currentCharacter" />
              <TabNetwork v-else-if="activeTab === 'network'" :char="currentCharacter" />
              <TabPrivate v-else-if="activeTab === 'private' && !isMale" :char="currentCharacter" />
            </div>
          </template>

          <div v-else class="cw-no-select-tip">
            <SvgIcon name="user" :size="40" />
            <span>请在左侧选择一位主要角色查看档案。</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick } from 'vue';
import SvgIcon from '../icons/SvgIcon.vue';
import TabBasic from './major-tabs/TabBasic.vue';
import TabPersonality from './major-tabs/TabPersonality.vue';
import TabStatus from './major-tabs/TabStatus.vue';
import TabRelations from './major-tabs/TabRelations.vue';
import TabLife from './major-tabs/TabLife.vue';
import TabNetwork from './major-tabs/TabNetwork.vue';
import TabPrivate from './major-tabs/TabPrivate.vue';
import CharacterAvatar from '../shared/CharacterAvatar.vue';
import CharacterCategorySidebar from './CharacterCategorySidebar.vue';
import CwToggleSwitch from './CwToggleSwitch.vue';
import { useCharacterDisplayState } from './useCharacterDisplayState';

const props = defineProps<{
  characters: Record<string, any>;
  embedded?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'openManagement'): void;
}>();

const { charMetaMap, toggleCharacterEnabled, operationPending } = useCharacterDisplayState();

const allTabs = [
  { key: 'basic', label: '基础档案', icon: 'user' },
  { key: 'personality', label: '性格与习惯', icon: 'smile' },
  { key: 'status', label: '状态', icon: 'mapPin' },
  { key: 'relations', label: '关系', icon: 'users' },
  { key: 'life', label: '经历', icon: 'clock' },
  { key: 'network', label: '网络', icon: 'globe' },
  { key: 'private', label: '私密', icon: 'lock' },
];

const activeTab = ref('basic');
const showMobileDetail = ref(false);

// 阅读位置独立记忆管理
const charContentView = ref<HTMLElement | null>(null);
const scrollPositions = new Map<string, Map<string, number>>();
// 仅保存本次档案窗口的阅读状态，不写入角色数据或 MVU。
const expandedFields = reactive(new Map<string, Record<string, boolean>>());
let displayedLocation: { id: string; tab: string };
let restoreVersion = 0;

function setScrollPosition(id: string, tab: string, top: number) {
  let positions = scrollPositions.get(id);
  if (!positions) scrollPositions.set(id, (positions = new Map()));
  positions.set(tab, top);
}

function saveScroll() {
  if (charContentView.value && displayedLocation.id) {
    setScrollPosition(displayedLocation.id, displayedLocation.tab, charContentView.value.scrollTop);
  }
}

function restoreScroll(id: string, tab: string) {
  const version = ++restoreVersion;
  nextTick(() => {
    if (version !== restoreVersion || id !== selectedId.value || tab !== activeTab.value) return;
    if (charContentView.value) {
      charContentView.value.scrollTop = scrollPositions.get(id)?.get(tab) ?? 0;
    }
    displayedLocation = { id, tab };
  });
}

// 筛选所有主要角色（层级 === '主要'）
const majorList = computed(() => {
  if (!props.characters || typeof props.characters !== 'object') return [];
  return Object.entries(props.characters)
    .filter(([_, c]: [string, any]) => c.层级 === '主要' || !c.层级) // 默认或明确标注主要
    .map(([id, c]: [string, any]) => ({
      id,
      name: c.基础信息?.姓名 || c.姓名 || id,
      gender: c.基础信息?.性别 || c.性别,
      age: c.年龄,
      occupation: c.身份,
      raw: c,
    }));
});

const selectedId = ref<string>(majorList.value[0]?.id || '');
displayedLocation = { id: selectedId.value, tab: activeTab.value };
const currentExpandedFields = computed(() => expandedFields.get(selectedId.value) ?? {});

function toggleExpandedField(field: string) {
  if (!selectedId.value) return;
  let fields = expandedFields.get(selectedId.value);
  if (!fields) {
    expandedFields.set(selectedId.value, {});
    fields = expandedFields.get(selectedId.value)!;
  }
  fields[field] = !fields[field];
}

watch(majorList, list => {
  if (!list.some(c => c.id === selectedId.value)) {
    selectedId.value = list[0]?.id || '';
  }
});

function handleSelectCharacter(id: string) {
  if (selectedId.value !== id) {
    selectedId.value = id;
  }
  showMobileDetail.value = true;
}

watch([selectedId, activeTab], ([id, tab], [previousId, previousTab]) => {
  // 默认 pre 时机读取旧页面；新页面及其折叠状态渲染完成后再恢复。
  saveScroll();
  if (id === previousId && tab !== previousTab) setScrollPosition(id, tab, 0);
  restoreScroll(id, tab);
});

defineExpose({ selectCharacter: handleSelectCharacter });

const currentCharacter = computed(() => {
  if (!selectedId.value) return null;
  return props.characters?.[selectedId.value] || null;
});

const isCurrentCharDisabled = computed(() => {
  if (!selectedId.value) return false;
  const meta = charMetaMap.value[selectedId.value];
  if (meta) return !meta.enabled;
  const raw = currentCharacter.value;
  return raw?._管理?.停用 === true || raw?.已停用 === true;
});

async function handleToggleCurrentChar() {
  if (!selectedId.value) return;
  await toggleCharacterEnabled(selectedId.value);
}

// 性别精确判定：兼容扁平字段与基础信息结构
const isMale = computed(() => {
  if (!currentCharacter.value) return false;
  const g = currentCharacter.value.基础信息?.性别 || currentCharacter.value.性别;
  return g === '男' || g === '男性';
});

// 男性角色彻底隐藏私密 Tab
const availableTabs = computed(() => {
  if (isMale.value) {
    return allTabs.filter(t => t.key !== 'private');
  }
  return allTabs;
});

// 切换到男性角色时，如果当前停留在私密 Tab，自动安全重置为基础信息 Tab
watch([selectedId, isMale], () => {
  if (isMale.value && activeTab.value === 'private') {
    activeTab.value = 'basic';
  }
});
</script>

<style scoped lang="scss">
.cw-character-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 28px 20px;
  text-align: center;
  color: var(--cw-text-secondary);
}
.cw-character-empty p {
  margin: 0;
  font-size: 13px;
  color: var(--cw-text-muted);
}
.cw-major-char-modal.cw-empty-result {
  height: auto;
}
.cw-empty-result .cw-char-sidebar {
  width: 100%;
  border-right: none;
}
.cw-major-char-modal {
  width: 920px;
  height: 680px;
}

.cw-modal-header {
  padding: 14px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--cw-border);
  background: var(--cw-bg-card-subtle);

  .cw-header-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 16px;
    font-weight: 600;
  }
  .cw-header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }
}

.cw-modal-main-layout {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.cw-hero-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;

  .cw-hero-status-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: var(--cw-radius-full);
    background: var(--cw-bg-card-subtle);
    border: 1px solid var(--cw-border);

    .cw-hero-status-text {
      font-size: 12px;
      font-weight: 500;
      color: var(--cw-success, #3f8f6b);

      &.is-disabled {
        color: var(--cw-text-muted);
      }
    }
  }
}

.cw-mobile-back-btn {
  display: none;
}

@media (max-width: 380px) {
  .cw-modal-header {
    padding: 10px 12px;
    .cw-header-title span:not(.cw-badge) {
      font-size: 14px;
    }
    .cw-header-actions button span {
      display: none;
    }
  }
}

/* 右侧内容区 */
.cw-char-content-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--cw-bg-main);
}

.cw-char-hero-card {
  padding: 16px 20px;
  background: var(--cw-bg-surface);
  border-bottom: 1px solid var(--cw-border);
  display: flex;
  align-items: center;
  gap: 16px;

  .cw-hero-titles {
    display: flex;
    flex-direction: column;
    gap: 4px;

    .cw-hero-name-row {
      display: flex;
      align-items: center;
      gap: 8px;

      .cw-hero-name {
        margin: 0;
        font-size: 18px;
        font-weight: 700;
      }
      .cw-hero-nick {
        font-size: 14px;
        color: var(--cw-text-secondary);
      }
    }

    .cw-hero-meta {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
      margin-top: 2px;
      font-size: 12px;
      color: var(--cw-text-muted);

      .cw-meta-line {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
      }
    }
  }
}

.cw-char-tab-bar {
  display: flex;
  flex-wrap: wrap;
  flex-shrink: 0;
  gap: 4px;
  padding: 8px 16px;
  background: var(--cw-bg-card-subtle);
  border-bottom: 1px solid var(--cw-border);

  .cw-tab-nav-btn {
    display: inline-flex;
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
    flex-shrink: 0;

    &:hover {
      background: var(--cw-bg-card);
      color: var(--cw-text-primary);
    }

    &.active {
      background: var(--cw-bg-surface);
      color: var(--cw-accent);
      border-color: var(--cw-border);
      box-shadow: var(--cw-shadow-sm);
      font-weight: 600;
    }
  }
}

@media (max-width: 860px) and (min-width: 681px) {
  .cw-major-sidebar {
    width: 230px !important;
  }
  .cw-char-hero-card {
    padding: 12px 14px;
    gap: 12px;
  }
  .cw-char-tab-bar {
    padding: 6px 10px;
    gap: 2px;
  }
  .cw-char-tab-bar .cw-tab-nav-btn {
    padding: 5px 8px;
    font-size: 12px;
    gap: 4px;
  }
}

.cw-char-tab-view {
  flex: 1;
  overflow-y: auto;
  padding: 18px 22px;
}

.cw-no-select-tip {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--cw-text-muted);
  font-size: 14px;
}

.cw-badge-sm {
  font-size: 10px;
  padding: 1px 5px;
}

.cw-library-panel {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.cw-library-content.cw-major-char-modal {
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

@media (max-width: 680px) {
  .cw-major-char-modal {
    width: 100%;
    height: 100%;
    max-height: 100%;
    border-radius: 0;
  }

  .cw-mobile-back-btn {
    display: inline-flex;
  }

  .cw-mobile-hidden {
    display: none !important;
  }

  .cw-modal-main-layout {
    flex-direction: column;
  }

  .cw-char-hero-card {
    padding: 6px 10px;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;

    .cw-hero-avatar-box {
      display: none;
    }

    .cw-hero-titles {
      flex: 1 1 150px;
      min-width: 0;
      gap: 2px;

      .cw-hero-name-row {
        gap: 6px;
        flex-wrap: nowrap;
        overflow: hidden;

        .cw-hero-name {
          font-size: 14px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .cw-hero-nick {
          font-size: 11px;
          white-space: nowrap;
        }
      }
      .cw-badge {
        font-size: 10px;
        padding: 1px 5px;
      }
    }

    .cw-hero-actions {
      width: auto;
      flex-shrink: 0;
      justify-content: flex-end;
    }
  }

  .cw-char-tab-bar {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    padding: 4px;
    gap: 2px;
    .cw-tab-nav-btn {
      justify-content: center;
      min-width: 0;
      white-space: normal;
      padding: 5px 2px;
      font-size: 12px;
      line-height: 1.35;
    }
  }

  .cw-char-tab-view {
    padding: 10px 12px;
    flex: 1;
    min-height: 0;
  }
}
@media (max-width: 430px) {
  .cw-char-tab-bar .cw-tab-nav-btn > svg { display: none; }
}
</style>
