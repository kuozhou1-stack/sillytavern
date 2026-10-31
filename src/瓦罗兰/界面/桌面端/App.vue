<template>
  <div ref="desktopRoot" class="cw-desktop-shell cw-text-root" :data-theme="currentTheme" :data-font="currentFont">
    <FollowTooltip :scope="desktopRoot" />
    <div
      class="cw-scale-root"
      :style="{
        '--cw-ui-scale': uiScale / 100,
        '--cw-font-size-body': `${fontSize}px`,
        '--cw-line-height-body': lineHeight,
        '--cw-letter-spacing-body': `${letterSpacing}em`,
        '--cw-paragraph-margin': `${paragraphSpacing}em`,
      }"
    >
      <!-- A. 独立建档全屏页面 (仅未建档时显示；展示入口可显式预览) -->
      <CreationView
        v-if="showCreation"
        :initial-profile="creationProfileDraft"
        :initial-characters-list="creationCharactersDraft"
        :can-cancel="isCreationCompleted"
        :is-demonstration="!runtime"
        :submit="handleCreationFinish"
        :draft-key="creationDraftKey"
        @cancel="isReviewingCreation = false"
        @open-settings="openModal('settings')"
      />

      <!-- B. 瓦洛兰主阅读界面 (建档完成后显示) -->
      <template v-else>
        <!-- 1. 顶部世界常驻信息栏 -->
        <WorldBar
          :world="state.世界"
          :player="state.玩家"
          :locations="state.地点"
          @open-settings="openModal('settings')"
          @open-world-detail="tab => openWorldDetailWithTab(tab)"
          @open-system-drawer="showSystemDrawer = true"
        />

        <!-- 2. 主视口主体：电脑左侧资料入口；手机底部纯文字导航 -->
        <main class="cw-main-content">
          <nav class="cw-left-floating-bar" aria-label="核心功能导航">
            <button type="button" class="cw-float-btn" title="查看玩家个人档案与三条身体状态" @click="openModal('player')">
              <SvgIcon name="user" :size="20" />
              <span>玩家</span>
            </button>
            <button type="button" class="cw-float-btn" title="查看角色库与人物档案" @click="openModal('major_chars')">
              <SvgIcon name="userCheck" :size="20" />
              <span>角色</span>
            </button>
            <button type="button" class="cw-float-btn" title="查看奇遇、任务大厅与系统商店" @click="openModal('novel')">
              <SvgIcon name="sparkles" :size="20" />
              <span>奇遇</span>
            </button>
          </nav>

          <!-- 中央正文阅读流 (包裹全部玩家与AI正文) -->
          <div class="cw-chat-wrapper" :style="{ '--cw-composer-height': composerHeight + 'px' }">
            <ChatContainer
              :messages="chatMessages"
              :actions-blocked="!!(taskState?.generating || taskState?.updating || taskState?.acting)"
              @execute-action="handleChatMessageAction"
            />

            <!-- 底部输入与操作区域：单行通知、输入框及右侧状态按钮，手机附加纯文字导航 -->
            <div ref="composer" class="cw-floating-composer">
              <!-- 有消息时显示的单行通知 -->
              <ComposerNotification
                v-if="!notificationOverlay"
                :toast-message="toastMessage"
                :error-text="runtime?.view.error"
                :update-failed="updateFailed && activeModal !== 'phone'"
                :is-generating="isGenerating"
                :is-updating-variables="isUpdatingVariables"
                :busy-hint="taskState?.hint"
                :is-acting="taskState?.acting"
                @close-toast="dismissToast"
                @retry-update="handleRetryUpdate"
                @discard-pending="execute(() => runtime!.discardPending())"
              />

              <!-- 输入框与右侧发送/停止状态按钮并排 -->
              <InputArea
                :is-generating="isGenerating"
                :is-updating-variables="isUpdatingVariables"
                :can-stop="taskState?.stoppable"
                :update-failed="updateFailed && activeModal !== 'phone'"
                :blocked="taskState?.locked"
                :busy-hint="taskState?.hint"
                :error-text="runtime?.view.error"
                :is-acting="taskState?.acting"
                @send="handleSendMessage"
                @stop-generation="handleStopGeneration"
                @manual-retry-update="handleRetryUpdate"
                @discard-pending="execute(() => runtime!.discardPending())"
              />

              <!-- 纯文字导航“玩家｜角色｜奇遇｜手机” (无图标，手机带未读角标) -->
              <nav class="cw-bottom-text-nav" aria-label="核心功能导航">
                <button type="button" class="cw-text-nav-item" @click="openModal('player')">玩家</button>
                <span class="cw-nav-sep" aria-hidden="true">|</span>
                <button type="button" class="cw-text-nav-item" @click="openModal('major_chars')">角色</button>
                <span class="cw-nav-sep" aria-hidden="true">|</span>
                <button type="button" class="cw-text-nav-item" @click="openModal('novel')">奇遇</button>
                <span class="cw-nav-sep" aria-hidden="true">|</span>
                <button type="button" class="cw-text-nav-item cw-nav-phone-btn" @click="openModal('phone')">
                  <span>手机</span>
                  <span v-if="unreadCount > 0" class="cw-unread-dot" :title="`未读通知 ${unreadCount} 条`">{{ unreadCount }}</span>
                </button>
              </nav>
            </div>
          </div>
        </main>

        <!-- 3. 电脑保留原有可自由拖动的手机入口 -->
        <PhoneTrigger class="cw-desktop-phone-trigger" :unread-count="unreadCount" @open-phone="openModal('phone')" />

        <!-- 4. 居中弹窗集合 -->
        <!-- 城市次级详情与资金账目弹窗 -->
        <WorldDetailModal
          v-if="activeModal === 'world_detail'"
          :world="state.世界"
          :player="state.玩家"
          :locations="state.地点"
          :initial-tab="worldDetailInitialTab"
          @close="closeModal"
        />

        <!-- 玩家档案与状态弹窗 (4 Tab) -->
        <PlayerModal
          v-if="activeModal === 'player'"
          :player="state.玩家"
          :world-covenants="state.约定"
          :initial-tab="playerInitialTab"
          @close="closeModal"
          @use-item="handleUseItem"
        />

        <CharacterLibraryModal
          v-if="activeModal && ['major_chars', 'minor_chars', 'char_manage'].includes(activeModal)"
          :view="activeModal"
          :characters="libraryCharacters"
          :export-character="runtime?.exportManagedCharacter"
          :import-characters="handleImportChars"
          @close="closeModal"
          @navigate="openModal"
          @delete-character="handleDeleteChar"
          @promote-character="handlePromoteChar"
        />

        <!-- 手机系统弹窗 (包含 4 个 App) -->
        <PhoneShell
          v-if="activeModal === 'phone'"
          :world="state.世界"
          :player="state.玩家"
          :phone-data="state.手机"
          :world-time="state.世界?.当前时间"
          @close="closeModal"
          @feedback="showToast"
        />

        <!-- 生理状态低值预警弹窗 -->
        <LowStatusModal
          v-if="showLowStatusAlert"
          :player="state.玩家"
          @close="showLowStatusAlert = false"
          @go-to-items="openPlayerItems"
        />

        <!-- 奇遇系统弹窗 (包含任务大厅、系统商店、收支流水) -->
        <NovelSystemModal
          v-if="activeModal === 'novel'"
          :state="state"
          @close="closeModal"
          @open-inventory="openPlayerItems"
          @feedback="showToast"
        />

        <!-- 物品使用确认弹窗 (解决 F31 原生 prompt 替换) -->
        <div v-if="itemToUse" class="cw-modal-backdrop" @click.self="itemToUse = null">
          <div class="cw-modal-box cw-item-use-modal">
            <div class="cw-modal-header">
              <div class="cw-header-title">
                <SvgIcon name="backpack" :size="18" />
                <span>使用物品 · {{ itemToUse.名称 }}</span>
              </div>
              <button class="cw-btn cw-btn-ghost cw-close-btn" @click="itemToUse = null">
                <SvgIcon name="close" :size="16" />
              </button>
            </div>
            <div class="cw-modal-body" style="display: flex; flex-direction: column; gap: 12px; padding: 16px 20px">
              <p style="margin: 0; font-size: 13px; color: var(--cw-text-secondary); line-height: 1.5">
                {{ itemToUse.描述 || '确认在剧情中使用此物品，将由正文与变量结算行动效果。' }}
              </p>
              <div v-if="itemToUse.类别 === '消耗品'" style="display: flex; flex-direction: column; gap: 6px">
                <label style="font-size: 12px; font-weight: 500; color: var(--cw-text-primary)">
                  本次实际使用用量（单位：{{ itemToUse.单位 ?? '未知' }}，现有：{{ itemToUse.数量 ?? '未知' }}）：
                </label>
                <input
                  v-model.number="itemUseAmount"
                  type="number"
                  min="1"
                  :max="itemToUse.数量 ?? undefined"
                  class="cw-input"
                  placeholder="填写使用数量"
                />
              </div>
              <p v-if="itemUseError" style="margin: 0; font-size: 12px; color: var(--cw-danger)" role="alert">
                {{ itemUseError }}
              </p>
            </div>
            <div
              class="cw-modal-footer"
              style="
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                padding: 12px 20px;
                border-top: 1px solid var(--cw-border);
                background: var(--cw-bg-card-subtle);
              "
            >
              <button class="cw-btn cw-btn-ghost" @click="itemToUse = null">取消</button>
              <button class="cw-btn cw-btn-primary" @click="confirmUseItem(itemToUse, String(itemUseAmount))">
                确认使用
              </button>
            </div>
          </div>
        </div>

        <!-- 5. 侧边滑出：系统技术字段抽屉 (_系统) -->
        <SystemDataDrawer v-if="showSystemDrawer" :system-data="state._系统" @close="showSystemDrawer = false" />
      </template>

      <SettingsModal
        v-if="activeModal === 'settings'"
        :current-theme="currentTheme"
        :current-font="currentFont"
        :current-font-size="fontSize"
        :current-ui-scale="uiScale"
        :current-line-height="lineHeight"
        :current-letter-spacing="letterSpacing"
        :current-paragraph-spacing="paragraphSpacing"
        @close="closeModal"
        @change-theme="t => (currentTheme = t)"
        @change-font="f => (currentFont = f)"
        @change-font-size="s => (fontSize = s)"
        @change-ui-scale="sc => (uiScale = sc)"
        @change-line-height="v => (lineHeight = v)"
        @change-letter-spacing="v => (letterSpacing = v)"
        @change-paragraph-spacing="v => (paragraphSpacing = v)"
        @feedback="showToast"
      />

      <!-- 建档、模态和抽屉遮住正文时，普通反馈仍有独立且唯一的阅读出口。 -->
      <div v-if="notificationOverlay && toastMessage" class="cw-overlay-notification">
        <ComposerNotification :toast-message="toastMessage" @close-toast="dismissToast" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import CharacterLibraryModal from './components/characters/CharacterLibraryModal.vue';
import FollowTooltip from './components/shared/FollowTooltip.vue';
import { ref, computed, inject, provide, watch, onMounted, onBeforeUnmount } from 'vue';
import { useResizeObserver } from '@vueuse/core';
import { Schema } from '../../schema';
import { RuntimeKey, type Runtime } from '../../运行/host';
import { copy, lowStatus, uid } from '../../运行/core';
import { createProfile } from '../../运行/creation';
import { importCharacter, deleteCharacter } from '../../运行/characters';
import { StateKey } from './utils/context';
import { installModalFocus } from './utils/modal-focus';
import { taskPresentation } from './utils/task-presentation';
import SvgIcon from './components/icons/SvgIcon.vue';
import ComposerNotification from './components/chat/ComposerNotification.vue';
import WorldBar from './components/world/WorldBar.vue';
import WorldDetailModal from './components/world/WorldDetailModal.vue';
import ChatContainer from './components/chat/ChatContainer.vue';
import InputArea from './components/chat/InputArea.vue';
import PhoneShell from './components/phone/PhoneShell.vue';
import PhoneTrigger from './components/phone/PhoneTrigger.vue';
import PlayerModal from './components/player/PlayerModal.vue';
import SettingsModal from './components/settings/SettingsModal.vue';
import SystemDataDrawer from './components/system/SystemDataDrawer.vue';
import LowStatusModal from './components/feedback/LowStatusModal.vue';
import NovelSystemModal from './components/novel-system/NovelSystemModal.vue';
import CreationView from './components/creation/CreationView.vue';
import type { ChatMessageItem } from './components/chat/MessageItem.vue';
import { useCharacterDisplayState } from './components/characters/useCharacterDisplayState';
import { characterManagementContracts } from '../character-management';

const props = defineProps<{
  initialData?: any;
  initialMessages?: ChatMessageItem[];
  previewState?: 'normal' | 'generating' | 'waiting' | 'failed';
  previewModal?: string;
}>();
const runtime = inject<Runtime | null>(RuntimeKey, null);
const preview = ref<any>(props.initialData ? copy(props.initialData) : Schema.parse({}));
const state = computed<any>(() => (runtime ? (runtime.view.data ?? Schema.parse({})) : preview.value));
provide(StateKey, state);

const { lastFeedback, setContracts, syncManagement } = useCharacterDisplayState();
const libraryCharacters = computed(() => runtime?.view.characterLibrary?.characters ?? state.value.角色);
setContracts(runtime ? characterManagementContracts(runtime) : null);
watch(
  () => runtime?.view.characterLibrary,
  library => {
    if (library) {
      const system = runtime?.view.data?._系统;
      syncManagement(
        library.categories,
        library.meta,
        JSON.stringify([system?.存档id, system?.分支id, system?.楼层id, system?.候选回复id]),
      );
    }
  },
  { immediate: true },
);
watch(lastFeedback, fb => {
  if (fb) showToast(fb.message);
});
const currentTheme = ref(runtime?.settings.theme ?? 'warm');
const currentFont = ref(runtime?.settings.font ?? 'sans');
const fontSize = ref(runtime?.settings.fontSize ?? 16);
const uiScale = ref(runtime?.settings.scale ?? 100);
const lineHeight = ref(runtime?.settings.lineHeight ?? 1.8);
const letterSpacing = ref(runtime?.settings.letterSpacing ?? 0.02);
const paragraphSpacing = ref(runtime?.settings.paragraphSpacing ?? 0.8);
watch([currentTheme, currentFont, fontSize, uiScale, lineHeight, letterSpacing, paragraphSpacing], async () => {
  if (!runtime) return;
  const candidate = {
    ...runtime.settings,
    theme: currentTheme.value,
    font: currentFont.value,
    fontSize: fontSize.value,
    scale: uiScale.value,
    lineHeight: lineHeight.value,
    letterSpacing: letterSpacing.value,
    paragraphSpacing: paragraphSpacing.value,
  };
  try {
    await runtime.saveSettings(candidate);
  } catch (e) {
    showToast(String(e));
  }
});
const composer = ref<HTMLElement>();
const composerHeight = ref(100);
useResizeObserver(composer, ([entry]) => {
  composerHeight.value = Math.ceil(entry.contentRect.height);
});
const activeModal = ref<string | null>(props.previewModal ?? null);
const worldDetailInitialTab = ref('schedule');
const playerInitialTab = ref('info');
const showSystemDrawer = ref(false);
const showLowStatusAlert = ref(false);
const activeUsedItem = ref<any>(null);
const toastMessage = ref<string | null>(null);
const toastIsGenerationProgress = ref(false);
const taskState = computed(() => (runtime ? taskPresentation(runtime.view) : null));
const isGenerating = computed(() =>
  taskState.value ? taskState.value.generating : props.previewState === 'generating',
);
const isUpdatingVariables = computed(() =>
  taskState.value ? taskState.value.updating : props.previewState === 'waiting',
);
const updateFailed = computed(() => !!runtime?.view.error || props.previewState === 'failed');
const isCreationCompleted = computed(() => Boolean(state.value._系统?.建档完成));
const isReviewingCreation = ref(props.previewModal === 'wizard');
const showCreation = computed(() => !isCreationCompleted.value || isReviewingCreation.value);
const notificationOverlay = computed(
  () => showCreation.value || activeModal.value !== null || showSystemDrawer.value || showLowStatusAlert.value || !!itemToUse.value,
);
const chatMessages = computed<ChatMessageItem[]>(() => {
  const messages: ChatMessageItem[] = runtime
    ? [
        ...runtime.view.messages,
        ...(runtime.view.streaming && isGenerating.value
          ? [
              {
                id: -1,
                role: 'assistant',
                content: runtime.view.streaming,
                isIncomplete: true,
                variableUpdate: {
                  state: 'receiving',
                  note: '正文接收中，尚未开始变量结算。',
                  changes: [],
                  groups: [],
                } as const,
              },
            ]
          : []),
      ]
    : (props.initialMessages ?? []);
  return messages.slice(-10);
});
const unreadCount = computed(
  () => Object.values(state.value.手机?._通知 ?? {}).filter((n: any) => !n.已读 && !n.免打扰).length,
);
const creationDraftKey = runtime
  ? 'cw:creation:' +
    JSON.stringify([SillyTavern.getCurrentChatId(), getChatMessages(0, { include_swipes: true })[0]?.swipe_id])
  : undefined;
const creationProfileDraft = computed(() => ({
  姓名: state.value.玩家?.姓名 || '',
  种族: state.value.玩家?.种族 || '',
  称呼: state.value.玩家?.称呼 || '',
  性别: state.value.玩家?.性别 || '',
  年龄: state.value.玩家?.年龄 !== undefined ? state.value.玩家.年龄 : null,
  身高: state.value.玩家?.外貌?.身高 !== undefined ? state.value.玩家.外貌.身高 : null,
  体重: state.value.玩家?.外貌?.体重 !== undefined ? state.value.玩家.外貌.体重 : null,
  体型: state.value.玩家?.外貌?.体型 || '',
  面容: state.value.玩家?.外貌?.面容 || '',
  发型: state.value.玩家?.外貌?.发型 || '',
  显著特征: state.value.玩家?.外貌?.显著特征 || '',
  整体外貌描述: state.value.玩家?.外貌?.整体外貌描述 || '',
  身份: state.value.玩家?.身份?.身份 || '',
  成长背景: state.value.玩家?.背景?.成长背景 || '',
  家庭背景: state.value.玩家?.背景?.家庭背景 || '',
  重要过往: state.value.玩家?.背景?.重要过往 || '',
  当前生活背景: state.value.玩家?.背景?.当前生活背景 || '',
  片区id: '',
  住处描述: state.value.玩家?.生活?.日常活动 || '',
  饱食度: state.value.玩家?.当前状态?.饱食度 ?? 100,
  水分值: state.value.玩家?.当前状态?.水分值 ?? 100,
  体力值: state.value.玩家?.当前状态?.体力值 ?? 100,
}));

const creationCharactersDraft = computed(() => {
  if (!state.value.角色 || typeof state.value.角色 !== 'object') return [];
  return Object.entries(state.value.角色).map(([id, c]: [string, any]) => ({
    id,
    ...c,
  }));
});

function showToast(message: string, generationProgress = false) {
  toastMessage.value = message;
  toastIsGenerationProgress.value = generationProgress;
}
function dismissToast() {
  toastMessage.value = null;
  toastIsGenerationProgress.value = false;
}

// 普通反馈保留至手动关闭；只有明确标记的进度提示随生成结束退出。
watch(isGenerating, (generating, wasGenerating) => {
  if (!generating && wasGenerating && toastIsGenerationProgress.value) dismissToast();
});
async function execute(operation: () => Promise<unknown>, success?: string) {
  if (!runtime) {
    showToast('离线展示不写入存档');
    return;
  }
  try {
    await operation();
    if (success) showToast(success);
  } catch (e) {
    showToast(String(e));
  }
}
async function handleCreationFinish(payload: any) {
  isReviewingCreation.value = true;
  // Propagate failures to the mounted wizard; never replace its draft from a host refresh.
  if (!runtime) {
    preview.value = createProfile(Schema.parse(preview.value), payload);
    showToast('仅展示建档结果，未保存到酒馆');
  } else {
    const roster = await runtime.createProfile(payload);
    showToast(
      `建档已保存，开局启用 ${roster.active} 名角色，${roster.waiting} 名进入待机轮转；正在生成开场正文。`,
      true,
    );
  }
  isReviewingCreation.value = false;
  if (runtime) void runtime.startOpening().catch(e => showToast('建档已保存，开场未完成：' + String(e)));
}

function openModal(name: string) {
  desktopRoot.value?.setAttribute('data-cw-modal-request', name);
  console.info('[瓦洛兰前端] 打开面板', name);
  activeModal.value = name;
}
function closeModal() {
  activeModal.value = null;
}
function openWorldDetailWithTab(tab?: string) {
  worldDetailInitialTab.value = tab ?? 'schedule';
  activeModal.value = 'world_detail';
}
function openPlayerItems() {
  playerInitialTab.value = 'items';
  showLowStatusAlert.value = false;
  activeModal.value = 'player';
}
const itemToUse = ref<any>(null);
const itemUseAmount = ref<number | string>(1);
const itemUseError = ref<string>('');

function handleUseItem(item: any) {
  if (item.类别 === '消耗品') {
    itemToUse.value = item;
    itemUseAmount.value = 1;
    itemUseError.value = '';
  } else {
    confirmUseItem(item, '0');
  }
}

function confirmUseItem(item: any, amountStr: string) {
  const amount = Number(amountStr);
  if (item.类别 === '消耗品' && (!Number.isFinite(amount) || amount <= 0)) {
    itemUseError.value = '请填写有效的正数用量';
    return;
  }
  if (item.类别 === '消耗品' && item.数量 !== null && item.数量 !== undefined && amount > item.数量) {
    itemUseError.value = '实际用量超过已记录数量';
    return;
  }
  itemToUse.value = null;
  execute(() =>
    runtime!.send(
      '使用物品：' +
        item.名称 +
        '；物品id：' +
        item.id +
        '；实际用量：' +
        amountStr +
        ' ' +
        (item.单位 ?? '') +
        '。按已有持有人、存放地点及实际行动判断，物品、身体状态和相关事件一起结算，不编造效果。',
      true,
      item.类别 === '消耗品' ? { itemId: item.id, amount } : undefined,
    ),
  );
}
async function handleImportChars(values: any[], submissionId: string) {
  if (!runtime) throw Error('离线展示不写入存档');
  await runtime.commit(s => {
    for (const value of values) {
      const { id, __package, __imported, ...record } = value;
      importCharacter(s, id, record, __package);
    }
  }, submissionId);
  showToast('本批角色资料已保存，等待自然融入');
}

function handleDeleteChar(id: string) {
  execute(
    () =>
      runtime!.commit(s => {
        deleteCharacter(s, id);
      }),
    '本人资料已移除，既有接收侧历史保留',
  );
}
function handlePromoteChar(id: string) {
  execute(
    () =>
      runtime!.commit(s => {
        if (!s.角色[id]) throw Error('人物不存在');
        s.角色[id]._管理.升格 = true;
      }),
    '升格请求已保存，等待变量额外 API 处理',
  );
}
function handleChatMessageAction(p: any) {
  execute(() => runtime!.messageAction(p.actionType, p.messageId, p.newContent));
}
async function handleSendMessage(content: string, done?: (saved: boolean) => void) {
  if (!runtime) {
    showToast('离线展示不提交行动');
    done?.(false);
    return;
  }
  try {
    await runtime.send(content, true, undefined, () => done?.(true));
  } catch (e) {
    showToast(String(e));
    done?.(false);
  }
}
function handleStopGeneration() {
  runtime?.stop();
}
function handleRetryUpdate() {
  execute(() => runtime!.retry());
}
let previousLow: Record<string, boolean> = runtime?.readAlertMemory() ?? {};
watch(
  () => state.value.玩家?.当前状态,
  () => {
    const check = lowStatus(previousLow, state.value);
    previousLow = check.next;
    if (check.alerts.length) showLowStatusAlert.value = true;
  },
);

function handleGlobalKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (toastMessage.value) {
      dismissToast();
      return;
    }
    if (showSystemDrawer.value) {
      showSystemDrawer.value = false;
      return;
    }
    if (showLowStatusAlert.value) {
      showLowStatusAlert.value = false;
      return;
    }
    if (itemToUse.value) {
      itemToUse.value = null;
      return;
    }
    if (activeModal.value) {
      closeModal();
    }
  }
}

const desktopRoot = ref<HTMLElement>();
let releaseModalFocus: (() => void) | undefined;
onMounted(() => {
  if (desktopRoot.value) releaseModalFocus = installModalFocus(desktopRoot.value);
  window.addEventListener('keydown', handleGlobalKeydown);
});

onBeforeUnmount(() => {
  releaseModalFocus?.();
  window.removeEventListener('keydown', handleGlobalKeydown);
});
</script>
<style scoped lang="scss">
.cw-desktop-shell {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--cw-bg-main);
  position: relative;
  overflow: hidden;
}

.cw-main-content {
  flex: 1;
  display: flex;
  position: relative;
  overflow: hidden;
  min-height: 0;
}

/* 电脑沿用原来的三项悬浮入口；窄屏改用输入框下方的导航。 */
.cw-left-floating-bar {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  left: 12px;
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: 10px;
  user-select: none;

  .cw-float-btn {
    display: flex;
    align-items: center;
    flex-direction: column;
    gap: 4px;
    width: 64px;
    padding: 9px 5px;
    border-radius: var(--cw-radius);
    background: var(--cw-bg-panel);
    backdrop-filter: var(--cw-glass-blur);
    border: 1px solid var(--cw-border);
    color: var(--cw-text-primary);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: var(--cw-shadow);
    transition: all 0.2s ease;

    &:hover {
      background: var(--cw-bg-surface);
      border-color: var(--cw-accent);
      color: var(--cw-accent);
      transform: translateX(4px);
      box-shadow: var(--cw-shadow-lg);
    }

    &:active {
      transform: translateX(2px);
    }
  }
}

.cw-scale-root {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

/* 中央正文包裹流 */
.cw-chat-wrapper {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}
.cw-floating-composer {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  width: min(640px, calc(100% - 176px));
  max-height: calc(100% - 16px);
  z-index: 35;
  border-radius: var(--cw-radius-lg);
  box-shadow: var(--cw-shadow-lg);
  background: var(--cw-bg-panel);
  backdrop-filter: var(--cw-glass-blur);
  border: 1px solid var(--cw-border);
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  box-sizing: border-box;
}

/* 输入框下方四项纯文字导航仅用于手机（无图标）。 */
.cw-bottom-text-nav {
  display: none;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 4px 10px 2px;
  border-top: 1px solid var(--cw-border-subtle, rgba(0, 0, 0, 0.05));
  user-select: none;
}

@media (min-width: 641px) {
  /* 保留电脑两侧入口的空间，不改正文按 composerHeight 计算的底部留白。 */
  .cw-chat-wrapper :deep(.cw-chat-scroll) {
    padding-left: 88px;
    padding-right: 88px;
  }
}

@media (max-width: 640px) {
  .cw-left-floating-bar,
  .cw-scale-root > .cw-desktop-phone-trigger {
    display: none;
  }

  .cw-floating-composer {
    width: min(640px, calc(100% - 16px));
  }

  .cw-bottom-text-nav {
    display: flex;
  }
}

.cw-text-nav-item {
  background: none;
  border: none;
  font-size: 13px;
  font-weight: 600;
  color: var(--cw-text-secondary);
  cursor: pointer;
  padding: 3px 8px;
  border-radius: var(--cw-radius-sm);
  transition: all 0.15s ease;

  &:hover {
    color: var(--cw-accent);
    background: var(--cw-accent-bg);
  }
}

.cw-nav-sep {
  color: var(--cw-border-hover);
  font-size: 11px;
  opacity: 0.5;
}

.cw-nav-phone-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.cw-unread-dot {
  min-width: 15px;
  height: 15px;
  padding: 0 4px;
  font-size: 10px;
  font-weight: 700;
  border-radius: 8px;
  background: var(--cw-danger);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

/* 覆盖态沿用同一个通知组件，不再显示重复的黑色浮层。 */
.cw-overlay-notification {
  position: fixed;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 15000;
  width: min(640px, calc(100% - 16px));
}

.cw-item-use-modal {
  width: 100%;
  max-width: 480px;
}
</style>
