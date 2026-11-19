<template>
  <div class="cw-comment-list">
    <div
      v-for="c in pageRows"
      :key="c.id"
      class="cw-comment-row"
      :style="{ paddingLeft: Math.min(c.depth, 4) * 10 + 'px' }"
    >
      <strong>{{ c.author }}</strong
      ><span v-if="c.replyAuthor"> 回复 {{ c.replyAuthor }}</span
      >：{{ c.text }}
      <button @click="emit('reply', c.id)">回复</button>
    </div>
    <div v-if="pages > 1" class="cw-comment-pages">
      <button :disabled="page === 0" @click="page--">上一页</button><span>{{ page + 1 }} / {{ pages }}</span
      ><button :disabled="page + 1 >= pages" @click="page++">下一页</button>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
const props = defineProps<{ comments: any[] }>();
const emit = defineEmits<{ (e: 'reply', id: string): void }>();
const page = ref(0);
const rows = computed(() => {
  const result: any[] = [],
    visited = new Set<string>(),
    all = props.comments ?? [];
  function add(c: any, depth: number) {
    if (visited.has(c.id)) return;
    visited.add(c.id);
    result.push({ ...c, depth, replyAuthor: all.find(p => p.id === c.replyTo)?.author });
    all.filter(p => p.replyTo === c.id).forEach(p => add(p, depth + 1));
  }
  all.filter(c => !c.replyTo || !all.some(p => p.id === c.replyTo)).forEach(c => add(c, 0));
  all.forEach(c => add(c, 0));
  return result;
});
const pages = computed(() => Math.max(1, Math.ceil(rows.value.length / 20))),
  pageRows = computed(() => rows.value.slice(page.value * 20, (page.value + 1) * 20));
watch(pages, n => {
  page.value = Math.min(page.value, n - 1);
});
</script>
<style scoped>
.cw-comment-row {
  overflow-wrap: anywhere;
  padding: 5px 0;
  color: var(--cw-text-primary);
  font-size: 12px;
}
.cw-comment-pages {
  display: flex;
  justify-content: space-between;
}
button {
  color: var(--cw-accent);
  background: var(--cw-bg-surface);
  border: 1px solid var(--cw-border);
  border-radius: 4px;
  padding: 3px;
}
</style>
