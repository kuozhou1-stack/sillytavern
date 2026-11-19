<template>
  <RosterAutoPanel
    title="自动角色调度"
    :icon="isEnabled ? 'userCheck' : 'users'"
    :enabled="isEnabled"
    :description="isEnabled ? '已开启 · 正文和手机互动前按需轮换人物。' : '已关闭 · 保留当前开启的人物。'"
    :disabled="disabled || saving || !runtime"
    :error="error"
    @change="toggle"
  >
    <p>开局补全后开始调度。正在互动的人物优先保留，手动关闭的人物保持关闭。</p>
  </RosterAutoPanel>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { RuntimeKey, type Runtime } from '../../../../运行/host';
import RosterAutoPanel from './RosterAutoPanel.vue';

const runtime = inject<Runtime | null>(RuntimeKey, null);
const props = defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{ (e: 'feedback', msg: string): void; (e: 'saving', value: boolean): void }>();
const saving = ref(false), error = ref('');

const isEnabled = computed(() => runtime?.settings.characterAuto ?? true);

async function toggle(event: Event) {
  if (!runtime || props.disabled || saving.value) return;
  const checkbox = event.target as HTMLInputElement;
  const enabled = checkbox.checked;
  saving.value = true;
  emit('saving', true);
  error.value = '';
  try {
    await runtime.saveSettings({ characterAuto: enabled }, 'general');
    emit('feedback', enabled ? '自动角色调度已开启，将在下一次正文或手机互动前整理名单。' : '自动角色调度已关闭，当前人物开关保持现状。');
  } catch (cause) {
    error.value = String(cause);
  } finally {
    checkbox.checked = runtime.settings.characterAuto;
    saving.value = false;
    emit('saving', false);
  }
}
</script>
