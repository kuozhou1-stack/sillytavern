<template>
  <div class="cw-creation-fullscreen-view">
    <!-- 顶部状态与品牌栏 -->
    <header class="cw-creation-navbar">
      <div class="cw-navbar-brand">
        <div class="cw-brand-logo">
          <SvgIcon name="compass" :size="22" />
        </div>
        <div class="cw-brand-text">
          <h2 class="cw-brand-title">瓦洛兰 · 新市民建档向导</h2>
          <span class="cw-brand-sub">瓦洛兰 · 从您的第一份档案开始</span>
        </div>
      </div>
      <div class="cw-navbar-right">
        <span v-if="isDemonstration" class="cw-badge cw-badge-accent">离线演示模式</span>
        <button
          type="button"
          class="cw-btn cw-btn-ghost cw-btn-sm"
          :disabled="isSubmitting"
          title="提前配置接口与外观设置"
          @click="emit('openSettings')"
        >
          <SvgIcon name="settings" :size="16" /><span>设置</span>
        </button>
        <button v-if="canCancel" class="cw-btn cw-btn-ghost cw-btn-sm" :disabled="isSubmitting" @click="emit('cancel')">
          <SvgIcon name="close" :size="14" />
          <span>返回主视口</span>
        </button>
      </div>
    </header>

    <!-- 步骤导航条 -->
    <nav ref="stepsViewportRef" class="cw-creation-steps-bar">
      <div ref="stepsTrackRef" class="cw-steps-track">
        <div
          v-for="s in steps"
          :key="s.step"
          class="cw-step-nav-item"
          :class="{ active: currentStep === s.step, finished: currentStep > s.step }"
          @click="goToStep(s.step)"
        >
          <div class="cw-nav-num">
            <SvgIcon v-if="currentStep > s.step" name="check" :size="12" />
            <span v-else>{{ s.step }}</span>
          </div>
          <span class="cw-nav-label">{{ s.title }}</span>
        </div>
      </div>
    </nav>

    <!-- 解决 F29/F31：行内校验与错误反馈条，不依赖浏览器 alert -->
    <div v-if="stepError" class="cw-creation-error-banner" role="alert">
      <SvgIcon name="alertTriangle" :size="15" />
      <span class="cw-err-text">{{ stepError }}</span>
      <button class="cw-btn-close-err" @click="stepError = ''">
        <SvgIcon name="close" :size="13" />
      </button>
    </div>

    <!-- 主表单内容视口 -->
    <main ref="contentViewportRef" class="cw-creation-content-viewport">
      <div class="cw-creation-card-container" :inert="isSubmitting || undefined">
        <!-- 步骤 1：基本身份与户籍 -->
        <StepPlayerIdentity v-if="currentStep === 1" v-model="player" />

        <!-- 步骤 2：外貌身形 -->
        <StepPlayerAppearance v-if="currentStep === 2" v-model="player" />

        <!-- 步骤 3：职业与经历 -->
        <StepPlayerBackground v-if="currentStep === 3" v-model="player" />

        <!-- 步骤 4：居所状态、开局时空、资产与结构化随身物品 (解决 F27) -->
        <StepPlayerResidence
          v-if="currentStep === 4"
          v-model="player"
          :start-time="startTime"
          :weather="weather"
          :start-location="startLocation"
          :account-name="accountName"
          :balance="balance"
          :phone-name="phoneName"
          :starting-items="startingItems"
          :locations="state.地点"
          @update:start-time="startTime = $event"
          @update:weather="weather = $event"
          @update:start-location="startLocation = $event"
          @update:account-name="accountName = $event"
          @update:balance="balance = $event"
          @update:phone-name="phoneName = $event"
          @update:starting-items="startingItems = $event"
        />

        <!-- 步骤 5：初始角色与本地导入、相识依据与关系配置 (解决 F28) -->
        <KeepAlive>
        <StepInitialCharacters
          v-if="currentStep === 5"
          :initial-characters="initialCharacters"
          :relations="relations"
          @add-character="handleAddChar"
          @add-characters="handleAddChars"
          @remove-character="handleRemoveChar"
          @update:relations="Object.assign(relations, $event)"
        />
        </KeepAlive>

        <!-- 步骤 6：全貌复核与确认提交 (解决 F28) -->
        <StepCreationReview
          v-if="currentStep === 6"
          :player="player"
          :initial-characters="initialCharacters"
          :relations="relations"
          :start-time="startTime"
          :weather="weather"
          :start-location="startLocation"
          :account-name="accountName"
          :balance="balance"
          :phone-name="phoneName"
          :starting-items="startingItems"
          :locations="state.地点"
          :submit-error="submitError"
          @go-to-step="goToStep"
        />
      </div>
    </main>

    <p v-if="presetNotice" class="cw-creation-preset-notice" role="status">{{ presetNotice }}</p>
    <p v-if="draftWarning" class="cw-creation-error" role="alert">{{ draftWarning }}</p>
    <p v-if="submitError" class="cw-creation-error" role="alert">{{ submitError }}（已填写内容保留，可修正后重试）</p>

    <!-- 底部操作底栏 -->
    <footer
      class="cw-creation-footer"
      :class="{
        'has-preset-btn': !canCancel,
        'is-final-step': currentStep === steps.length,
      }"
    >
      <div v-if="!canCancel" class="cw-footer-left">
        <button
          type="button"
          class="cw-btn cw-btn-secondary cw-btn-sm cw-preset-button"
          :disabled="!hasLastPreset || isSubmitting"
          :title="hasLastPreset ? '填入上次成功建档的表单内容，可继续在此基础上修改' : '暂无历史建档，首次成功建档后即可一键复用'"
          @click="fillLastCreation"
        >
          <SvgIcon name="rotateCcw" :size="14" />
          <span>一键填入上次建档</span>
        </button>
        <span class="cw-step-indicator-text"
          >当前进度：第 {{ currentStep }} / {{ steps.length }} 步 · {{ steps[currentStep - 1].title }}</span
        >
      </div>
      <div v-else class="cw-footer-left is-indicator-only">
        <span class="cw-step-indicator-text"
          >当前进度：第 {{ currentStep }} / {{ steps.length }} 步 · {{ steps[currentStep - 1].title }}</span
        >
      </div>
      <div class="cw-footer-actions">
        <button
          v-if="currentStep > 1"
          type="button"
          class="cw-btn cw-btn-ghost cw-btn-nav cw-btn-prev"
          :disabled="isSubmitting"
          @click="currentStep--"
        >
          <SvgIcon name="chevronLeft" :size="16" />
          <span>上一步</span>
        </button>

        <button
          v-if="currentStep < steps.length"
          type="button"
          class="cw-btn cw-btn-primary cw-btn-nav cw-btn-next"
          @click="handleNextStep"
        >
          <span>下一步</span>
          <SvgIcon name="chevronRight" :size="16" />
        </button>

        <button
          v-else
          type="button"
          class="cw-btn cw-btn-primary cw-btn-submit"
          :disabled="isSubmitting"
          @click="handleFinalSubmit"
        >
          <SvgIcon v-if="isSubmitting" name="refreshCw" :size="16" class="cw-spin" />
          <SvgIcon v-else name="send" :size="16" />
          <span>{{ isSubmitting ? '正在保存档案...' : '保存建档 · 开始瓦罗兰生活' }}</span>
        </button>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, nextTick, shallowRef, markRaw, onMounted, onScopeDispose } from 'vue';
import { copy, uid } from '../../../../运行/core';
import { useWorldState } from '../../utils/context';
import { readCreationPreset, saveCreationPreset, type CreationPreset } from '../../utils/creation-preset';
const state = useWorldState();
import SvgIcon from '../icons/SvgIcon.vue';
import StepPlayerIdentity from './StepPlayerIdentity.vue';
import StepPlayerAppearance from './StepPlayerAppearance.vue';
import StepPlayerBackground from './StepPlayerBackground.vue';
import StepPlayerResidence from './StepPlayerResidence.vue';
import StepInitialCharacters from './StepInitialCharacters.vue';
import StepCreationReview from './StepCreationReview.vue';

const props = defineProps<{
  submit: (payload: any) => Promise<void>;
  draftKey?: string;
  initialProfile?: any;
  initialCharactersList?: any[];
  canCancel?: boolean;
  isDemonstration?: boolean;
}>();

const emit = defineEmits<{
  (e: 'finish', payload: { player: any; characters: any[]; details?: any }): void;
  (e: 'cancel'): void;
  (e: 'openSettings'): void;
}>();

const currentStep = ref(1);
const isSubmitting = ref(false);
const submitError = ref('');
const stepError = ref('');

const startTime = ref('');
const weather = ref('');
const startLocation = ref('');
const accountName = ref('');
const balance = ref<string | number>('');
const phoneName = ref('');

interface StartingItem {
  id: string;
  名称: string;
  类别: string;
  数量: number | null;
  单位: string;
}

const startingItems = ref<StartingItem[]>([
  { id: 'item_1', 名称: '智能手机', 类别: '日常数码', 数量: 1, 单位: '部' },
  { id: 'item_2', 名称: '随身钥匙串', 类别: '生活随身', 数量: 1, 单位: '串' },
]);

const relations = reactive<Record<string, any>>({});

const steps = [
  { step: 1, title: '基本信息' },
  { step: 2, title: '外貌身形' },
  { step: 3, title: '生平背景' },
  { step: 4, title: '居所状态' },
  { step: 5, title: '初始角色' },
  { step: 6, title: '复核发送' },
];

// 身份与经历由玩家填写；初始身体状态默认充足。
const player = ref({
  姓名: '',
  称呼: '',
  性别: '',
  种族: '',
  年龄: null as number | null,
  身高: null as number | null,
  体重: null as number | null,
  体型: '',
  面容: '',
  发型: '',
  显著特征: '',
  整体外貌描述: '',
  身份: '',
  成长背景: '',
  家庭背景: '',
  重要过往: '',
  当前生活背景: '',
  片区id: '',
  住处描述: '',
  饱食度: 100,
  水分值: 100,
  体力值: 100,
});

// 导入档案是只读原文；替换名单时更新，避免每次编辑玩家表单遍历 171 份深层档案。
const initialCharacters = shallowRef<any[]>(markRaw([]));

// Prefill once; reactive host snapshots must not overwrite unsaved input.
if (props.initialProfile) Object.assign(player.value, Object.fromEntries(
  Object.entries(copy(props.initialProfile)).filter(([key]) => Object.hasOwn(player.value, key)),
));
if (props.initialCharactersList) initialCharacters.value = copy(props.initialCharactersList);
const submissionId = ref(uid('creation'));
const draftWarning = ref('');
const presetNotice = ref('');
const hasLastPreset = ref(false);
try {
  hasLastPreset.value = !!readCreationPreset();
} catch (e) {
  draftWarning.value = '无法读取上次建档记录：' + String(e);
}

const draftRefs = {
  currentStep,
  startTime,
  weather,
  startLocation,
  accountName,
  balance,
  phoneName,
  startingItems,
  initialCharacters,
  submissionId,
};

try {
  const raw = props.draftKey && window.parent.sessionStorage.getItem(props.draftKey);
  if (raw) {
    const saved = JSON.parse(raw);
    if (saved.version !== 1 || !saved.player || !saved.fields) throw Error('草稿格式不兼容');
    // 只恢复当前表单字段；旧草稿身份值迁移后不再保留废弃键。
    if (!Object.hasOwn(saved.player, '身份') && Object.hasOwn(saved.player, '当前职业'))
      player.value.身份 = saved.player.当前职业;
    Object.assign(player.value, Object.fromEntries(
      Object.entries(saved.player).filter(([key]) => Object.hasOwn(player.value, key)),
    ));
    Object.assign(relations, saved.relations ?? {});
    for (const [key, target] of Object.entries(draftRefs)) {
      if (Object.hasOwn(saved.fields, key)) target.value = saved.fields[key];
    }
    // 兼容旧版 items 文本格式
    if (
      typeof (saved.fields as any).items === 'string' &&
      (!saved.fields.startingItems || !saved.fields.startingItems.length)
    ) {
      startingItems.value = (saved.fields as any).items
        .split('\n')
        .filter((l: string) => l.trim())
        .map((line: string, i: number) => {
          const [名称, 类别, 数量, 单位] = line.split('|').map((s: string) => s.trim());
          return { id: 'legacy_' + i, 名称, 类别: 类别 || '', 数量: 数量 ? Number(数量) : null, 单位: 单位 || '' };
        });
    }
  }
} catch (e) {
  draftWarning.value = '无法恢复浏览器建档草稿：' + String(e);
}

for (const key of ['饱食度', '水分值', '体力值'] as const) player.value[key] ??= 100;
markRaw(initialCharacters.value);

// Discard relationship rows left behind by removed characters in older drafts.
const restoredCharacterIds = new Set(initialCharacters.value.map(character => character.id));
for (const id of Object.keys(relations)) if (!restoredCharacterIds.has(id)) delete relations[id];

let completed = false;
const creationWindow = window;
function saveDraft() {
    if (!props.draftKey || completed) return;
    try {
      creationWindow.parent.sessionStorage.setItem(
        props.draftKey,
        JSON.stringify({
          version: 1,
          player: player.value,
          relations,
          fields: Object.fromEntries(Object.entries(draftRefs).map(([key, value]) => [key, value.value])),
        }),
      );
    } catch (e) {
      draftWarning.value = '浏览器未能暂存草稿，请暂勿关闭页面：' + String(e);
    }
}
watch([player, relations, ...Object.values(draftRefs)], saveDraft, { deep: true, flush: 'post' });
onScopeDispose(() => {
  saveDraft();
  creationWindow.removeEventListener?.('pagehide', saveDraft);
});

const contentViewportRef = ref<HTMLElement | null>(null);
const stepsViewportRef = ref<HTMLElement | null>(null);
const stepsTrackRef = ref<HTMLElement | null>(null);

function scrollActiveStepIntoView(smooth = true) {
  nextTick(() => {
    const viewport = stepsViewportRef.value;
    const activeNav = stepsTrackRef.value?.querySelector('.cw-step-nav-item.active') as HTMLElement | null;
    if (!viewport || !activeNav || viewport.clientWidth <= 0 || viewport.scrollWidth <= viewport.clientWidth) return;

    // 只滚动步骤栏。scrollIntoView 会沿祖先链移动 iframe/宿主，导致每次换步整页偏移。
    const bounds = viewport.getBoundingClientRect();
    const scale = viewport.offsetWidth > 0 ? bounds.width / viewport.offsetWidth : 1;
    if (scale <= 0) return;
    const left = bounds.left + viewport.clientLeft * scale;
    const right = left + viewport.clientWidth * scale;
    const active = activeNav.getBoundingClientRect();
    if (active.left >= left && active.right <= right) return;
    const target = viewport.scrollLeft + (active.left + active.right - left - right) / (2 * scale);
    viewport.scrollTo({
      left: Math.max(0, Math.min(viewport.scrollWidth - viewport.clientWidth, target)),
      behavior: smooth ? 'smooth' : 'auto',
    });
  });
}

function scrollToTopAndActiveStep() {
  nextTick(() => {
    if (contentViewportRef.value) {
      contentViewportRef.value.scrollTo({ top: 0, behavior: 'smooth' });
    }
    scrollActiveStepIntoView(true);
  });
}
watch(currentStep, scrollToTopAndActiveStep);

onMounted(() => {
  creationWindow.addEventListener('pagehide', saveDraft);
  scrollActiveStepIntoView(false);
});

function goToStep(s: number) {
  if (isSubmitting.value) return;
  stepError.value = '';
  // 校验跳步前必填的第一步信息
  if (s > 1) {
    if (!player.value.姓名.trim()) {
      stepError.value = '请先填写第一步的角色姓名！';
      currentStep.value = 1;
      return;
    }
    if (!player.value.性别) {
      stepError.value = '请先选择第一步的角色性别！';
      currentStep.value = 1;
      return;
    }
  }
  currentStep.value = s;
}

function handleNextStep() {
  submitError.value = '';
  stepError.value = '';
  if (currentStep.value === 1) {
    if (!player.value.姓名.trim()) {
      stepError.value = '请填写玩家角色姓名！';
      return;
    }
    if (!player.value.性别) {
      stepError.value = '请选择性别！';
      return;
    }
  }
  if (currentStep.value < steps.length) {
    currentStep.value++;
  }
}

function handleAddChar(char: any) {
  const index = initialCharacters.value.findIndex(c => c.id === char.id);
  const next = [...initialCharacters.value];
  if (index >= 0) next[index] = char;
  else next.push(char);
  initialCharacters.value = markRaw(next);
}

function handleAddChars(chars: any[]) {
  const merged = new Map(initialCharacters.value.map(character => [character.id, character]));
  for (const character of chars) merged.set(character.id, character);
  initialCharacters.value = markRaw([...merged.values()]);
}

function handleRemoveChar(idx: number) {
  const removed = initialCharacters.value[idx];
  initialCharacters.value = markRaw(initialCharacters.value.filter((_, index) => index !== idx));
  if (removed?.id && !initialCharacters.value.some(character => character.id === removed.id))
    delete relations[removed.id];
}

function fillLastCreation() {
  try {
    const saved = readCreationPreset();
    if (!saved) {
      hasLastPreset.value = false;
      return;
    }
    // Replace the model so every mounted step receives the restored profile.
    // Mutating a shared object leaves useVModel's cloned draft on the old identity.
    player.value = {
      ...player.value,
      ...Object.fromEntries(
        Object.keys(player.value)
          .filter(key => Object.hasOwn(saved.player, key))
          .map(key => [key, copy(saved.player[key])]),
      ),
    };
    for (const key of ['饱食度', '水分值', '体力值'] as const) player.value[key] ??= 100;
    startTime.value = saved.fields.startTime;
    weather.value = saved.fields.weather;
    startLocation.value = saved.fields.startLocation;
    accountName.value = saved.fields.accountName;
    balance.value = saved.fields.balance;
    phoneName.value = saved.fields.phoneName;
    startingItems.value = copy(saved.fields.startingItems);
    initialCharacters.value = markRaw(copy(saved.fields.initialCharacters));
    for (const id of Object.keys(relations)) delete relations[id];
    for (const character of initialCharacters.value) {
      const id = character?.id;
      if (typeof id === 'string' && id !== '__proto__' && Object.hasOwn(saved.relations, id))
        relations[id] = copy(saved.relations[id]);
    }
    submissionId.value = uid('creation');
    currentStep.value = 1;
    stepError.value = '';
    submitError.value = '';
    presetNotice.value = '已填入上次成功建档的内容，请核对后再提交。';
  } catch (e) {
    draftWarning.value = '无法填入上次建档记录：' + String(e);
  }
}

async function handleFinalSubmit() {
  if (isSubmitting.value) return;
  submitError.value = '';
  stepError.value = '';

  if (!player.value.姓名.trim()) {
    submitError.value = '档案缺少核心姓名，请返回第一步补齐。';
    currentStep.value = 1;
    return;
  }
  if (!player.value.性别) {
    submitError.value = '档案缺少性别，请返回第一步补齐。';
    currentStep.value = 1;
    return;
  }

  isSubmitting.value = true;

  try {
    const details: any = {
      世界: { 天气: { 天气状况: weather.value || null } },
      玩家: { 当前状态: { 当前地点id: startLocation.value || null } },
    };
    if (startTime.value) {
      const [date, time] = startTime.value.split('T'),
        [年, 月, 日] = date.split('-').map(Number),
        [时, 分] = time.split(':').map(Number);
      details.世界.当前时间 = { 年, 月, 日, 时, 分 };
    }
    if (balance.value !== '' && balance.value != null && !/^-?\d+(\.\d{1,2})?$/.test(String(balance.value))) {
      throw Error('初始余额请填写至多两位小数的金币金额');
    }
    details.玩家.资金 = {
      余额分: balance.value === '' || balance.value == null ? null : Math.round(Number(balance.value) * 100),
    };

    // 结构化物品转为字典 (解决 F27)
    details.玩家.物品栏 = Object.fromEntries(
      startingItems.value
        .filter(it => it && it.名称 && it.名称.trim())
        .map((it, i) => [
          'initial_' + i,
          {
            名称: it.名称.trim(),
            类别: it.类别 ? it.类别.trim() : null,
            数量: it.数量 != null ? Number(it.数量) : null,
            单位: it.单位 ? it.单位.trim() : null,
          },
        ]),
    );

    details.初始关系 = relations;
    details.邻信账号名 = phoneName.value.trim();

    const reusablePreset: CreationPreset = {
      version: 1,
      player: copy(player.value),
      relations: copy(relations),
      fields: {
        startTime: startTime.value,
        weather: weather.value,
        startLocation: startLocation.value,
        accountName: accountName.value,
        balance: balance.value,
        phoneName: phoneName.value,
        startingItems: copy(startingItems.value),
        initialCharacters: copy(initialCharacters.value),
      },
    };
    await props.submit({
      submissionId: submissionId.value,
      player: copy(reusablePreset.player),
      characters: copy(reusablePreset.fields.initialCharacters),
      details: copy(details),
    });

    completed = true;
    if (!props.isDemonstration) {
      try {
        saveCreationPreset(reusablePreset);
        hasLastPreset.value = true;
      } catch (e) {
        console.warn('[瓦洛兰] 建档成功，但上次建档记录未能保存', e);
      }
    }
    if (props.draftKey) {
      try {
        window.parent.sessionStorage.removeItem(props.draftKey);
      } catch {
        /* The saved profile is authoritative. */
      }
    }
  } catch (e) {
    submitError.value = String(e);
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<style scoped lang="scss">
.cw-creation-error {
  flex-shrink: 0;
  margin: 0;
  padding: 8px 20px;
  max-height: 100px;
  overflow: auto;
  white-space: pre-wrap;
  color: var(--cw-danger);
  border: 1px solid var(--cw-danger);
  background: var(--cw-bg-surface);
}

.cw-creation-preset-notice {
  margin: 0;
  padding: 8px 20px;
  color: var(--cw-accent);
  background: var(--cw-accent-bg);
  border-top: 1px solid var(--cw-accent-border);
  font-size: 13px;
}

.cw-preset-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  font-weight: 500;
  border: 1px solid var(--cw-border);
  background: var(--cw-bg-card);
  color: var(--cw-text-primary);
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    background: var(--cw-accent-bg);
    border-color: var(--cw-accent);
    color: var(--cw-accent);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    background: transparent;
    border-color: var(--cw-border-subtle, var(--cw-border));
  }
}

.cw-creation-error-banner {
  padding: 10px 24px;
  background: rgba(192, 57, 43, 0.12);
  border-bottom: 1px solid rgba(192, 57, 43, 0.3);
  color: var(--cw-danger);
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  flex-shrink: 0;
  animation: cwShake 0.3s ease-in-out;

  .cw-err-text {
    flex: 1;
    font-weight: 500;
  }

  .cw-btn-close-err {
    background: none;
    border: none;
    color: var(--cw-danger);
    cursor: pointer;
    padding: 2px;
    display: flex;
  }
}

.cw-creation-fullscreen-view {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--cw-bg-main);
  position: relative;
  overflow: hidden;
  container-type: inline-size;
  container-name: creation-view;
}

.cw-creation-navbar {
  min-height: 60px;
  height: auto;
  background: var(--cw-bg-surface);
  border-bottom: 1px solid var(--cw-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 14px;
  padding: 8px 28px;
  flex-shrink: 0;
  box-sizing: border-box;

  .cw-navbar-brand {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    flex: 1 1 200px;

    .cw-brand-logo {
      flex-shrink: 0;
      width: 36px;
      height: 36px;
      border-radius: var(--cw-radius);
      background: var(--cw-accent-bg);
      border: 1px solid var(--cw-accent-border);
      color: var(--cw-accent);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .cw-brand-text {
      min-width: 0;
      flex: 1;
    }

    .cw-brand-title {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      color: var(--cw-text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cw-brand-sub {
      font-size: 12px;
      color: var(--cw-text-secondary);
      display: block;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  .cw-navbar-right {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
    margin-left: auto;

    .cw-btn,
    .cw-badge {
      white-space: nowrap;
      flex-shrink: 0;
    }
  }
}

.cw-creation-steps-bar {
  background: var(--cw-bg-surface);
  border-bottom: 1px solid var(--cw-border);
  padding: 12px 28px;
  flex-shrink: 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  &::-webkit-scrollbar {
    display: none;
  }
  scrollbar-width: none;

  .cw-steps-track {
    display: flex;
    align-items: center;
    justify-content: space-between;
    max-width: 800px;
    min-width: 520px;
    margin: 0 auto;
    position: relative;
  }

  .cw-step-nav-item {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    user-select: none;
    transition: all 0.2s;
    white-space: nowrap;

    .cw-nav-num {
      width: 26px;
      height: 26px;
      border-radius: var(--cw-radius-full);
      border: 1px solid var(--cw-border);
      background: var(--cw-bg-card-subtle);
      color: var(--cw-text-secondary);
      font-size: 12px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }

    .cw-nav-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--cw-text-secondary);
    }

    &.active {
      .cw-nav-num {
        background: var(--cw-accent);
        border-color: var(--cw-accent);
        color: var(--cw-text-inverse);
      }
      .cw-nav-label {
        color: var(--cw-text-primary);
        font-weight: 700;
      }
    }

    &.finished {
      .cw-nav-num {
        background: var(--cw-accent-bg);
        border-color: var(--cw-accent);
        color: var(--cw-accent);
      }
      .cw-nav-label {
        color: var(--cw-text-secondary);
      }
    }
  }
}

.cw-creation-content-viewport {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 24px 28px;
  display: flex;
  justify-content: center;

  .cw-creation-card-container {
    width: 100%;
    max-width: 820px;
    min-width: 0;
  }
}

.cw-creation-footer {
  min-height: 60px;
  height: auto;
  background: var(--cw-bg-surface);
  border-top: 1px solid var(--cw-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px 16px;
  padding: 10px 28px;
  flex-shrink: 0;
  box-sizing: border-box;

  .cw-footer-left {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    min-width: 0;
  }

  .cw-step-indicator-text {
    font-size: 12px;
    color: var(--cw-text-muted);
    white-space: nowrap;
  }

  .cw-footer-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-left: auto;

    .cw-btn-nav {
      white-space: nowrap;
      flex-shrink: 0;
    }

    .cw-btn-submit {
      white-space: nowrap;
    }
  }
}

@mixin creation-narrow-layout {
  .cw-creation-navbar {
    padding: 8px 12px;
    min-height: 44px;
    height: auto;
    gap: 6px 8px;

    .cw-navbar-brand {
      gap: 8px;
      flex: 1 1 140px;
    }
    .cw-brand-logo {
      width: 28px;
      height: 28px;
    }
    .cw-brand-title {
      font-size: 14px;
    }
    .cw-brand-sub {
      display: none;
    }
    .cw-navbar-right {
      gap: 6px;
      .cw-btn {
        padding: 4px 9px;
        min-height: 30px;
        height: auto;
        font-size: 12px;
        white-space: nowrap;
      }
      .cw-badge {
        font-size: 11px;
        padding: 2px 6px;
      }
    }
  }

  .cw-creation-steps-bar {
    padding: 8px 12px;
    .cw-steps-track {
      min-width: max-content;
      gap: 14px;
    }
  }

  .cw-creation-content-viewport {
    padding: 14px 12px;
  }

  .cw-creation-footer {
    padding: 10px 12px;
    min-height: 50px;
    height: auto;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;

    .cw-footer-left.is-indicator-only {
      display: none;
    }

    .cw-footer-left {
      width: 100%;
      justify-content: space-between;
      flex-wrap: nowrap;
      gap: 8px;

      .cw-preset-button {
        padding: 5px 10px;
        min-height: 32px;
        height: auto;
        font-size: 12px;
        flex-shrink: 0;
      }

      .cw-step-indicator-text {
        font-size: 11.5px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-align: right;
        flex: 1;
        min-width: 0;
      }
    }

    .cw-footer-actions {
      width: 100%;
      margin-left: 0;
      display: flex;
      align-items: stretch;
      justify-content: flex-end;
      gap: 8px;

      .cw-btn {
        min-height: 36px;
        height: auto;
        padding: 6px 12px;
        font-size: 13px;
        box-sizing: border-box;
      }

      .cw-btn-nav {
        white-space: nowrap;
        flex-shrink: 0;
      }

      .cw-btn-prev {
        flex: 0 0 auto;
        min-width: 86px;
      }

      .cw-btn-next {
        flex: 1 1 auto;
      }

      .cw-btn-submit {
        flex: 1 1 auto;
        min-width: 0;
        white-space: normal;
        text-align: center;
        line-height: 1.35;
      }
    }
  }
}

@container creation-view (max-width: 620px) {
  @include creation-narrow-layout;
}

@media (max-width: 640px) {
  @include creation-narrow-layout;
}

@keyframes cwShake {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-4px);
  }
  75% {
    transform: translateX(4px);
  }
}
</style>
