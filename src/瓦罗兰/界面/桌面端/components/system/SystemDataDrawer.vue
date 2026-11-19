<template>
  <div class="cw-drawer-backdrop" @click.self="emit('close')">
    <div class="cw-system-drawer">
      <div class="cw-drawer-header">
        <strong><SvgIcon name="terminal" :size="18" /> 系统状态与存档检查</strong>
        <button class="cw-btn cw-btn-ghost cw-btn-xs" aria-label="关闭系统状态" @click="emit('close')"><SvgIcon name="close" :size="16" /></button>
      </div>
      <div class="cw-drawer-body">
        <p class="cw-pane-desc">查看当前处理进度、人物更新和保存结果。此面板只展示状态，重试待办会随下一次正文或手机互动处理。</p>
        <section class="cw-sys-card">
          <h4>当前状态</h4>
          <div class="cw-sys-grid">
            <div><span>玩家建档</span><b>{{ system.建档完成 ? '已完成' : '尚未建档' }}</b></div>
            <div><span>运行状态</span><b>{{ activity }}</b></div>
            <div><span>数据版本</span><b>第 {{ system.数据版本 }} 版</b></div>
            <div><span>当前阅读位置</span><b>{{ floorLabel }}</b></div>
            <div><span>本窗口权限</span><b>{{ runtime ? runtime.view.readOnly ? '只读' : '可以保存' : '离线展示' }}</b></div>
            <div><span>生活检查间隔</span><b>{{ system.默认更新阈值 }} 轮互动</b></div>
            <div><span>开启人物</span><b>{{ activeCount }} 人</b></div>
            <div><span>待机或停用人物</span><b>{{ Object.keys(system.角色停用标识).length }} 人</b></div>
          </div>
          <p v-if="runtime?.view.error" class="cw-task-error" role="alert">{{ runtime.view.error }}</p>
        </section>
        <QueueStatus scope="story" :compact="!runtime?.view.recoverable.some(item => item.kind === 'story')" />
        <section class="cw-sys-card">
          <h4>待处理更新 · {{ pendingTasks.length }} 项</h4>
          <p v-if="!pendingTasks.length" class="cw-pane-desc">目前没有等待处理的人物或历史更新。</p>
          <article v-for="task in pendingTasks" :key="task.id" class="cw-task-item">
            <div class="cw-task-top"><strong>{{ task.title }}</strong><span class="cw-badge">{{ task.status }}</span></div>
            <span v-if="task.targets">人物：{{ task.targets }}</span>
            <small v-if="task.note" class="cw-pane-desc">{{ task.note }}</small>
            <p v-if="task.error" class="cw-task-error" role="alert">{{ task.error }}</p>
          </article>
          <button class="cw-btn" :disabled="!runtime || runtime.view.readOnly || runtime.view.busy || runtime.view.updating || !failedCount" @click="retryTasks">重新排队失败更新（{{ failedCount }}）</button>
          <p v-if="feedback" role="status">{{ feedback }}</p>
        </section>
        <section class="cw-sys-card">
          <h4>最近处理结果</h4>
          <p class="cw-pane-desc">已完成、取消或停止的更新 {{ finishedTasks.length }} 项，展示最近 20 项。</p>
          <article v-for="task in finishedTasks.slice(-20).reverse()" :key="task.id" class="cw-task-item">
            <div class="cw-task-top"><strong>{{ task.title }}</strong><span>{{ task.status }}</span></div>
            <span v-if="task.targets">{{ task.targets }}</span>
          </article>
        </section>
        <section class="cw-sys-card">
          <h4>最近保存记录</h4>
          <p v-if="!commits.length" class="cw-pane-desc">尚无保存确认记录。</p>
          <article v-for="commit in commits.slice(0, 20)" :key="commit.id" class="cw-task-item">
            <div class="cw-task-top"><strong>第 {{ commit.version }} 版 · {{ commit.title }}</strong><span>{{ commit.status }}</span></div>
          </article>
        </section>
        <section class="cw-sys-card">
          <h4>备份与导入资料</h4>
          <p class="cw-pane-desc">
            当前状态约 <strong>{{ formatBytes(stateBytes) }}</strong>（{{ stateBytes.toLocaleString() }} 字节）；关联导入资料 {{ Object.keys(system.来源档案).length }} 份。备份包含消息和完整聊天变量，可用于恢复与排查。
          </p>
          <button class="cw-btn" :disabled="!runtime" @click="downloadBackup">下载状态与消息备份</button>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { RuntimeKey, type Runtime } from '../../../../运行/host';
import type { State } from '../../../../运行/core';
import { useWorldState } from '../../utils/context';
import { systemTasks, systemCommits } from '../../utils/system-status';
import QueueStatus from '../shared/QueueStatus.vue';
import { formatBytes } from '../../utils/entity';
import SvgIcon from '../icons/SvgIcon.vue';

const props = defineProps<{ systemData?: State['_系统'] }>();
const emit = defineEmits<{ (e: 'close'): void }>();
const runtime = inject<Runtime | null>(RuntimeKey, null);
const state = useWorldState();
const system = computed(() => props.systemData ?? state.value._系统);
const tasks = computed(() => systemTasks(state.value, system.value));
const pendingTasks = computed(() => tasks.value.filter(task => task.pending));
const finishedTasks = computed(() => tasks.value.filter(task => !task.pending));
const failedCount = computed(() => tasks.value.filter(task => task.failed).length);
const commits = computed(() => systemCommits(system.value, tasks.value));
const activeCount = computed(() => Object.keys(state.value.角色 ?? {}).length);
const floorLabel = computed(() => system.value.楼层id == null ? '尚无消息' : '第 ' + (system.value.楼层id + 1) + ' 条消息');
const activity = computed(() => !runtime ? '离线展示' : runtime.view.error ? '有操作需要处理'
  : runtime.view.updating ? '正在更新或保存资料' : runtime.view.busy
    ? runtime.view.operation === 'phone' ? '正在处理手机操作' : '正在处理互动'
    : runtime.view.queued.length ? '等待处理排队操作' : '空闲');
const feedback = ref('');
const stateBytes = computed(() => new Blob([JSON.stringify(state.value)]).size);
function downloadBackup() {
  if (!runtime) return;
  const content = {
    格式: '澄湾状态与消息备份/1',
    聊天id: SillyTavern.getCurrentChatId(),
    消息: getChatMessages('0-{{lastMessageId}}', { include_swipes: true }),
    聊天变量: getVariables({ type: 'chat' }),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = '瓦洛兰状态与消息备份.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function retryTasks() {
  try {
    if (!runtime) throw Error('离线展示不执行任务');
    await runtime.runBackground(true);
    feedback.value = '已重新排队，将随下一次正文或手机互动结算。';
  } catch (e) {
    feedback.value = String(e);
  }
}
</script>

<style scoped lang="scss">
.cw-drawer-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4); z-index: 200; display: flex; justify-content: flex-end; }
.cw-system-drawer { width: min(440px, 100%); height: 100%; background: var(--cw-bg-surface); color: var(--cw-text-primary); border-left: 1px solid var(--cw-border); box-shadow: var(--cw-shadow-modal); display: flex; flex-direction: column; }
.cw-drawer-header { min-height: 52px; padding: 0 16px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--cw-border); }
.cw-drawer-header strong { display: flex; gap: 8px; align-items: center; font-size: 14px; }
.cw-drawer-body { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 14px; min-height: 0; }
.cw-pane-desc { font-size: 12px; color: var(--cw-text-secondary); line-height: 1.6; margin: 0; }
.cw-sys-card { padding: 12px 14px; border-radius: var(--cw-radius); background: var(--cw-bg-card); border: 1px solid var(--cw-border); display: flex; flex-direction: column; gap: 10px; }
h4 { margin: 0; font-size: 13px; }
.cw-sys-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.cw-sys-grid > div { display: flex; flex-direction: column; gap: 4px; background: var(--cw-bg-card-subtle); padding: 8px; border-radius: var(--cw-radius-sm); font-size: 12px; }
.cw-sys-grid span { color: var(--cw-text-muted); }
.cw-sys-grid b { font-weight: 500; overflow-wrap: anywhere; }
.cw-task-item { padding: 10px; background: var(--cw-bg-card-subtle); border-radius: var(--cw-radius-sm); font-size: 12px; display: flex; flex-direction: column; gap: 6px; overflow-wrap: anywhere; }
.cw-task-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.cw-task-error { color: var(--cw-danger); margin: 0; font-size: 12px; overflow-wrap: anywhere; }
</style>
