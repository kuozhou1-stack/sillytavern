<template>
  <span v-if="!hasRecordValue(value)" class="cw-record-muted">未知</span>
  <span v-else-if="isRecordTime(value) || typeof value !== 'object'">{{
    recordScalar(value, state, reference || isRecordReference(field))
  }}</span>
  <div v-else-if="Array.isArray(value)" class="cw-record-stack">
    <RecordValue
      v-for="(item, index) in value.filter(hasRecordValue)"
      :key="index"
      :value="item"
      :field="field"
      :reference="reference"
    />
  </div>
  <div v-else class="cw-record-body">
    <div v-if="value.性质 || value.类型" class="cw-record-badges">
      <span v-if="value.性质" class="cw-badge" :class="natureClass">{{ value.性质 }}</span>
      <span v-if="value.类型" class="cw-badge">{{ value.类型 }}</span>
    </div>
    <p v-if="bodyKey" class="cw-record-prose">{{ value[bodyKey] }}</p>
    <div
      v-for="([key, item], index) in fields"
      :key="key"
      class="cw-record-field"
      :class="{ 'cw-record-nested': typeof item === 'object' && !isRecordTime(item) }"
    >
      <span class="cw-record-label">{{ recordLabel(key, item, index, state) }}</span>
      <RecordValue :value="item" :field="key" :reference="isRecordReference(key)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useWorldState } from '../utils/context';
import {
  hasRecordValue,
  isRecordTime,
  isRecordReference,
  recordScalar,
  recordLabel,
  recordEntries,
} from '../utils/record-display';
const props = defineProps<{ value: any; field?: string; reference?: boolean }>();
const state = useWorldState();
const bodyKey = computed(() =>
  ['内容', '事实', '经历', '说明'].find(key => typeof props.value?.[key] === 'string' && props.value[key].trim()),
);
const fields = computed(() =>
  recordEntries(props.value).filter(([key]) => ![bodyKey.value, '性质', '类型'].includes(key)),
);
const natureClass = computed(
  () =>
    (({ 事实: 'cw-badge-success', 推测: 'cw-badge-warning', 误解: 'cw-badge-danger' }) as Record<string, string>)[
      props.value?.性质
    ] || 'cw-badge-info',
);
</script>

<style scoped>
.cw-record-body,
.cw-record-stack {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.cw-record-body {
  line-height: 1.65;
  overflow-wrap: anywhere;
}
.cw-record-prose {
  margin: 0;
  white-space: pre-wrap;
}
.cw-record-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.cw-record-field {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.cw-record-field > :last-child {
  min-width: 0;
}
.cw-record-label {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--cw-text-muted);
}
.cw-record-nested {
  display: grid;
  gap: 5px;
  padding-left: 10px;
  border-left: 2px solid var(--cw-border);
}
.cw-record-muted {
  color: var(--cw-text-muted);
}
</style>
