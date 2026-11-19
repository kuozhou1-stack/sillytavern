<template>
  <div class="cw-extra-api-tab">
    <div class="cw-api-intro">
      <template v-if="channel === 'phone'">
        <h4>手机与奇遇共用 API</h4>
        <p>手机发送、发布、互动和刷新，以及奇遇首次开启后的随机内容生成、任务和商店刷新，共用这一份连接配置，与正文变量 API 分开。</p>
        <p>手机操作按变量规则结算；奇遇刷新只生成可选任务或商店新品，不推进时间、不执行玩家行动、不改余额和已接取任务。浏览与保存设置不会请求生成。</p>
      </template>
      <template v-else>
        <h4>正文变量 API</h4>
        <p>正文由酒馆主模型生成。正文完整输出后，此 API 读取变量更新规则，统一更新全部需要变化的变量。</p>
        <p>与手机及奇遇读取同一份状态，各自触发。变量更新失败保留正文，可重试变量阶段。</p>
      </template>
    </div>
    <ExtraApiForm :channel="channel" />
  </div>
</template>
<script setup lang="ts">
import ExtraApiForm from './ExtraApiForm.vue';
withDefaults(defineProps<{ channel?: 'variable' | 'phone' }>(), { channel: 'variable' });
</script>
<style scoped>
.cw-extra-api-tab {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.cw-api-intro {
  padding: 16px;
  background: var(--cw-bg-card);
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius);
}
h4 {
  margin: 0 0 8px;
  color: var(--cw-text-primary);
  font-size: 14px;
}
p {
  margin: 6px 0 0;
  color: var(--cw-text-muted);
  font-size: 13px;
  line-height: 1.65;
}
</style>
