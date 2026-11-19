<template>
  <div class="cw-refresh-actions">
    <button v-if="running" type="button" class="cw-btn cw-btn-ghost cw-btn-xs" data-action="stop-refresh"
      :disabled="runtime?.view.readOnly" title="停止本次奇遇刷新" @click="runtime?.stop()">停止</button>
    <button v-else-if="recoverable || queued" type="button" class="cw-btn cw-btn-ghost cw-btn-xs"
      :disabled="changing || runtime?.view.readOnly" @click="cancel">取消</button>
    <button type="button" class="cw-btn cw-btn-secondary cw-btn-sm cw-refresh-button"
      :data-action="'refresh-' + target" :aria-busy="running || !!queued" :disabled="primaryDisabled"
      :title="recoverable ? '继续上次未完成的刷新' : queued ? '刷新已排队' : running ? '刷新中' : label"
      @click="refresh">
      <SvgIcon name="refreshCw" :size="14" :class="{ 'cw-spin': running }" />
      <span>{{ label }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { RuntimeKey, type Runtime } from '../../../../运行/host';
import type { NovelRefreshTarget } from '../../../../运行/novel-refresh';
import SvgIcon from '../icons/SvgIcon.vue';

const props = defineProps<{ target: 'tasks' | 'shop'; disabled: boolean }>();
const emit = defineEmits<{ (e: 'refresh'): void; (e: 'feedback', message: string): void }>();
const runtime = inject<Runtime | null>(RuntimeKey, null);
const label = computed(() => props.target === 'tasks' ? '刷新任务' : '刷新商店');
// 开启奇遇产生的联合请求在任务大厅处理，避免两个页签各自发起一次重试。
const belongsHere = (target?: NovelRefreshTarget | null) => (target === 'shop' ? 'shop' : 'tasks') === props.target;
const running = computed(() => runtime?.view.operation === 'novel' && belongsHere(runtime.view.activeNovelTarget));
const queued = computed(() => runtime?.view.queued.find(item => item.kind === 'novel' && belongsHere(item.target)));
const recoverable = computed(() => runtime?.view.recoverable.find(item => item.kind === 'novel' && belongsHere(item.target)));
const changing = ref(false);
const primaryDisabled = computed(() => !runtime || runtime.view.readOnly || changing.value || running.value || !!queued.value ||
  (recoverable.value ? !!runtime.view.operation || runtime.view.busy || runtime.view.updating : props.disabled || !runtime.novelRefresh));

async function refresh() {
  const item = recoverable.value;
  if (!item) { emit('refresh'); return; }
  changing.value = true;
  try {
    await runtime!.resumeQueued(item.id);
  } catch (error) {
    if (!runtime!.view.error) emit('feedback', String(error));
  } finally {
    changing.value = false;
  }
}

async function cancel() {
  const item = recoverable.value ?? queued.value;
  if (!item) return;
  changing.value = true;
  try {
    await runtime!.cancelQueued(item.id);
  } catch (error) {
    if (String(error) !== runtime!.view.error) emit('feedback', String(error));
  } finally {
    changing.value = false;
  }
}
</script>

<style scoped>
.cw-refresh-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.cw-refresh-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 32px;
  min-width: 96px;
  padding: 4px 12px;
  color: var(--cw-text-primary);
  background: var(--cw-bg-card);
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius-sm);
}
.cw-refresh-button:hover:not(:disabled) { border-color: var(--cw-accent); color: var(--cw-accent); }
@media (prefers-reduced-motion: no-preference) {
  .cw-spin { animation: cw-refresh-turn 1s linear infinite; }
}
@keyframes cw-refresh-turn { to { transform: rotate(1turn); } }
</style>
