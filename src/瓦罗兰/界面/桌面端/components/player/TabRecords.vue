<template>
  <div class="cw-tab-pane cw-player-records-pane">
    <header class="cw-record-index">
      <h4>个人记录与认知</h4>
      <div class="cw-record-tabs" role="tablist" aria-label="个人记录分类">
        <button v-for="(tab, index) in recordTabs" :id="`cw-record-tab-${tab.id}`" :key="tab.id"
          class="cw-record-tab" type="button" role="tab" :aria-selected="activeRecordTab === tab.id"
          aria-controls="cw-player-record-content" :tabindex="activeRecordTab === tab.id ? 0 : -1"
          @click="selectedRecords = tab.id" @keydown="navigateTabs($event, index)">
          {{ tab.label }} <span class="cw-record-count">{{ tab.count }}</span>
        </button>
      </div>
    </header>
    <div id="cw-player-record-content" role="tabpanel" :aria-labelledby="`cw-record-tab-${activeRecordTab}`">
      <PlayerRecordCards :tab="activeRecordTab" :player="player" :state="state" />
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useWorldState } from '../../utils/context';
import PlayerRecordCards from './PlayerRecordCards.vue';
const props = defineProps<{ player: any }>();
const state = useWorldState();
type RecordTab = 'memos' | 'experiences' | 'knowledge';
const selectedRecords = ref<RecordTab | null>(null);
const recordTabs = computed(() => [
  { id: 'memos' as const, label: '备忘', count: Object.keys(props.player?.个人记录?.个人备忘 ?? {}).length },
  { id: 'experiences' as const, label: '经历', count: Object.keys(props.player?.个人记录?.重要经历 ?? {}).length },
  { id: 'knowledge' as const, label: '已知信息', count: Object.values(props.player?.已知信息 ?? {}).reduce<number>(
    (sum, group) => sum + Object.keys(group ?? {}).length, 0) },
]);
const activeRecordTab = computed(() => selectedRecords.value ?? recordTabs.value.find(tab => tab.count > 0)?.id ?? 'memos');

function navigateTabs(event: KeyboardEvent, index: number) {
  const count = recordTabs.value.length;
  const positions: Record<string, number | undefined> = {
    ArrowLeft: (index + count - 1) % count, ArrowRight: (index + 1) % count, Home: 0, End: count - 1,
  };
  const next = positions[event.key];
  if (next === undefined) return;
  event.preventDefault();
  selectedRecords.value = recordTabs.value[next].id;
  const tablist = (event.currentTarget as HTMLElement).parentElement;
  tablist?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
}
</script>
<style scoped>
.cw-player-records-pane { display: flex; flex-direction: column; gap: 16px; }
.cw-record-index {
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card);
}
.cw-record-index h4 {
  margin: 0;
  padding: 10px 14px;
  border-bottom: 1px solid var(--cw-border);
  font: 600 14px/1.5 var(--cw-font-current);
  color: var(--cw-text-primary);
}
.cw-record-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 3px;
  padding: 4px;
  background: var(--cw-bg-card-subtle);
  border-radius: 0 0 var(--cw-radius) var(--cw-radius);
}
.cw-record-tab {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 5px;
  min-width: 0;
  padding: 7px 3px;
  border: 1px solid transparent;
  border-radius: var(--cw-radius-sm);
  background: transparent;
  color: var(--cw-text-secondary);
  font: 500 13px/1.4 var(--cw-font-current);
  cursor: pointer;
}
.cw-record-tab:hover, .cw-record-tab:focus-visible { color: var(--cw-text-primary); background: var(--cw-bg-card); }
.cw-record-tab:focus-visible { outline: 2px solid var(--cw-accent); outline-offset: -2px; }
.cw-record-tab[aria-selected="true"] {
  border-color: var(--cw-border);
  background: var(--cw-bg-card);
  color: var(--cw-accent);
  font-weight: 650;
}
.cw-record-count { font-size: 11px; font-variant-numeric: tabular-nums; }
</style>
