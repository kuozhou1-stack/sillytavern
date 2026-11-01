<template>
  <details class="cw-variable-status" :class="`cw-variable-status-${status.state}`" aria-label="本轮变量更新状态">
    <summary>
      <span class="cw-variable-symbol" aria-hidden="true">{{ symbol }}</span>
      <strong>变量更新</strong>
      <span class="cw-variable-state">{{ stateLabel }}</span>
      <span v-if="status.state === 'saved'" class="cw-variable-count">{{ status.changes.length }} 项变化</span>
      <span v-for="row in highlights" :key="row.path" class="cw-variable-highlight">{{ row.label }} {{ row.delta || row.after }}</span>
      <span class="cw-variable-hint" aria-hidden="true">⌄</span>
    </summary>
    <div class="cw-variable-body">
      <p class="cw-variable-note">{{ status.note }}</p>
      <template v-if="status.state === 'saved' && status.groups.length">
        <details v-for="group in status.groups" :key="group.key" class="cw-variable-group" :data-variable-group="group.key">
          <summary>{{ group.label }} <small>{{ group.rows.length }} 项</small><span class="cw-group-hint" aria-hidden="true">⌄</span></summary>
          <div v-for="row in group.rows" :key="row.path" class="cw-variable-row">
            <span class="cw-variable-label">{{ relativeLabel(group.key, row.label) }}</span>
            <span class="cw-variable-old">{{ row.before }}</span>
            <span class="cw-variable-arrow" aria-hidden="true">→</span>
            <span class="cw-variable-new">{{ row.after }}</span>
            <span v-if="row.delta" class="cw-variable-delta" :class="row.delta.startsWith('+') ? 'gain' : 'loss'">{{ row.delta }}</span>
          </div>
        </details>
      </template>
      <p v-else-if="status.state === 'saved'" class="cw-variable-empty">本轮没有保存的变量变化。</p>
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { StoryChangeStatus } from '../../../../运行/variable-changes';
const props = defineProps<{ status: StoryChangeStatus }>();
const stateLabel = computed(() => ({
  receiving: '接收中', pending: '等待读取', failed: '更新失败', saved: '已保存', unknown: '待核对',
})[props.status.state]);
const symbol = computed(() => ({
  receiving: '◌', pending: '◷', failed: '!', saved: '✓', unknown: '·',
})[props.status.state]);
const highlights = computed(() => props.status.state === 'saved' ?
  props.status.changes.filter(row => row.important).slice(0, 2) : []);
function relativeLabel(groupKey: string, label: string) {
  return label.split(' · ').slice(groupKey.split('/').length - 1).join(' · ') || label;
}
</script>

<style scoped lang="scss">
.cw-variable-status {
  margin-top: 14px; border: 1px solid var(--cw-border); border-radius: var(--cw-radius);
  background: var(--cw-bg-card-subtle); color: var(--cw-text-primary); overflow: hidden;
}
.cw-variable-status > summary {
  display: flex; align-items: center; gap: 8px; padding: 9px 12px;
  list-style: none; cursor: pointer; font-size: 12px; min-width: 0;
}
.cw-variable-status > summary::-webkit-details-marker { display: none; }
.cw-variable-status > summary strong { font-size: 12px; white-space: nowrap; }
.cw-variable-symbol { display: inline-flex; width: 18px; height: 18px; align-items: center; justify-content: center; border-radius: 50%; background: var(--cw-success-bg); color: var(--cw-success); font-weight: 700; }
.cw-variable-status-pending .cw-variable-symbol, .cw-variable-status-receiving .cw-variable-symbol { background: var(--cw-info-bg); color: var(--cw-info); }
.cw-variable-status-failed .cw-variable-symbol, .cw-variable-status-unknown .cw-variable-symbol { background: var(--cw-warning-bg); color: var(--cw-warning); }
.cw-variable-state { color: var(--cw-text-secondary); white-space: nowrap; }
.cw-variable-count { color: var(--cw-accent); white-space: nowrap; }
.cw-variable-highlight { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 170px; padding: 2px 6px; border-radius: var(--cw-radius-sm); background: var(--cw-bg-surface); color: var(--cw-text-secondary); }
.cw-variable-hint { margin-left: auto; color: var(--cw-text-muted); transition: transform .15s; }
.cw-variable-status[open] .cw-variable-hint { transform: rotate(180deg); }
.cw-variable-body { padding: 4px 12px 12px; border-top: 1px solid var(--cw-border); max-height: 330px; overflow: auto; }
.cw-variable-note, .cw-variable-empty { margin: 7px 0; color: var(--cw-text-muted); font-size: 12px; }
.cw-variable-group { margin: 4px 0; border: 1px solid var(--cw-border); border-radius: var(--cw-radius-sm); background: var(--cw-bg-surface); }
.cw-variable-group > summary { display: flex; align-items: center; gap: 8px; padding: 7px 9px; list-style: none; cursor: pointer; font-size: 12px; color: var(--cw-accent); font-weight: 600; }
.cw-variable-group > summary::-webkit-details-marker { display: none; }
.cw-variable-group > summary small { font-weight: 400; color: var(--cw-text-muted); }
.cw-group-hint { margin-left: auto; color: var(--cw-text-muted); transition: transform .15s; }
.cw-variable-group[open] .cw-group-hint { transform: rotate(180deg); }
.cw-variable-row { display: grid; grid-template-columns: minmax(110px, 1.1fr) minmax(0, 1fr) 14px minmax(0, 1fr) minmax(34px, auto); align-items: start; gap: 8px; padding: 7px 9px; border-top: 1px solid var(--cw-border); font-size: 12px; line-height: 1.5; }
.cw-variable-label, .cw-variable-old, .cw-variable-new { min-width: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.cw-variable-label { color: var(--cw-text-secondary); }
.cw-variable-old, .cw-variable-new { color: var(--cw-text-primary); }
.cw-variable-arrow { color: var(--cw-text-muted); text-align: center; }
.cw-variable-delta { font-variant-numeric: tabular-nums; white-space: nowrap; text-align: right; }
.cw-variable-delta.gain { color: var(--cw-success); }
.cw-variable-delta.loss { color: var(--cw-danger); }
@media (max-width: 600px) {
  .cw-variable-status > summary { gap: 5px; padding: 8px; }
  .cw-variable-highlight { display: none; }
  .cw-variable-row { grid-template-columns: minmax(0, 1fr) 14px minmax(0, 1fr) minmax(34px, auto); gap: 4px 6px; }
  .cw-variable-label { grid-column: 1 / 4; }
  .cw-variable-old { grid-column: 1; grid-row: 2; }
  .cw-variable-arrow { grid-column: 2; grid-row: 2; }
  .cw-variable-new { grid-column: 3; grid-row: 2; }
  .cw-variable-delta { grid-column: 4; grid-row: 2; }
}
</style>
