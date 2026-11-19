<template>
  <section v-if="runtime && state?._系统.建档完成" class="cw-creation-receipt">
    <h3>建档资料已保存</h3>
    <p>{{ show(state.玩家.姓名) }} · {{ show(state.玩家.性别) }} · {{ show(state.玩家.身份.身份) }}</p>
    <p>当前位置：{{ locationName(state, state.玩家.当前状态.当前地点id) }}</p>
    <p>初始角色：{{ people.length ? people.map(p => show(p.姓名)).join('、') : '未添加' }}</p>
    <p>档案可在玩家与人物页面查看。系统先自动生成开场正文，再整批更新角色资料与变量。</p>
    <p v-if="opening.length">
      导入角色整理：{{ completed }} / {{ opening.length }} 项更新已保存。可在系统状态中查看进度。
    </p>
    <button class="cw-btn cw-btn-xs" :disabled="runtime.view.busy || runtime.view.updating" @click="resume">
      继续／重试开场
    </button>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { RuntimeKey } from '../../../../运行/host';
import { useWorldState, show, locationName } from '../../utils/context';
const runtime = inject(RuntimeKey, null),
  state = useWorldState();
const error = ref('');
async function resume() {
  try {
    await runtime!.startOpening();
    error.value = '';
  } catch (e) {
    error.value = String(e);
  }
}
const people = computed(() => Object.values(state.value.角色 ?? {}) as any[]);
const opening = computed(() => Object.values(runtime?.view.data?._系统.任务 ?? {}).filter(t => t.类别 === '建档' && t.状态 !== '失效'));
const completed = computed(() => opening.value.filter(t => t.状态 === '已提交').length);
</script>
<style scoped>
.cw-creation-receipt {
  padding: 20px;
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card);
  color: var(--cw-text-primary);
  max-width: 860px;
  width: 100%;
  margin: 0 auto;
  overflow-wrap: anywhere;
}
h3 {
  margin: 0 0 12px;
}
p {
  margin: 8px 0;
  line-height: 1.7;
}
p:last-child {
  color: var(--cw-text-secondary);
}
</style>
