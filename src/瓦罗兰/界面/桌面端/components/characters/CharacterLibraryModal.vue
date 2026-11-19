<template>
  <div class="cw-modal-backdrop" @click.self="emit('close')">
    <div class="cw-modal-box cw-character-library cw-gameplay-panel" :style="gameplayModalSize" role="dialog" aria-modal="true" aria-label="角色库">
      <header class="cw-library-header">
        <span class="cw-library-title">角色库</span>
        <nav aria-label="角色库页面" class="cw-library-nav">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            class="cw-library-tab"
            :class="{ active: view === tab.key }"
            :aria-current="view === tab.key ? 'page' : undefined"
            @click="emit('navigate', tab.key)"
          >
            {{ tab.label }}
          </button>
        </nav>
        <button class="cw-btn cw-btn-ghost cw-close-btn cw-gameplay-close" aria-label="关闭角色库" @click="emit('close')">
          <SvgIcon name="close" :size="18" />
        </button>
      </header>
      <MajorCharacterModal
        v-if="visited.major_chars"
        v-show="view === 'major_chars'"
        ref="major"
        embedded
        :characters="characters"
        @open-management="emit('navigate', 'char_manage')"
      />
      <MinorCharacterModal
        v-if="visited.minor_chars"
        v-show="view === 'minor_chars'"
        ref="minor"
        embedded
        :characters="characters"
        @promote-character="emit('promoteCharacter', $event)"
      />
      <CharacterManageModal
        v-if="visited.char_manage"
        v-show="view === 'char_manage'"
        embedded
        :characters="characters"
        :export-character="exportCharacter"
        :import-characters="importCharacters"
        @delete-character="emit('deleteCharacter', $event)"
        @promote-character="emit('promoteCharacter', $event)"
        @inspect-character="inspect"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, reactive, ref, watch } from 'vue';
import { gameplayModalSize } from '../../utils/gameplay-modal-size';
import MajorCharacterModal from './MajorCharacterModal.vue';
import MinorCharacterModal from './MinorCharacterModal.vue';
import CharacterManageModal from './CharacterManageModal.vue';
import SvgIcon from '../icons/SvgIcon.vue';
const props = defineProps<{
  view: string;
  characters: Record<string, any>;
  exportCharacter?: (id: string) => unknown;
  importCharacters: (values: any[], submissionId: string) => Promise<void>;
}>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'navigate', view: string): void;
  (e: 'deleteCharacter', id: string): void;
  (e: 'promoteCharacter', id: string): void;
}>();
const tabs = [
  { key: 'major_chars', label: '主要角色' },
  { key: 'minor_chars', label: '次要角色' },
  { key: 'char_manage', label: '管理' },
];
const visited = reactive<Record<string, boolean>>({});
watch(
  () => props.view,
  view => {
    visited[view] = true;
  },
  { immediate: true },
);
const major = ref<InstanceType<typeof MajorCharacterModal> | null>(null);
const minor = ref<InstanceType<typeof MinorCharacterModal> | null>(null);
async function inspect(id: string) {
  const character = props.characters[id];
  if (!character) return;
  const isMinor = character.层级 === '次要';
  emit('navigate', isMinor ? 'minor_chars' : 'major_chars');
  await nextTick();
  (isMinor ? minor.value : major.value)?.selectCharacter(id);
}
</script>

<style scoped>
.cw-character-library {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.cw-library-header {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
  padding: 10px 16px;
  border-bottom: 1px solid var(--cw-border);
}
.cw-library-title {
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
}
.cw-library-nav {
  display: flex;
  gap: 4px;
  flex: 1;
  min-width: 0;
}
.cw-library-tab {
  border: 0;
  background: transparent;
  border-radius: var(--cw-radius-sm);
  padding: 8px 12px;
  font-size: 13px;
  color: var(--cw-text-secondary);
  cursor: pointer;
  white-space: nowrap;
}
.cw-library-tab:hover,
.cw-library-tab.active {
  background: var(--cw-accent-bg);
  color: var(--cw-accent);
}
.cw-library-tab.active {
  font-weight: 600;
}
@media (max-width: 640px) {
  .cw-library-header {
    padding: 6px 8px;
    gap: 6px;
  }
  .cw-library-title {
    display: none;
  }
  .cw-library-tab {
    padding: 6px 8px;
    font-size: 12px;
  }
}
</style>
