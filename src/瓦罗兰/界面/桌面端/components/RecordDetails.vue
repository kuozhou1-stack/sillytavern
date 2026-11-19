<template>
  <div class="cw-record-details">
    <p v-if="!hasRecordValue(value)" class="cw-record-empty">暂无记录</p>
    <RecordValue
      v-else-if="typeof value !== 'object' || isRecordTime(value) || isSingleRecord"
      :value="value"
      :reference="reference"
    />
    <template v-else>
      <article v-for="([key, item], index) in entries" :key="key" class="cw-record-card">
        <h5 class="cw-record-title">{{ recordLabel(key, item, index, state, reference) }}</h5>
        <RecordValue :value="item" :field="key" :reference="reference" />
      </article>
    </template>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useWorldState } from '../utils/context';
import { hasRecordValue, isRecordTime, recordEntries, recordLabel } from '../utils/record-display';
import RecordValue from './RecordValue.vue';
const props = defineProps<{ value: any; reference?: boolean }>();
const state = useWorldState();
const entries = computed(() => recordEntries(props.value));
const isSingleRecord = computed(() => ['内容', '事实', '经历'].some(k => typeof props.value?.[k] === 'string'));
</script>
<style scoped>
.cw-record-details {
  display: grid;
  gap: 10px;
  min-width: 0;
  font-size: 13px;
  color: var(--cw-text-primary);
}
.cw-record-empty {
  margin: 0;
  padding: 10px 12px;
  color: var(--cw-text-muted);
  font-size: 13px;
}
.cw-record-card {
  display: grid;
  gap: 10px;
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card);
}
.cw-record-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--cw-text-secondary);
}
</style>
