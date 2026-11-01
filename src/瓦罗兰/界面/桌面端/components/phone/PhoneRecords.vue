<template>
  <details class="cw-phone-records">
    <summary>联系人管理、申请、群资料、通知与历史</summary>
    <p v-if="error" role="alert">{{ error }}</p>
    <input v-model="search" placeholder="搜索已保存消息、账号或动态" />
    <details>
      <summary>已保存摘要</summary>
      <div v-for="(summary, id) in summaries" :key="id" class="record">
        <strong>{{ summary.层级 }}</strong
        ><span>{{ timeText(summary.起始时间) }} 至 {{ timeText(summary.结束时间) }}</span>
        <p>{{ summary.内容 }}</p>
      </div>
    </details>
    <details>
      <summary>本人账号</summary>
      <select v-model="newPlatform">
        <option>邻信</option>
        <option>微澜</option></select
      ><input v-model="newAccount" placeholder="账号名称" /><button
        @click="run('createAccount', newPlatform, newAccount)"
      >
        建立本人账号
      </button>
    </details>
    <details>
      <summary>发起建群或入群邀约</summary>
      <select v-model="inviteAccount">
        <option value="">选择联系人</option>
        <option v-for="c in phoneProjection(state).contacts" :key="c.id" :value="c.id">{{ c.name }}</option></select
      ><input v-model="groupInvitation" placeholder="群名称、邀请内容或已有群说明" /><button @click="inviteGroup">
        发送邀约
      </button>
      <p>对方接受后才加入，不会直接替对方确认。</p>
    </details>
    <details>
      <summary>好友申请</summary>
      <div v-for="(a, id) in applications" :key="id" class="record">
        <span>{{ accountName(a.发起账号id) }} → {{ accountName(a.目标账号id) }} · {{ a.状态 }}</span
        ><template v-if="a.状态 === '待处理'"
          ><button v-if="a.目标账号id === self" @click="run('accept', String(id))">接受</button
          ><button v-if="a.目标账号id === self" @click="run('reject', String(id))">拒绝</button
          ><button v-if="a.发起账号id === self" @click="run('withdraw', String(id))">撤销</button></template
        >
      </div>
    </details>
    <details>
      <summary>联系人设置</summary>
      <div v-for="(c, id) in contacts" :key="id" class="record">
        <span>{{ c.备注 || accountName(c.对方账号id) }} · {{ c.状态 }}</span
        ><button @click="remark(String(id))">备注</button
        ><button @click="run('mute', String(id))">{{ c.免打扰 ? '取消免打扰' : '免打扰' }}</button
        ><button @click="run('remove', String(id))">移除</button>
      </div>
    </details>
    <details>
      <summary>群资料</summary>
      <div v-for="(g, id) in groups" :key="id" class="record">
        <strong>{{ g.名称 ?? '名称未知' }}</strong>
        <p>{{ g.公告 ?? '暂无公告' }}</p>
        <div v-for="(member, aid) in g.成员" :key="aid">
          {{ member.群昵称 ?? accountName(String(aid)) }}
          <button
            v-if="String(aid) !== self"
            @click="run('removeMember', String(id), String(aid))"
          >
            移除成员
          </button>
        </div>
        <button @click="run('leaveGroup', String(id))">退出群聊</button>
      </div>
    </details>
    <details>
      <summary>通知</summary>
      <div v-for="(n, id) in notifications" :key="id" class="record">
        <span>{{ n.类型 ?? '通知' }} · {{ timeText(n.时间) }} · {{ n.已读 ? '已读' : '未读' }}</span>
        <p>{{ n.内容id.map((id: string) => contentName(id)).join('；') }}</p>
        <button @click="run('readNotification', String(id))">标记已读</button>
      </div>
      <button :disabled="noticePage === 0" @click="noticePage--">上一页</button><span>{{ noticePage + 1 }}</span
      ><button :disabled="(noticePage + 1) * 50 >= Object.keys(state.手机._通知).length" @click="noticePage++">
        下一页
      </button>
    </details>
    <details>
      <summary>可见账号主页</summary>
      <div v-for="(a, id) in accounts" :key="id" class="record">
        <strong>{{ a.昵称 ?? a.账号名 ?? '未知昵称' }}</strong>
        <p>{{ a.平台 }} · {{ a.简介 ?? '暂无简介' }}</p>
        <p v-for="(value, key) in a.公开资料" :key="key">{{ key }}：{{ value }}</p>
        <button v-if="a.平台 === '邻信' && id !== self" @click="run('apply', String(id))">申请添加</button>
        <p v-for="post in visiblePosts.filter(p => p.accountId === id)" :key="post.id">
          {{ post.time }} · {{ post.content }}
        </p>
      </div>
    </details>
    <details>
      <summary>消息与动态历史</summary>
      <input v-model="author" placeholder="人物或账号称呼" /><label>从<input v-model="fromDate" type="date" /></label
      ><label>至<input v-model="toDate" type="date" /></label>
      <div v-for="m in historyPage" :key="m.id" class="record">
        <span>{{ m.senderName }} · {{ m.time }}</span>
        <p v-for="b in m.blocks" :key="b.id">{{ b.content ?? b.desc ?? b.type }}</p>
      </div>
      <button :disabled="historyIndex === 0" @click="historyIndex--">上一页</button
      ><span>{{ historyIndex + 1 }} / {{ historyPages }}</span
      ><button :disabled="historyIndex + 1 >= historyPages" @click="historyIndex++">下一页</button>
    </details>
  </details>
</template>
<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { useWorldState } from '../../utils/context';
import { RuntimeKey, type Runtime } from '../../../../运行/host';
import { phoneProjection, visiblePhoneSummaries, timeText, blockText, byNewest } from '../../../../运行/phone';
import { managePhone } from '../../../../运行/phone-management';
const state = useWorldState(),
  runtime = inject<Runtime | null>(RuntimeKey, null),
  error = ref(''),
  search = ref(''),
  noticePage = ref(0);
const author = ref(''),
  fromDate = ref(''),
  toDate = ref(''),
  historyIndex = ref(0);
const newPlatform = ref('邻信'),
  newAccount = ref('');
const inviteAccount = ref(''),
  groupInvitation = ref('');
const visiblePosts = computed(() => [
  ...phoneProjection(state.value).posts,
  ...phoneProjection(state.value, '微澜').posts,
]);
const self = computed(() => phoneProjection(state.value).account);
const summaries = computed(() =>
  Object.fromEntries(
    Object.entries(visiblePhoneSummaries(state.value)).filter(([, s]) => s.内容?.includes(search.value)),
  ),
);
const accountName = (id: string) =>
  state.value.手机.账号[id]?.昵称 ?? state.value.手机.账号[id]?.账号名 ?? '账号资料未知';
const contentName = (id: string) =>
  blockText(state.value.手机.原文.消息[id]?.内容块 ?? state.value.手机.原文.帖子[id]?.内容块 ?? []) || '来源内容不可用';
const applications = computed(() =>
  Object.fromEntries(
    Object.entries(state.value.手机.申请).filter(
      ([, a]: any) => a.发起账号id === self.value || a.目标账号id === self.value,
    ),
  ),
);
const contacts = computed(() =>
  Object.fromEntries(Object.entries(state.value.手机.联系人).filter(([, c]: any) => c.本人账号id === self.value)),
);
const groups = computed(() =>
  Object.fromEntries(
    Object.entries(state.value.手机.群).filter(([, g]: any) =>
      Object.values(g.成员[self.value ?? '']?.成员区间 ?? {}).some((i: any) => i.离开时间 === null),
    ),
  ),
);
const notifications = computed(() =>
  Object.fromEntries(
    Object.entries(state.value.手机._通知)
      .reverse()
      .slice(noticePage.value * 50, (noticePage.value + 1) * 50),
  ),
);
const accounts = computed(() =>
  Object.fromEntries(
    Object.entries(state.value.手机.账号).filter(
      ([id, a]: any) =>
        (a.人物id === state.value.玩家.id ||
          visiblePosts.value.some(p => p.accountId === id) ||
          Object.values(contacts.value).some((c: any) => c.对方账号id === id) ||
          Object.hasOwn(state.value.玩家.已知信息.已知账号, id)) &&
        [a.昵称, a.账号名, a.简介].some(v => String(v ?? '').includes(search.value)),
    ),
  ),
);
const history = computed(() => {
  const messages = Object.values(phoneProjection(state.value, '邻信', true).messagesMap).flat();
  const posts = [
    ...phoneProjection(state.value, '邻信', true).posts,
    ...phoneProjection(state.value, '微澜', true).posts,
  ].map(p => ({
    id: p.id,
    故事时间: p.故事时间,
    _顺序: p._顺序,
    senderName: p.authorName,
    time: p.time,
    blocks: [
      { id: p.id, content: p.content },
      ...p.comments.map(c => ({ id: c.id, content: c.author + '：' + c.text })),
    ],
  }));
  return [...messages, ...posts]
    .filter(m => {
      const t = m.故事时间,
        date = t
          ? `${String(t.年).padStart(4, '0')}-${String(t.月).padStart(2, '0')}-${String(t.日).padStart(2, '0')}`
          : '';
      return (
        JSON.stringify(m).includes(search.value) &&
        m.senderName.includes(author.value) &&
        (!fromDate.value || date >= fromDate.value) &&
        (!toDate.value || (!!date && date <= toDate.value))
      );
    })
    .sort(byNewest);
});
const historyPages = computed(() => Math.max(1, Math.ceil(history.value.length / 20))),
  historyPage = computed(() => history.value.slice(historyIndex.value * 20, (historyIndex.value + 1) * 20));
watch([search, author, fromDate, toDate], () => (historyIndex.value = 0));
watch(historyPages, n => (historyIndex.value = Math.min(historyIndex.value, n - 1)));
async function run(op: string, id: string, value?: string) {
  if (!runtime) {
    error.value = '离线展示不保存';
    return;
  }
  try {
    await runtime.commit(s => managePhone(s, op, id, value));
    error.value = '';
  } catch (e) {
    error.value = String(e);
  }
}
function remark(id: string) {
  const value = prompt('联系人备注');
  if (value !== null) run('remark', id, value);
}
async function inviteGroup() {
  if (!runtime || !inviteAccount.value || !groupInvitation.value.trim()) {
    error.value = '请选择联系人并填写邀约';
    return;
  }
  const session = Object.entries(state.value.手机.会话).find(
    ([, c]: any) =>
      c.类型 === '私聊' && c.参与账号id.includes(self.value) && c.参与账号id.includes(inviteAccount.value),
  );
  if (!session) {
    error.value = '尚无可发送邀约的私聊';
    return;
  }
  try {
    await runtime.phoneAction({
      kind: 'send',
      id: session[0],
      text: '群组邀约：' + groupInvitation.value + '。请按双方意愿决定，接受后再创建或加入群组。',
    });
    groupInvitation.value = '';
    error.value = '';
  } catch (e) {
    error.value = String(e);
  }
}
</script>
<style scoped>
.cw-phone-records {
  flex-shrink: 0;
  max-height: 180px;
  overflow: auto;
  padding: 8px;
  background: var(--cw-bg-panel);
  color: var(--cw-text-primary);
  font-size: 12px;
}
.record {
  padding: 8px;
  border-bottom: 1px solid var(--cw-border);
  overflow-wrap: anywhere;
}
button {
  margin: 4px;
  padding: 4px;
  background: var(--cw-bg-surface);
  color: var(--cw-text-primary);
  border: 1px solid var(--cw-border);
  border-radius: 4px;
}
</style>
