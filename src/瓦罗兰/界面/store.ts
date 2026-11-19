import { defineStore } from 'pinia';
import { computed, shallowRef } from 'vue';
import type { Runtime } from '../运行/host';
import type { State } from '../运行/core';
export type ChengwanState = State;
/** Delegate to the one active runtime. Never write the iframe container floor. */
export const useChengwanStore = defineStore('chengwan-mvu-data', () => {
  const runtime = shallowRef<Runtime>();
  function bind(value: Runtime) {
    runtime.value = value;
  }
  const data = computed(() => runtime.value?.view.data ?? null);
  const characterLibrary = computed(() => runtime.value?.view.characterLibrary ?? null);
  const currentMessageId = computed(() => data.value?._系统.楼层id ?? null);
  function readCurrentMessage() {
    if (!runtime.value) throw Error('运行服务尚未绑定');
    runtime.value.refresh();
  }
  return { bind, data, characterLibrary, currentMessageId, readCurrentMessage };
});
