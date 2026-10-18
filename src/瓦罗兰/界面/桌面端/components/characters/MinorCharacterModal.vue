<template>
  <div :class="embedded ? 'cw-library-panel' : 'cw-modal-backdrop'" @click.self="!embedded && emit('close')">
    <div
      class="cw-minor-char-modal"
      :class="[embedded ? 'cw-library-content' : 'cw-modal-box cw-gameplay-panel', { 'cw-empty-result': !minorList.length }]"
    >
      <!-- 顶栏 -->
      <div v-if="!embedded" class="cw-modal-header">
        <div class="cw-header-title">
          <button
            v-if="showMobileDetail"
            class="cw-btn cw-btn-ghost cw-btn-xs cw-mobile-back-btn"
            title="返回次要角色名录"
            @click="showMobileDetail = false"
          >
            <SvgIcon name="arrowLeft" :size="14" />
            <span>名录</span>
          </button>
          <SvgIcon name="users" :size="20" class="cw-header-icon" />
          <span>次要角色与偶遇人物名录</span>
          <span class="cw-badge">简表名录</span>
        </div>
        <button class="cw-btn cw-btn-ghost cw-close-btn cw-gameplay-close" @click="emit('close')">
          <SvgIcon name="close" :size="18" />
        </button>
      </div>

      <button
        v-if="embedded && showMobileDetail"
        class="cw-btn cw-btn-ghost cw-mobile-back-btn cw-embedded-back"
        @click="showMobileDetail = false"
      >
        <SvgIcon name="arrowLeft" :size="14" />返回名录
      </button>

      <!-- 双栏布局：左侧切换人物，右侧固定导航与独立阅读区域 -->
      <div v-if="!minorList.length" class="cw-character-empty" role="status">
        <SvgIcon name="users" :size="28" />
        <strong>暂无次要角色档案</strong>
        <p>结识新的街坊或偶遇人物后，名录会显示在这里。</p>
      </div>
      <div v-else class="cw-modal-main-layout">
        <!-- 统一分类、拖拽与启停侧边栏 -->
        <CharacterCategorySidebar
          :characters="characters"
          :selected-id="selectedId"
          tier="次要"
          class="cw-minor-sidebar"
          :class="{ 'cw-mobile-hidden': showMobileDetail }"
          @select="handleSelectCharacter"
        />

        <!-- 右侧资料单页分段呈现 -->
        <div class="cw-char-content-pane" :class="{ 'cw-mobile-hidden': !showMobileDetail }">
          <template v-if="currentChar">
            <!-- 停用角色静态档案查看提示横幅 (吸顶固定) -->
            <div v-if="isCurrentCharDisabled" class="cw-inactive-dossier-banner">
              <div class="cw-banner-text">
                <SvgIcon name="alertCircle" :size="15" />
                <span>该次要角色当前已停用。正在查看保存的静态档案，不会参与后续剧情与 AI 上下文互动。</span>
              </div>
              <button class="cw-btn cw-btn-primary cw-btn-xs" :disabled="isManagementPending" @click="handleToggleCurrentChar">重新启用角色</button>
            </div>

            <!-- 头部名片与升格操作 (吸顶固定，防挤压布局) -->
            <div class="cw-minor-hero">
              <div class="cw-hero-left">
                <div class="cw-name-row">
                  <CharacterAvatar :name="currentChar.基础信息?.姓名 || currentChar.姓名 || selectedId" :size="40" />
                  <div class="cw-hero-info">
                    <div class="cw-hero-name-row">
                      <h3 class="cw-hero-name" :title="currentChar.基础信息?.姓名 || currentChar.姓名 || selectedId">
                        {{ currentChar.基础信息?.姓名 || currentChar.姓名 || selectedId }}
                      </h3>
                      <span v-if="currentChar.基础信息?.性别 || currentChar.性别" class="cw-badge cw-badge-sm">
                        {{ currentChar.基础信息?.性别 || currentChar.性别 }}
                      </span>
                      <span class="cw-badge cw-badge-sm">
                        {{ currentChar.年龄 == null ? '年龄未知' : `${currentChar.年龄}岁` }}
                      </span>
                      <span class="cw-badge cw-badge-info cw-badge-sm">次要角色</span>
                      <span v-if="isCurrentCharDisabled" class="cw-badge cw-badge-muted cw-badge-sm">已停用</span>
                    </div>
                    <div class="cw-hero-meta">
                      <span v-if="currentChar.当前地点id || currentChar.当前状态?.当前地点id">
                        常在：{{ resolveLocationName(state, currentChar.当前地点id || currentChar.当前状态?.当前地点id) }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="cw-hero-right">
                <!-- 启停开关 (精简文案与尺寸，避免和升格按钮发生拥挤) -->
                <div
                  class="cw-status-toggle-wrap"
                  :title="isCurrentCharDisabled ? '当前已停用，点击启用该次要角色' : '当前已启用，点击停用该次要角色'"
                >
                  <span class="cw-status-dot" :class="{ 'is-active': !isCurrentCharDisabled }" />
                  <span class="cw-status-label" :class="{ 'is-disabled': isCurrentCharDisabled }">
                    {{ isCurrentCharDisabled ? '已停用' : '已启用' }}
                  </span>
                  <CwToggleSwitch
                    silent-pending
                    :model-value="!isCurrentCharDisabled"
                    :loading="!!operationPending['char:' + selectedId]"
                    size="sm"
                    @change="handleToggleCurrentChar"
                  />
                </div>

                <!-- 升格为主要角色按钮 (高质感专属胶囊按钮，合理留白) -->
                <button
                  type="button"
                  class="cw-promote-btn"
                  :disabled="isCurrentCharDisabled || isManagementPending"
                  :title="isCurrentCharDisabled ? '已停用角色无法升格，请先启用' : '将该次要人物升格为深度互动主要角色'"
                  @click="handlePromoteCurrentChar"
                >
                  <SvgIcon name="star" :size="13" />
                  <span>升格为主要角色</span>
                </button>
              </div>
            </div>

            <!-- 吸顶固定 Tab 导航栏 (彻底解决 Tab 遮挡问题) -->
            <div ref="minorTabBarRef" class="cw-minor-subtabs" role="tablist">
              <button
                type="button"
                class="cw-minor-subtab"
                role="tab"
                data-tab="base"
                :aria-selected="currentSubTab === 'base'"
                :class="{ active: currentSubTab === 'base' }"
                @click="currentSubTab = 'base'"
              >
                <SvgIcon name="user" :size="14" />
                <span>基础与行踪</span>
              </button>
              <button
                type="button"
                class="cw-minor-subtab"
                role="tab"
                data-tab="relations"
                :aria-selected="currentSubTab === 'relations'"
                :class="{ active: currentSubTab === 'relations' }"
                @click="currentSubTab = 'relations'"
              >
                <SvgIcon name="heart" :size="14" />
                <span>社会关系网</span>
              </button>
              <button
                type="button"
                class="cw-minor-subtab"
                role="tab"
                data-tab="records"
                :aria-selected="currentSubTab === 'records'"
                :class="{ active: currentSubTab === 'records' }"
                @click="currentSubTab = 'records'"
              >
                <SvgIcon name="bookmark" :size="14" />
                <span>经历与记录</span>
                <span v-if="records.length" class="cw-tab-cnt">{{ records.length }}</span>
              </button>
            </div>

            <!-- 独立内容滚动视口容器 (滚动区域仅作用于此，保持 Tab 导航吸顶常驻) -->
            <div ref="minorContentView" class="cw-minor-tab-view">
              <!-- 子面板 1：基础档案与行踪 -->
              <div v-show="currentSubTab === 'base'" class="cw-minor-sections">
                <div class="cw-section-card">
                  <h4 class="cw-section-title">
                    <SvgIcon name="user" :size="15" />
                    <span>基本属性与身份</span>
                  </h4>
                  <div class="cw-info-grid">
                    <div class="cw-info-row">
                      <span class="cw-k">种族属性：</span>
                      <span class="cw-v">{{ show(currentChar.种族) }}</span>
                    </div>
                    <div class="cw-info-row">
                      <span class="cw-k">身份：</span>
                      <OccupationTags :value="currentChar.身份" />
                    </div>
                  </div>
                </div>

                <!-- 基本外貌与印象 -->
                <div class="cw-section-card">
                  <h4 class="cw-section-title">
                    <SvgIcon name="eye" :size="15" />
                    <span>外貌特质与第一印象</span>
                  </h4>
                  <p class="cw-section-text">
                    {{ currentChar.简介 ?? '暂未留下外貌与第一印象长篇描写' }}
                  </p>
                  <div v-if="currentChar.外貌" class="cw-info-grid" style="margin-top: 12px">
                    <div class="cw-info-row"><span class="cw-k">身高 / 体重：</span><span class="cw-v">{{ currentChar.外貌.身高 == null ? '未知' : currentChar.外貌.身高 + ' cm' }} / {{ currentChar.外貌.体重 == null ? '未知' : currentChar.外貌.体重 + ' kg' }}</span></div>
                    <div class="cw-info-row"><span class="cw-k">整体体型：</span><span class="cw-v">{{ show(currentChar.外貌.整体体型) }}</span></div>
                    <div class="cw-info-row"><span class="cw-k">详细外表：</span><span class="cw-v">{{ show(currentChar.外貌.详细外表) }}</span></div>
                    <div class="cw-info-row"><span class="cw-k">今日穿搭：</span><span class="cw-v">{{ show(currentChar.外貌.今日穿搭) }}</span></div>
                  </div>
                </div>

                <div v-if="typeof currentChar.性格 === 'string' && currentChar.性格" class="cw-section-card">
                  <h4 class="cw-section-title"><SvgIcon name="heart" :size="15" /><span>性格与相处</span></h4>
                  <p class="cw-section-text">{{ currentChar.性格 }}</p>
                </div>

                <div v-if="currentChar.专属标识" class="cw-section-card">
                  <h4 class="cw-section-title"><SvgIcon name="bookmark" :size="15" /><span>专属标识</span></h4>
                  <div class="cw-info-grid">
                    <div class="cw-info-row"><span class="cw-k">身体印记：</span><span class="cw-v">{{ markerText(currentChar.专属标识.身体印记) }}</span></div>
                    <div class="cw-info-row"><span class="cw-k">随身信物：</span><span class="cw-v">{{ markerText(currentChar.专属标识.随身信物) }}</span></div>
                    <div class="cw-info-row"><span class="cw-k">感官特征：</span><span class="cw-v">{{ show(currentChar.专属标识.感官特征) }}</span></div>
                    <div class="cw-info-row"><span class="cw-k" tabindex="0" :data-cw-tooltip="emotionalTriggerDescription" data-cw-tooltip-touch>{{ emotionalTriggerLabel }}：</span><span class="cw-v">{{ show(currentChar.专属标识.破防弱点) }}</span></div>
                  </div>
                </div>

                <!-- 当前状态与行踪 -->
                <div class="cw-section-card">
                  <h4 class="cw-section-title">
                    <SvgIcon name="mapPin" :size="15" />
                    <span>当前状态与实时行踪</span>
                  </h4>
                  <div class="cw-info-grid">
                    <div class="cw-info-row">
                      <span class="cw-k">当前地点：</span>
                      <span class="cw-v">{{
                        resolveLocationName(state, currentChar.当前地点id || currentChar.当前状态?.当前地点id)
                      }}</span>
                    </div>
                    <div class="cw-info-row">
                      <span class="cw-k">当前形态：</span>
                      <span class="cw-v">{{ show(currentChar.当前形态) }}</span>
                    </div>
                    <div class="cw-info-row">
                      <span class="cw-k">实时动态：</span>
                      <span class="cw-v">{{
                        typeof currentChar.当前状态 === 'string'
                          ? currentChar.当前状态
                          : currentChar.当前状态?.动作描述 || '日常待机'
                      }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 子面板 2：人际关系与社会交往 (统一交由 TabRelations 承载) -->
              <div v-show="currentSubTab === 'relations'" class="cw-minor-sections">
                <TabRelations :char="currentChar" :all-characters="characters" />
              </div>

              <!-- 子面板 3：经历记录与约定 -->
              <div v-show="currentSubTab === 'records'" class="cw-minor-sections">
                <template v-if="records.length > 0">
                  <div v-for="record in records" :key="record.id" class="cw-section-card">
                    <h4 class="cw-section-title">
                      <SvgIcon name="bookmark" :size="15" />
                      <span>{{ record.title }}</span>
                    </h4>
                    <p class="cw-section-text" style="white-space: pre-wrap">{{ record.text }}</p>
                    <p v-if="record.eventId" class="cw-section-text cw-text-muted" style="margin-top: 6px; font-size: 12px;">
                      关联事件：{{ resolveEntityName(state, record.eventId) }}
                    </p>
                    <p v-if="record.covenantId" class="cw-section-text cw-text-muted" style="margin-top: 4px; font-size: 12px;">
                      关联约定：{{ resolveEntityName(state, record.covenantId) }}
                    </p>
                  </div>
                </template>
                <div v-else class="cw-empty-sub">
                  <SvgIcon name="bookmark" :size="20" class="cw-empty-icon" />
                  <span>该人物暂无独立生平或额外经历记录。</span>
                </div>
              </div>
            </div>
          </template>

          <div v-else class="cw-no-select-tip">
            <SvgIcon name="user" :size="36" />
            <span>请在左侧选择一位次要角色。</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useWorldState, show } from '../../utils/context';
import { resolveLocationName, resolveEntityName } from '../../utils/entity';
import { minorRecordSections } from '../../utils/minor-records';
import { emotionalTriggerDescription, emotionalTriggerLabel } from '../../utils/relationship-labels';
import TabRelations from './major-tabs/TabRelations.vue';
import SvgIcon from '../icons/SvgIcon.vue';
import CharacterAvatar from '../shared/CharacterAvatar.vue';
import OccupationTags from '../shared/OccupationTags.vue';
import CharacterCategorySidebar from './CharacterCategorySidebar.vue';
import CwToggleSwitch from './CwToggleSwitch.vue';
import { useCharacterDisplayState } from './useCharacterDisplayState';

const state = useWorldState();

const props = defineProps<{
  characters: Record<string, any>;
  embedded?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'promoteCharacter', charId: string): void;
}>();

const { charMetaMap, toggleCharacterEnabled, operationPending } = useCharacterDisplayState();

function handleKeydown(e: KeyboardEvent) {
  if (!props.embedded && e.key === 'Escape') {
    emit('close');
  }
}

const showMobileDetail = ref(false);
const currentSubTab = ref<'base' | 'relations' | 'records'>('base');
const minorTabBarRef = ref<HTMLElement | null>(null);

function scrollSubTabIntoView(tabKey = currentSubTab.value) {
  nextTick(() => {
    const btn = minorTabBarRef.value?.querySelector?.(`[data-tab="${tabKey}"]`) as HTMLElement | null;
    btn?.scrollIntoView?.({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  });
}

watch(currentSubTab, tabKey => {
  scrollSubTabIntoView(tabKey);
});
watch(showMobileDetail, isVisible => {
  if (isVisible) scrollSubTabIntoView();
});

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  scrollSubTabIntoView();
});
onUnmounted(() => window.removeEventListener('keydown', handleKeydown));
const markerText = (value: unknown) => show(Array.isArray(value) ? value.join('、') : value);

// 阅读位置独立记忆管理
const minorContentView = ref<HTMLElement | null>(null);
const minorScrollPositions = new Map<string, number>();

function saveScroll(id: string, tab: string) {
  if (minorContentView.value && id) {
    minorScrollPositions.set(JSON.stringify([id, tab]), minorContentView.value.scrollTop);
  }
}

function restoreScroll(id: string, tab: string) {
  nextTick(() => {
    if (minorContentView.value && selectedId.value === id && currentSubTab.value === tab) {
      minorContentView.value.scrollTop = minorScrollPositions.get(JSON.stringify([id, tab])) ?? 0;
    }
  });
}

const minorList = computed(() => {
  if (!props.characters || typeof props.characters !== 'object') return [];
  return Object.entries(props.characters)
    .filter(([_, c]: [string, any]) => c.层级 === '次要')
    .map(([id, c]: [string, any]) => ({
      id,
      name: c.基础信息?.姓名 || c.姓名 || id,
      occupation: (typeof c.身份 === 'string' ? c.身份 : null) || c.身份?.身份 || c.基础信息?.职业,
      raw: c,
    }));
});

const selectedId = ref<string>(minorList.value[0]?.id || '');
watch(minorList, list => {
  if (!list.some(c => c.id === selectedId.value)) {
    selectedId.value = list[0]?.id || '';
  }
});
watch([selectedId, currentSubTab], ([id, tab], [previousId, previousTab]) => {
  saveScroll(previousId, previousTab);
  restoreScroll(id, tab);
});

function handleSelectCharacter(id: string) {
  if (selectedId.value !== id) {
    selectedId.value = id;
  }
  showMobileDetail.value = true;
}

defineExpose({ selectCharacter: handleSelectCharacter });

const currentChar = computed(() => {
  if (!selectedId.value) return null;
  return minorList.value.some(c => c.id === selectedId.value) ? props.characters[selectedId.value] : null;
});
const records = computed(() => minorRecordSections(currentChar.value));

const isCurrentCharDisabled = computed(() => {
  if (!selectedId.value) return false;
  const meta = charMetaMap.value[selectedId.value];
  if (meta) return !meta.enabled;
  const raw = currentChar.value;
  return raw?._管理?.停用 === true || raw?.已停用 === true;
});
const isManagementPending = computed(() => Object.values(operationPending.value).some(Boolean));

function handlePromoteCurrentChar() {
  if (!selectedId.value || isCurrentCharDisabled.value || isManagementPending.value) return;
  emit('promoteCharacter', selectedId.value);
}

async function handleToggleCurrentChar() {
  if (!selectedId.value || isManagementPending.value) return;
  await toggleCharacterEnabled(selectedId.value);
}

function getAttitudeLabel(char: any) {
  const value = char?.关系网?.[state?.value?.玩家?.id]?.好感度;
  return value == null ? '未知' : String(value);
}
function getAttitudeDesc(char: any) {
  return char?.关系网?.[state?.value?.玩家?.id]?.关系备注 ?? '未知';
}
</script>

<style scoped lang="scss">
.cw-minor-char-modal.cw-empty-result {
  height: auto;
}
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
.cw-minor-char-modal {
  width: 860px;
  height: 620px;
  max-width: calc(100% - 16px);
  max-height: calc(100% - 16px);
}

.cw-modal-header {
  flex-shrink: 0;
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
}

.cw-modal-main-layout {
  min-height: 0;
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* 停用角色静态档案查看提示横幅 */
.cw-inactive-dossier-banner {
  flex-shrink: 0;
  flex-wrap: wrap;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  background: var(--cw-warning-bg, rgba(217, 130, 43, 0.12));
  border-bottom: 1px solid rgba(217, 130, 43, 0.25);
  color: var(--cw-warning, #d9822b);
  font-size: 13px;

  .cw-banner-text {
    display: flex;
    align-items: center;
    gap: 8px;
    line-height: 1.4;
  }
}

.cw-status-toggle-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: var(--cw-radius-full);
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);
  transition: border-color 0.15s ease;
  user-select: none;

  .cw-status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--cw-text-muted);
    transition: all 0.2s ease;

    &.is-active {
      background: var(--cw-success, #3f8f6b);
      box-shadow: 0 0 5px rgba(63, 143, 107, 0.45);
    }
  }

  .cw-status-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--cw-text-primary);
    white-space: nowrap;

    &.is-disabled {
      color: var(--cw-text-muted);
    }
  }
}

.cw-promote-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 12px;
  border-radius: var(--cw-radius-full);
  border: 1px solid rgba(212, 154, 61, 0.38);
  background: linear-gradient(135deg, rgba(212, 154, 61, 0.14), rgba(212, 154, 61, 0.05));
  color: var(--cw-accent-warm, #d49a3d);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover:not(:disabled) {
    border-color: rgba(212, 154, 61, 0.65);
    background: linear-gradient(135deg, rgba(212, 154, 61, 0.24), rgba(212, 154, 61, 0.1));
    color: var(--cw-accent-warm, #e5a947);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(212, 154, 61, 0.2);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: none;
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    filter: grayscale(0.8);
  }
}

.cw-mobile-back-btn {
  display: none;
}

.cw-char-content-pane {
  min-height: 0;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--cw-bg-main);
  padding: 0;
}

.cw-minor-hero {
  flex-wrap: wrap;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 20px;
  background: var(--cw-bg-surface);
  border-bottom: 1px solid var(--cw-border);

  .cw-hero-left {
    min-width: 0;
    flex: 1 1 180px;

    .cw-name-row {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;

      .cw-hero-info {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .cw-hero-name-row {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
      }

      .cw-hero-name {
        margin: 0;
        font-size: 16px;
        font-weight: 700;
        color: var(--cw-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 150px;
      }
    }

    .cw-hero-meta {
      font-size: 12px;
      color: var(--cw-text-muted);
      margin-top: 1px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  .cw-hero-right {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }
}

/* 吸顶固定 Tab 导航条 (彻底解决 Tab 被遮挡/滚出视野) */
.cw-minor-subtabs {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  background: var(--cw-bg-card-subtle);
  border-bottom: 1px solid var(--cw-border);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }

  .cw-minor-subtab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    border-radius: var(--cw-radius);
    border: 1px solid transparent;
    background: transparent;
    color: var(--cw-text-secondary);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s ease;

    &:hover {
      background: var(--cw-bg-card);
      color: var(--cw-text-primary);
    }

    &.active {
      background: var(--cw-bg-surface);
      border-color: var(--cw-border);
      color: var(--cw-accent);
      box-shadow: var(--cw-shadow-sm);
      font-weight: 600;
    }

    .cw-tab-cnt {
      font-size: 10px;
      padding: 1px 5px;
      border-radius: var(--cw-radius-full);
      background: var(--cw-accent-bg);
      border: 1px solid var(--cw-accent-border);
      color: var(--cw-accent);
    }
  }
}

/* 独立内容滚动视口 */
.cw-minor-tab-view {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px 24px;
}

.cw-badge-sm {
  font-size: 11px;
  padding: 1px 6px;
  line-height: 1.4;
}

.cw-minor-sections {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cw-section-card {
  padding: 14px 18px;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card);
  border: 1px solid var(--cw-border);

  .cw-section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 10px;
    font-size: 13px;
    font-weight: 600;
    color: var(--cw-text-primary);
    border-bottom: 1px dashed var(--cw-border);
    padding-bottom: 6px;
  }

  .cw-section-text {
    margin: 0;
    font-size: 14px;
    color: var(--cw-text-primary);
    line-height: 1.8;
    white-space: pre-wrap;
    word-break: break-word;
  }
}

@media (max-width: 860px) and (min-width: 681px) {
  .cw-minor-sidebar {
    width: 230px !important;
  }
  .cw-minor-hero {
    padding-bottom: 12px;
    margin-bottom: 12px;
  }
}

.cw-info-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;

  .cw-info-row {
    display: flex;
    gap: 6px;

    .cw-k {
      color: var(--cw-text-muted);
      width: 80px;
      flex-shrink: 0;
    }
    .cw-v {
      min-width: 0;
      color: var(--cw-text-primary);
      overflow-wrap: anywhere;
    }
  }
}

.cw-attitude-box {
  display: flex;
  flex-direction: column;
  gap: 6px;

  .cw-att-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }

  .cw-att-desc {
    margin: 0;
    font-size: 13px;
    color: var(--cw-text-secondary);
    line-height: 1.5;
  }
}

.cw-empty-sub,
.cw-no-select-tip {
  padding: 40px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--cw-text-muted);
  font-size: 13px;
}

.cw-library-panel {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.cw-library-content.cw-minor-char-modal {
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
  .cw-minor-char-modal {
    width: 100%;
    height: 100%;
    max-height: 100%;
    border-radius: 0;
  }
  .cw-mobile-back-btn {
    display: inline-flex;
    flex-shrink: 0;
    white-space: nowrap;
  }
  .cw-modal-header {
    padding: 10px 12px;
    align-items: flex-start;
    gap: 8px;
    .cw-header-title {
      min-width: 0;
      gap: 6px;
      > span:not(.cw-badge) {
        min-width: 0;
        font-size: 14px;
        line-height: 1.4;
      }
      > .cw-badge {
        display: none;
      }
    }
  }
  .cw-mobile-hidden {
    display: none !important;
  }
  .cw-modal-main-layout {
    flex-direction: column;
  }
  .cw-minor-hero {
    padding: 6px 10px;
    gap: 8px;
    flex-direction: column;
    align-items: stretch;
    .cw-hero-left {
      flex: 0 0 auto;
      width: 100%;
      min-width: 0;
      .cw-name-row {
        gap: 6px;
        > :first-child {
          flex-shrink: 0;
        }
        .cw-hero-info {
          flex: 1;
        }
        .cw-hero-name {
          font-size: 14px;
          flex-basis: 100%;
          max-width: none;
          white-space: normal;
          overflow-wrap: anywhere;
          overflow: visible;
          text-overflow: clip;
        }
      }
      .cw-badge {
        font-size: 10px;
        padding: 1px 5px;
        flex-shrink: 0;
        white-space: nowrap;
      }
    }
    .cw-hero-right {
      width: 100%;
      margin-left: 0;
      flex-shrink: 0;
      flex-wrap: wrap;
      justify-content: flex-start;
      gap: 6px;
    }
  }
  .cw-minor-subtabs {
    padding: 4px 8px;
    gap: 4px;
    overflow-x: auto;
    scrollbar-width: none;
    .cw-minor-subtab {
      padding: 3px 8px;
      font-size: 12px;
      white-space: nowrap;
    }
  }
  .cw-minor-tab-view {
    padding: 10px 12px;
  }
}
@media (max-width: 380px) {
  .cw-modal-header {
    padding: 10px 12px;
    .cw-header-title span:not(.cw-badge) {
      font-size: 14px;
    }
  }
}
</style>
