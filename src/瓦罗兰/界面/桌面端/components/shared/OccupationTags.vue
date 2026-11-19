<template>
  <span v-if="tags.length" class="cw-occupation-tags" :class="{ compact }" aria-label="身份">
    <span v-for="tag in tags" :key="tag" class="cw-occupation-tag">{{ tag }}</span>
  </span>
  <span v-else class="cw-occupation-unknown">{{ emptyText || '身份未知' }}</span>
</template>
<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{ value?: unknown; compact?: boolean; emptyText?: string }>();
const tags = computed(() =>
  typeof props.value === 'string'
    ? [
        ...new Set(
          props.value
            // 身份以顿号分隔；斜杠属于 K/DA 等身份名称本身。
            .split('、')
            .map(v => v.trim())
            .filter(Boolean),
        ),
      ]
    : [],
);
</script>
<style scoped>
.cw-occupation-tags {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 5px;
  vertical-align: middle;
  max-width: 100%;
  min-width: 0;
}
.cw-occupation-tag {
  padding: 3px 8px;
  border: 1px solid var(--cw-accent-border);
  border-radius: 4px;
  background: var(--cw-accent-bg);
  color: var(--cw-accent);
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.compact .cw-occupation-tag {
  padding: 2px 5px;
  font-size: 11px;
}
.cw-occupation-unknown {
  font-size: 12px;
  color: var(--cw-text-muted);
}
</style>
