<template>
  <section class="cw-batch-import">
    <div class="cw-batch-actions">
      <label class="cw-btn cw-btn-sm">
        选择多个 JSON 文件
        <input
          type="file"
          multiple
          accept=".json,application/json"
          hidden
          :disabled="busy || reading"
          @change="readFiles"
        />
      </label>
      <span>{{ reading ? '正在读取…' : '支持一次多选；逐文件校验，确认后导入。' }}</span>
    </div>
    <textarea v-model="text" rows="4" :disabled="busy" placeholder="也可以粘贴一份角色 JSON" />
    <div class="cw-batch-actions">
      <button class="cw-btn cw-btn-sm" :disabled="busy || reading || !text.trim()" @click="parseText">
        解析粘贴内容
      </button>
      <button type="button" class="cw-btn cw-btn-secondary cw-btn-sm" :disabled="busy || reading" @click="clear">清空导入区</button>
    </div>
    <article v-for="(row, index) in rows" :key="index" class="cw-batch-row">
      <label v-if="row.result.success">
        <input v-model="row.selected" type="checkbox" :disabled="busy" />
        {{ row.name }} · {{ row.result.charName }} · {{ row.result.charLayer }}
      </label>
      <strong v-else>{{ row.name }}</strong>
      <p v-if="!row.result.success" class="cw-batch-error" role="alert">{{ row.result.error }}</p>
      <template v-else>
        <p>{{ existing[row.result.charId!] ? '将替换同 ID 本人资料：' : '角色 ID：' }}{{ row.result.charId }}</p>
        <details v-if="existing[row.result.charId!]">
          <summary>替换前资料</summary>
          <pre>{{ JSON.stringify(existing[row.result.charId!], null, 2) }}</pre>
        </details>
        <details>
          <summary>本次完整资料</summary>
          <pre>{{ JSON.stringify(row.result.mappedCharacter, null, 2) }}</pre>
        </details>
        <p v-if="row.result.unmappedFields?.length">按正式规则不导入：{{ row.result.unmappedFields.join('、') }}</p>
      </template>
    </article>
    <p v-if="error" class="cw-batch-error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <button
      v-if="rows.length"
      class="cw-btn cw-btn-primary"
      :disabled="busy || reading || !selectedCount"
      @click="confirmImport"
    >
      {{ busy ? '正在保存…' : `确认${replaceCount ? '替换并' : ''}导入选中的 ${selectedCount} 位角色` }}
    </button>
  </section>
</template>
<script setup lang="ts">
import { ref, computed } from 'vue';
import { parseCharacterBatch, selectedCharacters, type ImportRow } from '../../utils/character-batch';
import { copy, uid } from '../../../../运行/core';
const props = defineProps<{
  existing: Record<string, any>;
  importCharacters: (values: any[], submissionId: string) => Promise<void>;
  staged?: boolean;
}>();
const rows = ref<ImportRow[]>([]),
  text = ref(''),
  error = ref(''),
  notice = ref(''),
  busy = ref(false),
  reading = ref(false);
let attempt: { json: string; id: string } | undefined;
const selectedCount = computed(() => rows.value.filter(r => r.selected && r.result.success).length);
const replaceCount = computed(
  () => rows.value.filter(r => r.selected && r.result.success && props.existing[r.result.charId!]).length,
);
async function readFiles(event: Event) {
  const input = event.target as HTMLInputElement,
    files = Array.from(input.files ?? []);
  if (!files.length || busy.value || reading.value) return;
  reading.value = true;
  error.value = '';
  notice.value = '';
  try {
    const sources = await Promise.all(
      files.map(async file => {
        try {
          return { name: file.name, text: await file.text() };
        } catch (e) {
          return { name: file.name, error: '读取文件失败：' + String(e) };
        }
      }),
    );
    rows.value.push(...parseCharacterBatch(sources, Object.keys(props.existing)));
  } finally {
    reading.value = false;
    input.value = '';
  }
}
function parseText() {
  rows.value.push(...parseCharacterBatch([{ name: '粘贴内容', text: text.value }], Object.keys(props.existing)));
  error.value = '';
  notice.value = '';
}
function clear() {
  rows.value = [];
  text.value = '';
  error.value = '';
  notice.value = '';
  attempt = undefined;
}
async function confirmImport() {
  if (busy.value || reading.value) return;
  error.value = '';
  notice.value = '';
  try {
    const selected = rows.value.filter(r => r.selected && r.result.success);
    const values = copy(selectedCharacters(rows.value));
    if (!values.length) return;
    const json = JSON.stringify(values);
    if (!attempt || attempt.json !== json) attempt = { json, id: uid('character_batch') };
    busy.value = true;
    await props.importCharacters(values, attempt.id);
    rows.value = rows.value.filter(r => !selected.includes(r));
    notice.value = props.staged
      ? `已加入 ${values.length} 位待建档角色，正式保存请完成第六步。`
      : `已保存 ${values.length} 位角色。`;
    attempt = undefined;
  } catch (e) {
    error.value = String(e) + '；导入内容已保留。';
  } finally {
    busy.value = false;
  }
}
</script>
<style scoped>
.cw-batch-import {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.cw-batch-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}
.cw-batch-import textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius);
  resize: vertical;
}
.cw-batch-row {
  padding: 12px;
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card-subtle);
  overflow-wrap: anywhere;
  font-size: 13px;
}
.cw-batch-row p {
  margin: 8px 0;
}
.cw-batch-row pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 220px;
  overflow: auto;
}
.cw-batch-error {
  color: var(--cw-danger);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
