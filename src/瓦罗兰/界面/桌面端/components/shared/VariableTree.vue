<template>
  <details v-if="isBranch" class="cw-variable-node" @toggle="onToggle">
    <summary><span>{{ label }}</span><small>{{ entryCount }} 项</small></summary>
    <div v-if="expanded" class="cw-variable-children">
      <VariableTree v-for="[key, child] in entries" :key="key" :label="key" :value="child" />
      <span v-if="!entries.length" class="cw-variable-empty">空</span>
    </div>
  </details>
  <div v-else class="cw-variable-leaf">
    <span class="cw-variable-key">{{ label }}</span>
    <span class="cw-variable-value">{{ displayValue }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
const props = defineProps<{ label: string; value: unknown }>();
const expanded = ref(false);
const isBranch = computed(() => props.value !== null && typeof props.value === 'object');
const entries = computed<[string, unknown][]>(() =>
  Array.isArray(props.value)
    ? props.value.map((value, index) => [String(index + 1), value])
    : isBranch.value
      ? Object.entries(props.value as Record<string, unknown>)
      : [],
);
const entryCount = computed(() => entries.value.length);
const displayValue = computed(() =>
  props.value === null || props.value === undefined
    ? '未设定'
    : typeof props.value === 'boolean'
      ? props.value ? '是' : '否'
      : String(props.value),
);
function onToggle(event: Event) {
  expanded.value = (event.target as HTMLDetailsElement).open;
}
</script>

<style scoped lang="scss">
.cw-variable-node, .cw-variable-leaf { min-width: 0; font-size: 12px; }
.cw-variable-node > summary {
  display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 6px 8px;
  color: var(--cw-text-primary); border-radius: var(--cw-radius);
}
.cw-variable-node > summary:hover { background: var(--cw-bg-card-hover); }
.cw-variable-node > summary small { color: var(--cw-text-muted); font-size: 11px; }
.cw-variable-children { margin-left: 12px; padding-left: 8px; border-left: 1px solid var(--cw-border); }
.cw-variable-leaf { display: flex; gap: 12px; padding: 5px 8px; line-height: 1.5; }
.cw-variable-key { flex: 0 0 120px; color: var(--cw-text-secondary); overflow-wrap: anywhere; }
.cw-variable-value { min-width: 0; color: var(--cw-text-primary); white-space: pre-wrap; overflow-wrap: anywhere; }
.cw-variable-empty { display: block; padding: 5px 8px; color: var(--cw-text-muted); }
@media (max-width: 600px) { .cw-variable-key { flex-basis: 88px; } }
</style>
