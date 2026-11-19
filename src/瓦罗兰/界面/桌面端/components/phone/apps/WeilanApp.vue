<template>
  <div class="cw-weilan-app">
    <button v-if="actionError && actionError !== runtime?.view.error" class="cw-app-feedback" title="点击关闭提示" @click="actionError = ''"><span role="alert">{{ actionError }}</span><SvgIcon name="close" :size="12" /></button>
    <!-- 顶栏 -->
    <div class="cw-app-header">
      <div class="cw-header-left">
        <button class="cw-btn-icon" @click="emit('back')">
          <SvgIcon name="chevronLeft" :size="20" />
        </button>
        <span class="cw-header-title">微澜社区</span>
      </div>
      <div class="cw-header-right">
        <!-- 专设通知中心入口 (F18) -->
        <button
          class="cw-btn-icon cw-notice-btn"
          :title="`互动通知 (${unreadNoticesCount}未读)`"
          @click="showNotices = !showNotices"
        >
          <SvgIcon name="bell" :size="18" />
          <span v-if="unreadNoticesCount > 0" class="cw-badge-dot"></span>
        </button>
        <button class="cw-btn-icon" title="刷新微澜" @click="action({ kind: 'refresh', text: '微澜发现' })">
          <SvgIcon name="refreshCw" :size="18" />
        </button>
        <button class="cw-btn-icon" title="发微澜" @click="triggerNewPost">
          <SvgIcon name="edit" :size="18" />
        </button>
      </div>
    </div>

    <!-- 未建立账号提示横幅 (F19) -->
    <div v-if="!projection.account" class="cw-no-account-card">
      <div class="cw-no-acc-info">
        <SvgIcon name="info" :size="16" />
        <span>尚未开通微澜账号</span>
      </div>
      <p class="cw-no-acc-desc">开通微澜账号即可发布城市动态、关注市民动态并参与热门话题讨论。</p>
      <button class="cw-btn cw-btn-primary cw-btn-xs" @click="quickCreateAccount">一键开通微澜</button>
    </div>

    <!-- 通知中心抽屉 (F18: 真实解析评论通知来源，杜绝误报) -->
    <div v-if="showNotices" class="cw-notices-drawer">
      <div class="cw-drawer-header">
        <div style="display: flex; align-items: center; gap: 6px;">
          <SvgIcon name="bell" :size="16" />
          <span class="cw-drawer-title">通知中心 ({{ notificationsList.length }})</span>
        </div>
        <button class="cw-btn-icon" @click="showNotices = false">
          <SvgIcon name="close" :size="16" />
        </button>
      </div>

      <div class="cw-notices-list">
        <div v-for="n in notificationsList" :key="n.id" class="cw-notice-item">
          <div class="cw-notice-top">
            <span class="cw-badge cw-badge-sm">{{ n.类型 || '通知' }}</span>
            <span class="cw-notice-time">{{ n.timeText }}</span>
          </div>
          <p class="cw-notice-content">{{ n.detailText }}</p>
          <div class="cw-notice-actions">
            <button
              v-if="!n.已读"
              class="cw-btn cw-btn-ghost cw-btn-xs"
              @click="markNoticeRead(n.id)"
            >
              标为已读
            </button>
          </div>
        </div>

        <div v-if="notificationsList.length === 0" class="cw-empty-compact" style="margin: 20px 0;">
          <SvgIcon name="bell" :size="16" class="cw-empty-icon" />
          <span>暂无新的互动通知</span>
        </div>
      </div>
    </div>

    <!-- 顶部流切换：热门 / 关注 -->
    <div class="cw-stream-tabs">
      <button class="cw-stream-btn" :class="{ active: currentStream === 'hot' }" @click="currentStream = 'hot'">
        热门发现
      </button>
      <button
        class="cw-stream-btn"
        :class="{ active: currentStream === 'following' }"
        @click="currentStream = 'following'"
      >
        特别关注
      </button>
    </div>

    <!-- 现代一体化探索搜索栏 -->
    <div class="cw-weilan-search-section">
      <div class="cw-search-main-row">
        <!-- 搜索输入主胶囊 -->
        <div class="cw-search-input-box">
          <SvgIcon name="compass" :size="15" class="cw-search-icon-lead" />
          <input
            v-model="searchDraft"
            placeholder="搜索动态、话题，或输入探索需求..."
            class="cw-search-text-input"
            aria-label="搜索微澜或输入生成需求"
            @compositionstart="isComposing = true"
            @compositionend="onCompositionEnd"
            @keydown.enter="onSearchEnter"
          />
          <button v-if="searchDraft" class="cw-search-clear-btn" title="清除输入" @click="clearSearch">×</button>
          <button
            class="cw-search-submit-btn"
            :class="{ active: search && search === searchDraft.trim(), highlight: searchDraft.trim() && searchDraft.trim() !== search }"
            title="在已有内容中搜索"
            @click="performLocalSearch"
          >
            搜索
          </button>
        </div>

        <!-- AI 探索生成胶囊按钮 -->
        <button
          class="cw-demand-generate-pill"
          :class="{ active: searchDraft.trim() }"
          :disabled="!searchDraft.trim() || isGenerating || runtime?.view.busy || runtime?.view.updating"
          :title="searchDraft.trim() ? `提交需求并生成动态：“${searchDraft.trim()}”` : '输入探索需求后点击生成'"
          @click="generateByDemand"
        >
          <SvgIcon name="refresh" :size="13" :class="{ 'cw-task-spin': isGenerating }" />
          <span>{{ isGenerating ? '生成中…' : '探索生成' }}</span>
        </button>
      </div>

      <!-- 当前筛选状态浮条（当处于筛选状态时） -->
      <div v-if="search" class="cw-search-filter-status">
        <div class="cw-filter-info">
          <span class="cw-filter-tag">#筛选</span>
          <span class="cw-filter-kw" :title="search">“{{ search }}”</span>
          <span class="cw-filter-count">({{ activePosts.length }}条结果)</span>
        </div>
        <button class="cw-filter-reset-btn" title="清除筛选条件" @click="clearSearch">
          清除筛选
        </button>
      </div>

      <!-- 热门话题快选胶囊（未处于搜索状态时展示） -->
      <div v-else-if="topics.length > 0" class="cw-explore-topics-bar">
        <span class="cw-topics-label">
          <SvgIcon name="sparkles" :size="11" />
          <span>热点:</span>
        </span>
        <div class="cw-topics-pills-list">
          <button
            v-for="t in topics"
            :key="t"
            class="cw-topic-quick-pill"
            @click="filterByTopic(t)"
          >
            #{{ t }}
          </button>
        </div>
      </div>
    </div>

    <!-- 生成成功提示横幅 -->
    <div v-if="generationNotice" class="cw-generation-banner">
      <SvgIcon name="checkCircle" :size="14" />
      <span>{{ generationNotice }}</span>
      <button class="cw-btn-close-notice" title="关闭" @click="generationNotice = ''">×</button>
    </div>

    <button v-if="newPosts" class="cw-new-msg-btn" @click="latestPost">{{ newPosts }} 条新动态，点击查看</button>
    
    <div ref="feedViewport" class="cw-weilan-feed" :class="{ 'cw-feed-empty': activePosts.length === 0 }">
      <div v-for="post in activePosts" :key="post.id" :data-feed-id="post.id" class="cw-weilan-post-card">
        <div class="cw-post-header">
          <div class="cw-post-author-avatar">
            <CharacterAvatar :name="post.authorName" :size="36" />
          </div>
          <div class="cw-post-meta">
            <div class="cw-author-row">
              <span class="cw-author-name" :title="post.authorName">{{ post.authorName }}</span>
              <span class="cw-author-handle" :title="'@' + post.handle">@{{ post.handle }}</span>
            </div>
            <span class="cw-post-time">{{ post.time }}</span>
          </div>
          <button v-if="post.accountId !== projection.account" class="cw-btn-follow" @click="follow(post)">
            {{ post.isFollowing ? '已关注' : '+ 关注' }}
          </button>
          <template v-else>
            <button class="cw-action-link" @click="managePost('editPost', post)">编辑</button>
            <button class="cw-action-link" @click="managePost('deletePost', post)">删除</button>
          </template>
        </div>

        <p class="cw-post-body">{{ post.content }}</p>

        <!-- 帖子配图 -->
        <div v-if="post.images && post.images.length > 0" class="cw-post-pics">
          <div v-for="(pic, pidx) in post.images" :key="pidx" class="cw-pic-card">
            <SvgIcon name="image" :size="20" />
            <span>{{ pic }}</span>
          </div>
        </div>

        <!-- 每篇文章只显示它自己的话题标签，放在文章内容下方、互动操作上方 -->
        <div v-if="post.topics && post.topics.length > 0" class="cw-post-topics">
          <button
            v-for="topic in post.topics"
            :key="topic"
            class="cw-post-topic-tag"
            title="点击按此话题本地筛选"
            @click="filterByTopic(topic)"
          >
            #{{ topic }}
          </button>
        </div>

        <!-- 互动操作底栏：转发、评论、点赞 -->
        <div class="cw-post-actions-bar">
          <button class="cw-action-item" @click="openRepostBar(post)">
            <SvgIcon name="share2" :size="14" />
            <span>{{ post.reposts || 0 }}</span>
          </button>
          <button class="cw-action-item" @click="toggleComments(post.id)">
            <SvgIcon name="messageSquare" :size="14" />
            <span>{{ post.comments?.length || 0 }}</span>
          </button>
          <button class="cw-action-item" :class="{ liked: post.isLiked }" @click="toggleLike(post)">
            <SvgIcon name="heart" :size="14" />
            <span>{{ post.likes || 0 }}</span>
          </button>
        </div>

        <!-- 内联转发输入条 (F31: 替代原生 prompt) -->
        <div v-if="repostTargetId === post.id" class="cw-inline-repost-bar">
          <input
            v-model="repostDraft"
            placeholder="写下转发附言 (例如：转发打卡)..."
            class="cw-c-input"
            @keydown.enter="submitRepost(post)"
          />
          <button class="cw-btn cw-btn-primary cw-btn-xs" @click="submitRepost(post)">转发</button>
          <button class="cw-btn cw-btn-ghost cw-btn-xs" @click="repostTargetId = null">取消</button>
        </div>

        <!-- 评论列表展开 -->
        <div v-if="expandedPostId === post.id" class="cw-post-comments-tray">
          <div class="cw-comment-input-row">
            <input
              v-model="commentDraft"
              :placeholder="replyTargetCommentId ? '回复此评论...' : '写一条善意的评论...'"
              class="cw-c-input"
              @keydown.enter="onCommentEnter($event, post)"
            />
            <button class="cw-btn cw-btn-primary cw-btn-xs" :disabled="!commentDraft.trim() || isSubmittingComment || runtime?.view.busy || runtime?.view.updating" @click="submitComment(post)">
              {{ replyTargetCommentId ? '回复' : '评论' }}
            </button>
            <button v-if="replyTargetCommentId" class="cw-btn cw-btn-ghost cw-btn-xs" @click="replyTargetCommentId = null">取消回复</button>
          </div>

          <div v-if="post.comments && post.comments.length > 0" class="cw-comments-thread">
            <PhoneComments :comments="post.comments" @reply="id => handleReplyTarget(post.id, id)" />
          </div>
          <div v-else class="cw-empty-compact">
            <SvgIcon name="messageSquare" :size="13" class="cw-empty-icon" />
            <span>暂无评论，快来抢沙发</span>
          </div>
        </div>
      </div>

      <!-- 区分背景板空态 (规范设计要求) -->
      <div v-if="activePosts.length === 0" class="cw-empty-backdrop">
        <template v-if="search">
          <div class="cw-empty-graphic">
            <SvgIcon name="search" :size="38" />
          </div>
          <div class="cw-empty-title">未搜索到相关动态</div>
          <div class="cw-empty-desc">社区已有内容中暂未匹配到与“{{ search }}”相关的文章。</div>
          <div class="cw-empty-actions">
            <button
              class="cw-btn cw-btn-primary cw-btn-sm"
              :disabled="isGenerating || runtime?.view.busy || runtime?.view.updating"
              @click="generateByDemand"
            >
              <SvgIcon name="refresh" :size="13" :class="{ 'cw-task-spin': isGenerating }" />
              <span>按此需求生成社区文章</span>
            </button>
            <button class="cw-btn cw-btn-ghost cw-btn-sm" @click="clearSearch">
              清除搜索
            </button>
          </div>
        </template>
        <template v-else-if="currentStream === 'following'">
          <div class="cw-empty-graphic">
            <SvgIcon name="userCheck" :size="38" />
          </div>
          <div class="cw-empty-title">尚未特别关注市民</div>
          <div class="cw-empty-desc">您尚未在微澜关注任何市民，可在「热门发现」中寻找感兴趣的人点击关注。</div>
          <div class="cw-empty-actions">
            <button class="cw-btn cw-btn-ghost cw-btn-sm" @click="currentStream = 'hot'">
              前往热门发现
            </button>
          </div>
        </template>
        <template v-else>
          <div class="cw-empty-graphic">
            <SvgIcon name="compass" :size="38" />
          </div>
          <div class="cw-empty-title">微澜广场暂无动态</div>
          <div class="cw-empty-desc">当前暂无社区动态，您可以发布第一条或在上方输入需求生成。</div>
          <div class="cw-empty-actions">
            <button class="cw-btn cw-btn-primary cw-btn-sm" @click="compose = true">
              发布第一条动态
            </button>
          </div>
        </template>
      </div>
    </div>
    <PhoneComposer v-if="compose" kind="post" platform="微澜" @close="compose = false" @submit="submitComposition" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, watch } from 'vue';
import { useWorldState } from '../../../utils/context';
import { phoneProjection, phoneNotificationPlatform, blockText, timeText } from '../../../../../运行/phone';
import { managePhone } from '../../../../../运行/phone-management';
import { RuntimeKey, type Runtime } from '../../../../../运行/host';
import { useStableFeed } from '../../../utils/stable-feed';
import SvgIcon from '../../icons/SvgIcon.vue';
import CharacterAvatar from '../../shared/CharacterAvatar.vue';
import PhoneComposer from '../PhoneComposer.vue';
import PhoneComments from '../PhoneComments.vue';

const state = useWorldState();
const runtime = inject<Runtime | null>(RuntimeKey, null);
const projection = computed(() => phoneProjection(state.value, '微澜'));
const actionError = ref('');
async function action(a: any) {
  if (!runtime) {
    actionError.value = '离线展示不写入存档';
    return false;
  }
  try {
    await runtime.phoneAction({ ...a, platform: '微澜' });
    actionError.value = '';
    return true;
  } catch (e) {
    actionError.value = String(e);
    return false;
  }
}

const searchDraft = ref('');
const search = ref('');
const isComposing = ref(false);
const isGenerating = ref(false);
interface DemandSession {
  demand: string;
  postIds: Set<string>;
}
const activeDemandSession = ref<DemandSession | null>(null);
const generationNotice = ref('');
let searchRevision = 0;

function performLocalSearch() {
  const query = searchDraft.value.trim();
  if (query.toLowerCase() !== search.value.trim().toLowerCase()) {
    activeDemandSession.value = null;
    generationNotice.value = '';
  }
  search.value = query;
}

function clearSearch() {
  searchDraft.value = '';
  search.value = '';
  activeDemandSession.value = null;
  generationNotice.value = '';
}

function onCompositionEnd() {
  isComposing.value = false;
}

function onSearchEnter() {
  if (isComposing.value) return;
  performLocalSearch();
}

function filterByTopic(topic: string) {
  searchDraft.value = topic;
  performLocalSearch();
}

async function generateByDemand() {
  const demand = searchDraft.value.trim() || search.value.trim();
  if (!demand) return;
  if (isGenerating.value || runtime?.view.busy || runtime?.view.updating) return;
  isGenerating.value = true;
  actionError.value = '';
  generationNotice.value = '';
  const existingIds = new Set(posts.value.map(p => p.id));
  const originatedStream = currentStream.value;
  const revision = searchRevision;
  try {
    const ok = await action({
      kind: 'refresh',
      platform: '微澜',
      text: `按玩家需求生成微澜社区文章：${demand}`,
      demand,
    });
    if (ok) {
      const newIds = posts.value.filter(p => !existingIds.has(p.id)).map(p => p.id);
      if (searchRevision !== revision) {
        generationNotice.value = newIds.length
          ? `已按“${demand}”生成 ${newIds.length} 条文章，当前筛选已保留。`
          : '本次未新增可展示的社区文章，当前筛选已保留。';
        return;
      }
      activeDemandSession.value = newIds.length ? {
        demand,
        postIds: new Set(newIds),
      } : null;
      search.value = demand;
      searchDraft.value = demand;

      // 在“特别关注”中生成后，由于新文章作者并未特别关注，自动切换到“热门发现”流，并提示用户
      if (newIds.length === 0) {
        generationNotice.value = '本次未新增可展示的社区文章，可调整需求后重试。';
      } else if (originatedStream === 'following') {
        currentStream.value = 'hot';
        generationNotice.value = `已生成 ${newIds.length} 条与“${demand}”相关的文章，并自动切换至「热门发现」流供浏览`;
      } else {
        generationNotice.value = `已成功按需求生成 ${newIds.length} 条社区文章`;
      }
    }
  } finally {
    isGenerating.value = false;
  }
}

const topics = computed(() => {
  const counts = new Map<string, number>();
  for (const post of posts.value) for (const topic of new Set<string>(post.topics))
    counts.set(topic, (counts.get(topic) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([topic]) => topic);
});
const compose = ref(false);
async function submitComposition(value: any) {
  if (await action({ kind: 'post', ...value })) compose.value = false;
}

const props = defineProps<{
  player: any;
  phoneData?: any;
}>();

const emit = defineEmits<{
  (e: 'back'): void;
}>();

const currentStream = ref<'hot' | 'following'>('hot');
const expandedPostId = ref<string | null>(null);
const commentDraft = ref('');
watch([searchDraft, search, currentStream], () => { searchRevision++; }, { flush: 'sync' });

// 快速开通账号 (F19)
async function quickCreateAccount() {
  if (!runtime) {
    actionError.value = '离线预览模式无法写入存档';
    return;
  }
  try {
    const accName = props.player?.姓名 || '瓦罗兰市民';
    await runtime.commit(s => managePhone(s, 'createAccount', '微澜', accName));
    actionError.value = '';
  } catch (e) {
    actionError.value = String(e);
  }
}

// 通知中心 (F18: 真实解析评论通知来源，杜绝误报)
const showNotices = ref(false);

const notificationsList = computed(() => {
  const notices = state.value?.手机?._通知 || {};
  const raw = state.value?.手机?.原文 || {};
  const accounts = state.value?.手机?.账号 || {};

  return Object.entries(notices)
    .filter(([, notice]: any) => phoneNotificationPlatform(state.value, notice) === '微澜')
    .reverse()
    .map(([id, n]: any) => {
      const ids = n.内容id || [];
      const detailParts: string[] = [];
      for (const cid of ids) {
        const comm = raw.评论?.[cid];
        if (comm) {
          const parentPost = raw.帖子?.[comm.帖子id];
          const parentSnippet = parentPost ? `「${blockText(parentPost.内容块).slice(0, 16)}...」` : '';
          const author = accounts[comm.评论账号id]?.昵称 || comm.评论者称呼 || '市民';
          detailParts.push(`${author} 回复了您的动态${parentSnippet}：${blockText(comm.内容块)}`);
          continue;
        }
        const post = raw.帖子?.[cid];
        if (post) {
          detailParts.push(`新动态发布：${blockText(post.内容块).slice(0, 24)}`);
          continue;
        }
        const msg = raw.消息?.[cid];
        if (msg) {
          detailParts.push(`新私信：${blockText(msg.内容块).slice(0, 24)}`);
          continue;
        }
      }
      return {
        id,
        ...n,
        timeText: timeText(n.时间),
        detailText: detailParts.join('； ') || '收到新的微澜互动提醒',
      };
    });
});

const unreadNoticesCount = computed(() => {
  return notificationsList.value.filter(n => !n.已读).length;
});

async function markNoticeRead(id: string) {
  if (!runtime) return;
  try {
    await runtime.commit(s => managePhone(s, 'readNotification', id));
  } catch (e) {
    actionError.value = String(e);
  }
}

const posts = computed(() => projection.value.posts);

const activePosts = computed(() => {
  let list = posts.value;
  if (currentStream.value === 'following') {
    list = list.filter(p => p.isFollowing);
  }
  const q = search.value.trim().toLowerCase();
  if (!q) return list;

  // 严格关联：仅当当前搜索关键词与生成需求的会话相匹配时，才关联需求生成的文章
  const isCurrentDemand =
    activeDemandSession.value &&
    q === activeDemandSession.value.demand.toLowerCase().trim();

  return list.filter(p => {
    if (isCurrentDemand && activeDemandSession.value?.postIds.has(p.id)) return true;
    const author = (p.authorName || '').toLowerCase();
    const handle = (p.handle || '').toLowerCase();
    const content = (p.content || '').toLowerCase();
    const topicsText = (p.topics || []).join(' ').toLowerCase();
    const combined = `${author} @${handle} ${topicsText} ${content}`;
    if (combined.includes(q)) return true;

    const tokens = q.split(/[\s,，、。！!？?#]+/).filter(t => t.length > 0);
    if (tokens.length && tokens.some(t => combined.includes(t))) return true;
    return false;
  });
});

const {
  viewport: feedViewport,
  pending: newPosts,
  latest: latestPost,
} = useStableFeed(
  () => activePosts.value.map(p => p.id),
  () => currentStream.value + search.value,
);

function toggleComments(postId: string) {
  if (expandedPostId.value !== postId) {
    commentDraft.value = '';
    replyTargetCommentId.value = null;
  }
  if (expandedPostId.value === postId) {
    expandedPostId.value = null;
  } else {
    expandedPostId.value = postId;
  }
}

function toggleLike(post: any) {
  action({ kind: 'like', id: post.id });
}

async function follow(post: any) {
  if (!runtime) {
    actionError.value = '离线展示不保存';
    return;
  }
  try {
    await runtime.commit(s => managePhone(s, 'follow', post.accountId));
    actionError.value = '';
  } catch (e) {
    actionError.value = String(e);
  }
}

// F31: 替代 prompt 的内联转发
const repostTargetId = ref<string | null>(null);
const repostDraft = ref('');

function openRepostBar(post: any) {
  repostTargetId.value = post.id;
  repostDraft.value = '';
}

async function submitRepost(post: any) {
  const target = repostTargetId.value, draft = repostDraft.value;
  const text = repostDraft.value.trim() || '转发动态';
  const ok = await action({ kind: 'repost', id: post.id, text });
  if (ok && repostTargetId.value === target && repostDraft.value === draft) {
    repostTargetId.value = null;
    repostDraft.value = '';
  }
}

// F31: 替代 prompt 的评论回复
const replyTargetCommentId = ref<string | null>(null);
const isSubmittingComment = ref(false);
let commentRevision = 0;
watch([expandedPostId, replyTargetCommentId, commentDraft], () => { commentRevision++; }, { flush: 'sync' });

function handleReplyTarget(postId: string, commentId: string) {
  if (expandedPostId.value !== postId) return;
  replyTargetCommentId.value = commentId;
}

async function submitComment(post: any) {
  if (!commentDraft.value.trim() || isSubmittingComment.value || expandedPostId.value !== post.id) return;
  const text = commentDraft.value.trim(), replyTo = replyTargetCommentId.value, revision = commentRevision;
  isSubmittingComment.value = true;
  try {
    const ok = await action({ kind: 'comment', id: post.id, replyTo: replyTo ?? undefined, text });
    if (ok && revision === commentRevision) {
      commentDraft.value = '';
      replyTargetCommentId.value = null;
    }
  } finally {
    isSubmittingComment.value = false;
  }
}
function onCommentEnter(event: KeyboardEvent, post: any) {
  if (event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  if (!event.repeat) void submitComment(post);
}

function triggerNewPost() {
  compose.value = true;
}

async function managePost(op: string, post: any) {
  if (!runtime) return;
  const value = op === 'editPost' ? window.prompt('编辑正文（原版本保留）：', post.editableText) : undefined;
  if (op === 'editPost' && (value === null || value === post.editableText)) return;
  if (op === 'deletePost' && !confirm('删除本人的微澜动态？已投递的引用保留。')) return;
  try {
    await runtime.commit(s => managePhone(s, op, post.id, value ?? undefined));
    actionError.value = '';
  } catch (e) {
    actionError.value = String(e);
  }
}
</script>

<style scoped lang="scss">
.cw-app-feedback { position: absolute; z-index: 55; top: 52px; left: 10px; right: 10px; display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border: 1px solid var(--cw-border); border-radius: var(--cw-radius); background: var(--cw-bg-surface); color: var(--cw-danger); box-shadow: var(--cw-shadow-sm); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
.cw-app-feedback span { flex: 1; max-height: 80px; overflow-y: auto; overflow-wrap: anywhere; }
.cw-weilan-app {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--cw-bg-main);
  overflow: hidden;
}

.cw-app-header {
  height: 48px;
  background: var(--cw-bg-surface);
  border-bottom: 1px solid var(--cw-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  user-select: none;

  .cw-header-left,
  .cw-header-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .cw-header-title {
    font-size: 15px;
    font-weight: 600;
  }
}

.cw-btn-icon {
  background: none;
  border: none;
  color: var(--cw-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  cursor: pointer;

  &:hover {
    color: var(--cw-text-primary);
  }
}

.cw-stream-tabs {
  display: flex;
  background: var(--cw-bg-surface);
  border-bottom: 1px solid var(--cw-border);
  padding: 4px 12px;
  gap: 8px;

  .cw-stream-btn {
    flex: 1;
    padding: 7px 0;
    background: none;
    border: none;
    font-size: 13px;
    font-weight: 500;
    color: var(--cw-text-secondary);
    cursor: pointer;
    border-radius: var(--cw-radius-full);
    transition: all 0.15s ease;

    &:hover {
      color: var(--cw-text-primary);
      background: var(--cw-bg-card-subtle);
    }

    &.active {
      color: #ff5500;
      background: rgba(255, 85, 0, 0.08);
      font-weight: 700;
    }
  }
}

.cw-weilan-feed {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;

  &.cw-feed-empty {
    padding: 0;
    gap: 0;
  }
}

.cw-weilan-post-card {
  padding: 14px;
  border-radius: var(--cw-radius, 12px);
  background: var(--cw-bg-surface);
  border: 1px solid var(--cw-border);
  box-shadow: var(--cw-shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: all 0.15s ease;

  &:hover {
    border-color: rgba(255, 85, 0, 0.25);
  }

  .cw-post-header {
    display: flex;
    align-items: center;
    gap: 10px;

    .cw-post-author-avatar {
      width: 38px;
      height: 38px;
      border-radius: var(--cw-radius-full);
      background: var(--cw-bg-card-subtle);
      border: 1px solid var(--cw-border);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--cw-text-secondary);
      flex-shrink: 0;
    }

    .cw-post-meta {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;

      .cw-author-row {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 1px;
        min-width: 0;

        .cw-author-name {
          font-size: 13.5px;
          font-weight: 700;
          color: var(--cw-text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 100%;
        }
        .cw-author-handle {
          font-size: 11px;
          color: var(--cw-text-muted);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 100%;
        }
      }

      .cw-post-time {
        font-size: 11px;
        color: var(--cw-text-muted);
        white-space: nowrap;
      }
    }

    .cw-btn-follow {
      flex-shrink: 0;
      padding: 3px 12px;
      font-size: 11px;
      font-weight: 600;
      border-radius: var(--cw-radius-full);
      border: 1px solid rgba(255, 85, 0, 0.4);
      background: rgba(255, 85, 0, 0.08);
      color: #ff5500;
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover {
        background: #ff5500;
        color: #ffffff;
      }
    }
  }

  .cw-post-body {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.6;
    color: var(--cw-text-primary);
  }

  .cw-post-pics {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;

    .cw-pic-card {
      padding: 10px 14px;
      border-radius: var(--cw-radius-sm);
      background: var(--cw-bg-card-subtle);
      border: 1px solid var(--cw-border);
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--cw-text-secondary);
    }
  }

  .cw-post-actions-bar {
    display: flex;
    justify-content: space-around;
    padding-top: 8px;
    border-top: 1px solid var(--cw-border);

    .cw-action-item {
      display: flex;
      align-items: center;
      gap: 5px;
      background: none;
      border: none;
      color: var(--cw-text-muted);
      font-size: 12px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      transition: all 0.15s ease;

      &:hover {
        color: #ff5500;
        background: rgba(255, 85, 0, 0.05);
      }
      &.liked {
        color: #ff5500;
        font-weight: 600;
      }
    }
  }

  .cw-post-comments-tray {
    padding-top: 10px;
    border-top: 1px dashed var(--cw-border);
    display: flex;
    flex-direction: column;
    gap: 8px;

    .cw-comment-input-row {
      display: flex;
      gap: 8px;

      .cw-c-input {
        flex: 1;
        padding: 5px 10px;
        border-radius: var(--cw-radius-sm);
        border: 1px solid var(--cw-border);
        background: var(--cw-bg-input);
        font-size: 12px;
        outline: none;

        &:focus {
          border-color: var(--cw-accent);
        }
      }
    }

    .cw-comments-thread {
      display: flex;
      flex-direction: column;
      gap: 6px;
      background: var(--cw-bg-card-subtle);
      padding: 8px 10px;
      border-radius: var(--cw-radius-sm);
      font-size: 12px;

      .cw-thread-item {
        .cw-th-user {
          font-weight: 600;
          color: var(--cw-text-secondary);
        }
        .cw-th-text {
          color: var(--cw-text-primary);
        }
      }
    }
  }
}

.cw-empty-sub {
  font-size: 12px;
  color: var(--cw-text-muted);
  text-align: center;
  padding: 8px 0;
}

.cw-empty-backdrop {
  flex: 1;
  width: 100%;
  min-height: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 32px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  border: none;
  border-radius: 0;
  background: transparent;

  .cw-empty-graphic {
    color: var(--cw-text-muted);
    opacity: 0.35;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cw-empty-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--cw-text-secondary);
    margin-bottom: 6px;
  }

  .cw-empty-desc {
    font-size: 12px;
    color: var(--cw-text-muted);
    line-height: 1.6;
    max-width: 280px;
  }

  .cw-empty-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 14px;
  }
}

.cw-empty-compact {
  width: 100%;
  padding: 12px 14px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: none;
  background: transparent;
  color: var(--cw-text-muted);
  font-size: 12px;

  .cw-empty-icon {
    opacity: 0.5;
    flex-shrink: 0;
  }
}

.cw-generation-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--cw-accent-bg);
  color: var(--cw-accent);
  border-bottom: 1px solid var(--cw-border);
  font-size: 12px;
  flex-shrink: 0;

  span {
    flex: 1;
    min-width: 0;
  }

  .cw-btn-close-notice {
    background: none;
    border: none;
    color: var(--cw-accent);
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    padding: 0 4px;
    opacity: 0.7;

    &:hover {
      opacity: 1;
    }
  }
}

.cw-no-account-card {
  padding: 14px;
  margin: 12px;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card);
  border: 1px dashed var(--cw-border-hover);
  display: flex;
  flex-direction: column;
  gap: 6px;

  .cw-no-acc-info {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--cw-accent);
  }
  .cw-no-acc-desc {
    margin: 0;
    font-size: 12px;
    color: var(--cw-text-secondary);
    line-height: 1.4;
  }
}

.cw-notices-drawer {
  position: absolute;
  inset: 0;
  z-index: 50;
  background: var(--cw-bg-surface);
  display: flex;
  flex-direction: column;

  .cw-drawer-header {
    height: 48px;
    padding: 0 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--cw-border);
    background: var(--cw-bg-card-subtle);

    .cw-drawer-title {
      font-size: 14px;
      font-weight: 600;
    }
  }

  .cw-notices-list {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;

    .cw-notice-item {
      padding: 10px 12px;
      border-radius: var(--cw-radius-sm);
      background: var(--cw-bg-card);
      border: 1px solid var(--cw-border);
      display: flex;
      flex-direction: column;
      gap: 6px;

      .cw-notice-top {
        display: flex;
        align-items: center;
        justify-content: space-between;

        .cw-notice-time {
          font-size: 11px;
          color: var(--cw-text-muted);
        }
      }

      .cw-notice-content {
        margin: 0;
        font-size: 12px;
        color: var(--cw-text-primary);
        line-height: 1.5;
      }

      .cw-notice-actions {
        display: flex;
        justify-content: flex-end;
      }
    }
  }
}

.cw-weilan-search-section {
  padding: 8px 12px;
  background: var(--cw-bg-surface);
  border-bottom: 1px solid var(--cw-border);
  display: flex;
  flex-direction: column;
  gap: 6px;

  .cw-search-main-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .cw-search-input-box {
    flex: 1;
    min-width: 0;
    height: 34px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 4px 0 10px;
    border-radius: var(--cw-radius-full);
    background: var(--cw-bg-input, var(--cw-bg-main));
    border: 1px solid var(--cw-border);
    transition: all 0.2s ease;

    &:focus-within {
      border-color: #ff5500;
      box-shadow: 0 0 0 2px rgba(255, 85, 0, 0.15);
      background: var(--cw-bg-surface);
    }

    .cw-search-icon-lead {
      color: var(--cw-text-muted);
      flex-shrink: 0;
    }

    .cw-search-text-input {
      flex: 1;
      min-width: 0;
      border: none;
      background: transparent;
      outline: none;
      font-size: 12px;
      color: var(--cw-text-primary);

      &::placeholder {
        color: var(--cw-text-muted);
        opacity: 0.8;
      }
    }

    .cw-search-clear-btn {
      border: none;
      background: transparent;
      color: var(--cw-text-muted);
      cursor: pointer;
      font-size: 14px;
      padding: 0 4px;
      line-height: 1;
      flex-shrink: 0;

      &:hover {
        color: var(--cw-text-primary);
      }
    }

    .cw-search-submit-btn {
      height: 24px;
      padding: 0 10px;
      border-radius: var(--cw-radius-full);
      border: 1px solid transparent;
      background: var(--cw-bg-card-subtle);
      color: var(--cw-text-secondary);
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      flex-shrink: 0;
      transition: all 0.15s ease;

      &:hover {
        color: #ff5500;
        background: rgba(255, 85, 0, 0.08);
      }

      &.highlight {
        color: #ff5500;
        border-color: rgba(255, 85, 0, 0.3);
        background: rgba(255, 85, 0, 0.08);
      }

      &.active {
        color: #fff;
        background: #ff5500;
        border-color: #ff5500;
      }
    }
  }

  .cw-demand-generate-pill {
    height: 34px;
    padding: 0 12px;
    border-radius: var(--cw-radius-full);
    border: 1px solid var(--cw-border);
    background: var(--cw-bg-card-subtle);
    color: var(--cw-text-muted);
    font-size: 12px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    white-space: nowrap;

    &:not(:disabled):hover {
      border-color: rgba(255, 85, 0, 0.4);
      color: #ff5500;
      background: rgba(255, 85, 0, 0.08);
      transform: translateY(-1px);
    }

    &.active:not(:disabled) {
      background: linear-gradient(135deg, #ff5500 0%, #ff7733 100%);
      border-color: #ff5500;
      color: #fff;
      box-shadow: 0 2px 8px rgba(255, 85, 0, 0.28);

      &:hover {
        box-shadow: 0 3px 12px rgba(255, 85, 0, 0.4);
        transform: translateY(-1px);
      }
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }
  }

  /* 筛选状态条 */
  .cw-search-filter-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 10px;
    border-radius: var(--cw-radius-sm);
    background: rgba(255, 85, 0, 0.06);
    border: 1px solid rgba(255, 85, 0, 0.18);
    font-size: 11px;

    .cw-filter-info {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;

      .cw-filter-tag {
        font-weight: 700;
        color: #ff5500;
      }
      .cw-filter-kw {
        color: var(--cw-text-primary);
        font-weight: 500;
        max-width: 140px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .cw-filter-count {
        color: var(--cw-text-muted);
      }
    }

    .cw-filter-reset-btn {
      background: none;
      border: none;
      color: #ff5500;
      font-size: 11px;
      cursor: pointer;
      padding: 0;
      font-weight: 500;

      &:hover {
        text-decoration: underline;
      }
    }
  }

  /* 热门推荐话题条 */
  .cw-explore-topics-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 0;
    overflow: hidden;

    .cw-topics-label {
      display: flex;
      align-items: center;
      gap: 3px;
      font-size: 11px;
      color: var(--cw-text-muted);
      flex-shrink: 0;
    }

    .cw-topics-pills-list {
      display: flex;
      align-items: center;
      gap: 6px;
      overflow-x: auto;
      scrollbar-width: none;
      &::-webkit-scrollbar { display: none; }

      .cw-topic-quick-pill {
        background: none;
        border: 1px solid var(--cw-border);
        border-radius: var(--cw-radius-full);
        padding: 1px 8px;
        font-size: 11px;
        color: var(--cw-text-secondary);
        white-space: nowrap;
        cursor: pointer;
        transition: all 0.15s ease;

        &:hover {
          color: #ff5500;
          border-color: rgba(255, 85, 0, 0.4);
          background: rgba(255, 85, 0, 0.05);
        }
      }
    }
  }
}

.cw-post-topics {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;

  .cw-post-topic-tag {
    padding: 2px 8px;
    border-radius: var(--cw-radius-full);
    border: 1px solid var(--cw-border);
    background: var(--cw-bg-card-subtle);
    color: #ff5500;
    font-size: 11px;
    cursor: pointer;
    line-height: 1.4;

    &:hover {
      background: rgba(255, 85, 0, 0.08);
      border-color: #ff5500;
    }
  }
}

.cw-c-input {
  flex: 1 1 120px;
  min-width: 0;
  padding: 6px 10px;
  border-radius: var(--cw-radius-sm);
  border: 1px solid var(--cw-border);
  background: var(--cw-bg-surface);
  color: var(--cw-text-primary);
  font-size: 12px;
  outline: none;

  &:focus {
    border-color: #ff5500;
  }
}

.cw-inline-repost-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  padding: 6px 8px;
  border-radius: var(--cw-radius-sm);
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);
  min-width: 0;

  .cw-btn {
    flex-shrink: 0;
  }
}

.cw-comment-input-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
  min-width: 0;

  .cw-btn {
    flex-shrink: 0;
  }
}

[data-theme='dark'] {
  .cw-weilan-search-section {
    .cw-search-input-box {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.1);
    }
    .cw-demand-generate-pill:not(.active) {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.1);
    }
    .cw-search-filter-status {
      background: rgba(255, 85, 0, 0.12);
      border-color: rgba(255, 85, 0, 0.3);
    }
  }
}
</style>
