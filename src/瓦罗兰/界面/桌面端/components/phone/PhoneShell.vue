<template>
  <div class="cw-modal-backdrop" @click.self="emit('close')">
    <div class="cw-phone-frame cw-gameplay-panel" @click.stop>
      <!-- 手机听筒与前置传感器/灵动岛 -->
      <div class="cw-phone-notch-bar">
        <span class="cw-notch-time">{{ statusTime }}</span>
        <button
          v-if="hasTasks"
          class="cw-notch-island cw-task-pill"
          :class="{ 'has-error': runtime?.view.error }"
          :aria-expanded="showTasks"
          aria-label="查看当前任务与恢复操作"
          @click="showTasks = !showTasks"
        >
          <SvgIcon
            :name="runtime?.view.error ? 'alertCircle' : taskBusy ? 'refresh' : 'clock'"
            :size="11"
            :class="{ 'cw-task-spin': taskBusy }"
          />
          <span role="status">{{ runtime?.view.error ? '待处理' : taskBusy ? '处理中' : '任务' }}</span>
        </button>
        <div v-else class="cw-notch-island">
          <div class="cw-camera-lens"></div>
        </div>
        <div class="cw-notch-icons">
          <span class="cw-notch-icon">5G</span>
          <span class="cw-notch-icon">100%</span>
        </div>
      </div>

      <!-- 手机屏幕可视内容容器 -->
      <div class="cw-phone-screen">
        <section v-if="showTasks && hasTasks" class="cw-phone-task-panel" aria-label="当前任务">
          <div class="cw-task-heading">
            <strong>当前任务</strong
            ><button class="cw-btn cw-btn-ghost cw-btn-xs" @click="showTasks = false">收起</button>
          </div>
          <p v-if="taskBusy" role="status">
            {{ runtime?.view.operation === 'phone' ? '正在处理手机操作…' : '正在处理当前操作…' }}
          </p>
          <p v-if="runtime?.view.error" class="cw-task-error" role="alert">{{ runtime.view.error }}</p>
          <div class="cw-task-actions">
            <button v-if="taskBusy" class="cw-btn cw-btn-sm" @click="runtime?.stop()">停止</button>
            <template v-else-if="runtime?.view.error">
              <button class="cw-btn cw-btn-primary cw-btn-sm" @click="retry">重试</button>
              <button class="cw-btn cw-btn-sm" @click="discard">取消待处理请求</button>
            </template>
          </div>
          <QueueStatus scope="phone" />
        </section>
        <PhoneHome
          v-if="currentScreen === 'home'"
          :world-time="worldTime"
          :linxin-unread="unread('邻信')"
          :weilan-unread="unread('微澜')"
          @open-app="handleOpenApp"
        />
        <LinxinApp
          v-else-if="currentScreen === 'linxin'"
          :player="player"
          :phone-data="phoneData"
          @back="handleAppBack"
          @navigate="navigate"
        />
        <WeilanApp
          v-else-if="currentScreen === 'weilan'"
          :player="player"
          :phone-data="phoneData"
          @back="handleAppBack"
        />
        <MapApp
          v-else-if="currentScreen === 'map'"
          :world="world"
          :focus-location="mediaTarget.id"
          @back="handleAppBack"
          @action-feedback="msg => emit('feedback', msg)"
        />
        <PhoneSettingsApp
          v-else-if="currentScreen === 'settings'"
          @back="handleAppBack"
          @feedback="msg => emit('feedback', msg)"
        />
        <PhoneMediaView v-else-if="currentScreen === 'detail'" :target="mediaTarget" @back="handleAppBack" />
      </div>

      <!-- 手机底部指示条 (Home bar)：应用内点击返回手机主页；主页状态下点击亦可关闭手机返回正文 -->
      <button
        type="button"
        class="cw-phone-home-indicator"
        :class="{ 'is-home-screen': currentScreen === 'home' }"
        :title="currentScreen === 'home' ? '关闭手机，返回正文' : '返回手机主页'"
        :aria-label="currentScreen === 'home' ? '关闭手机，返回正文' : '返回手机主页'"
        @click="currentScreen === 'home' ? emit('close') : handleGoHome()"
      >
        <span class="cw-home-bar" aria-hidden="true"></span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, onMounted, onUnmounted } from 'vue';
import { RuntimeKey, type Runtime } from '../../../../运行/host';
import { phoneNotificationPlatform } from '../../../../运行/phone';
import QueueStatus from '../shared/QueueStatus.vue';
import PhoneMediaView from './PhoneMediaView.vue';
import PhoneHome from './PhoneHome.vue';
import LinxinApp from './apps/LinxinApp.vue';
import WeilanApp from './apps/WeilanApp.vue';
import MapApp from './apps/MapApp.vue';
import PhoneSettingsApp from './apps/PhoneSettingsApp.vue';
import SvgIcon from '../icons/SvgIcon.vue';

const runtime = inject<Runtime | null>(RuntimeKey, null);
const showTasks = ref(false);
const taskBusy = computed(() => !!(runtime?.view.busy || runtime?.view.updating));
const hasTasks = computed(
  () =>
    taskBusy.value ||
    !!runtime?.view.error ||
    !!runtime?.view.queued?.some(i => i.kind === 'phone') ||
    !!runtime?.view.recoverable?.some(i => i.kind === 'phone'),
);

async function retry() {
  try {
    await runtime?.retry();
  } catch (e) {
    emit('feedback', String(e));
  }
}

async function discard() {
  try {
    await runtime?.discardPending();
  } catch (e) {
    emit('feedback', String(e));
  }
}

const unread = (platform: string) =>
  Object.values(props.phoneData?._通知 ?? {}).filter(
    (n: any) => !n.已读 && phoneNotificationPlatform({ 手机: props.phoneData }, n) === platform,
  ).length;

const mediaTarget = ref({ type: '', id: '' });

function navigate(target: { type: string; id: string }) {
  mediaTarget.value = target;
  if (target.type === '地点') {
    handleOpenApp('map');
  } else {
    handleOpenApp('detail' as any);
  }
}

const props = defineProps<{
  world: any;
  player: any;
  phoneData?: any;
  worldTime?: any;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'feedback', msg: string): void;
}>();

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close');
  }
}
onMounted(() => window.addEventListener('keydown', handleKeydown));
onUnmounted(() => window.removeEventListener('keydown', handleKeydown));

const currentScreen = ref<'home' | 'linxin' | 'weilan' | 'map' | 'settings' | 'detail'>('home');
const screenHistory = ref<string[]>(['home']);

const statusTime = computed(() => {
  const t = props.worldTime;
  if (!t || typeof t.时 !== 'number') return '--:--';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(t.时)}:${pad(t.分)}`;
});

function handleOpenApp(appName: 'home' | 'linxin' | 'weilan' | 'map' | 'settings' | 'detail') {
  if (currentScreen.value !== appName) {
    screenHistory.value.push(appName);
    currentScreen.value = appName;
  }
}

function handleGoHome() {
  currentScreen.value = 'home';
  screenHistory.value = ['home'];
}

function handleAppBack() {
  if (screenHistory.value.length > 1) {
    screenHistory.value.pop();
    currentScreen.value = screenHistory.value[screenHistory.value.length - 1] as any;
  } else {
    currentScreen.value = 'home';
  }
}
</script>

<style scoped lang="scss">
.cw-phone-notch-bar .cw-task-pill {
  width: auto;
  min-width: 78px;
  height: 20px;
  justify-content: center;
  padding: 0 6px;
  gap: 5px;
  color: #fff;
  border: none;
  cursor: pointer;
  font: inherit;
  font-size: 10px;
  line-height: 1;
  white-space: nowrap;
}
.cw-task-pill :deep(svg) {
  flex-shrink: 0;
}
.cw-phone-notch-bar .cw-task-pill.has-error {
  color: #ffd49c;
}
.cw-phone-task-panel {
  position: absolute;
  z-index: 70;
  top: 8px;
  left: 8px;
  right: 8px;
  max-height: calc(100% - 16px);
  overflow-y: auto;
  padding: 12px;
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius);
  box-shadow: var(--cw-shadow-modal);
  color: var(--cw-text-primary);
  background: var(--cw-bg-surface);
  font-size: 12px;
}
.cw-task-heading,
.cw-task-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.cw-task-error {
  max-height: 120px;
  overflow-y: auto;
  overflow-wrap: anywhere;
  color: var(--cw-danger);
}
.cw-task-spin {
  animation: cwTaskSpin 1.4s linear infinite;
}
@keyframes cwTaskSpin {
  to {
    transform: rotate(360deg);
  }
}
.cw-phone-frame {
  width: 450px;
  max-width: min(450px, calc(100vw - 32px), 94%);
  height: 740px;
  /* 关键：绝对受实际可用容器高度约束，留出上下各 16px 安全间距，防止任何缩放下溢出窗口 */
  max-height: calc(100% - 32px);
  background: #1e1e24;
  border-radius: 46px;
  border: 10px solid #2d2d38;
  box-shadow:
    0 25px 60px rgba(0, 0, 0, 0.45),
    0 0 0 1px rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  user-select: none;
  animation: cwZoomIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.cw-phone-notch-bar {
  height: 38px;
  flex-shrink: 0;
  background: var(--cw-bg-surface);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  font-size: 12px;
  font-weight: 600;
  color: var(--cw-text-primary);
  border-bottom: 1px solid var(--cw-border);
  z-index: 50;

  .cw-notch-island {
    width: 86px;
    height: 20px;
    background: #000;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-right: 8px;

    .cw-camera-lens {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #111;
      border: 1px solid #333;
    }
  }

  .cw-notch-icons {
    display: flex;
    gap: 6px;
    font-size: 11px;
    font-family: monospace, sans-serif;
  }
}

.cw-phone-screen {
  flex: 1;
  min-height: 0; /* 关键：允许内部 app 自由滚动，同时整体不撑爆机身 */
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  background: var(--cw-bg-main);
}

.cw-phone-home-indicator {
  width: 100%;
  height: 24px;
  padding: 0;
  border: 0;
  appearance: none;
  flex-shrink: 0;
  background: var(--cw-bg-surface);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  cursor: pointer;

  .cw-home-bar {
    width: 120px;
    height: 4px;
    background: var(--cw-border-hover);
    border-radius: 2px;
    transition: background 0.15s;
  }

  &:hover .cw-home-bar {
    background: var(--cw-text-secondary);
  }

  &.is-home-screen:hover .cw-home-bar {
    background: var(--cw-accent);
  }

  &:focus-visible {
    outline: 2px solid var(--cw-accent);
    outline-offset: -2px;
  }
}

@media (max-width: 640px) {
  .cw-phone-notch-bar {
    height: 32px;
    padding: 0 10px;

    .cw-notch-island {
      width: 50px;
      height: 16px;
    }
  }

  .cw-phone-home-indicator {
    height: 20px;
    .cw-home-bar {
      width: 70px;
      height: 3px;
    }
  }
}
</style>
