<template>
  <div class="cw-media-view">
    <div class="cw-media-header">
      <button class="cw-btn cw-btn-ghost cw-btn-sm" @click="emit('back')">
        <SvgIcon name="chevronLeft" :size="16" />
        <span>返回</span>
      </button>
      <span class="cw-media-header-title">
        {{ target.type === '账号' ? '用户资料' : target.type === '帖子' ? '动态详情' : '消息记录' }}
      </span>
    </div>

    <!-- 账号公开资料 -->
    <template v-if="account">
      <div class="cw-account-hero-card">
        <div class="cw-hero-avatar-box">
          <CharacterAvatar :name="account.昵称 || account.账号名" :size="52" shape="circle" />
        </div>
        <div class="cw-hero-info">
          <div class="cw-hero-name-row">
            <h3 class="cw-hero-nickname">{{ account.昵称 || account.账号名 || '未知昵称' }}</h3>
            <span class="cw-badge cw-badge-accent">{{ account.平台 || '社交平台' }}</span>
          </div>
          <span class="cw-hero-handle">@{{ account.账号名 || account.id }}</span>
          <p class="cw-hero-bio">{{ account.简介 || '这个用户很神秘，暂未填写公开简介。' }}</p>
        </div>
      </div>

      <div class="cw-media-section">
        <h4 class="cw-section-subtitle">公开资料档案</h4>
        <RecordDetails :value="account.公开资料" />
      </div>
    </template>

    <!-- 帖子详情 -->
    <template v-else-if="post">
      <div class="cw-post-card">
        <div class="cw-post-header">
          <CharacterAvatar :name="post.authorName" :size="38" />
          <div class="cw-post-meta">
            <span class="cw-post-author">{{ post.authorName }}</span>
            <span class="cw-post-time">{{ post.time }}</span>
          </div>
        </div>
        <p class="cw-post-body">{{ post.content }}</p>

        <div v-if="post.comments && post.comments.length" class="cw-post-comments-box">
          <h5 class="cw-comments-heading">评论列表 ({{ post.comments.length }})</h5>
          <div v-for="c in post.comments" :key="c.id" class="cw-comment-item">
            <strong class="cw-comment-user">{{ c.author }}：</strong>
            <span class="cw-comment-text">{{ c.text }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- 单条消息详情 -->
    <template v-else-if="message">
      <div class="cw-message-detail-card">
        <div class="cw-msg-header">
          <span class="cw-msg-sender">{{ message.senderName }}</span>
          <span class="cw-msg-time">{{ message.time }}</span>
        </div>
        <div class="cw-msg-blocks">
          <p v-for="b in message.blocks" :key="b.id" class="cw-msg-block-item">
            {{ b.content ?? b.desc ?? b.转写文字 ?? b.type }}
          </p>
        </div>
      </div>
    </template>

    <div v-else class="cw-empty-backdrop">
      <SvgIcon name="alertCircle" :size="38" class="cw-empty-icon" />
      <div class="cw-empty-title">来源不可用或无权查看</div>
      <div class="cw-empty-desc">该分享来源暂不可用，或当前账号暂无权限查看此内容。</div>
      <button class="cw-btn cw-btn-ghost cw-btn-sm cw-empty-action" @click="emit('back')">
        返回上一页
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useWorldState } from '../../utils/context';
import { phoneProjection } from '../../../../运行/phone';
import RecordDetails from '../RecordDetails.vue';
import CharacterAvatar from '../shared/CharacterAvatar.vue';
import SvgIcon from '../icons/SvgIcon.vue';

const props = defineProps<{ target: { type: string; id: string } }>();
const emit = defineEmits<{ (e: 'back'): void }>();
const state = useWorldState();

const projection = computed(() => phoneProjection(state.value, '邻信', true));

const account = computed(() =>
  props.target.type === '账号' &&
  (Object.hasOwn(state.value.玩家.已知信息.已知账号, props.target.id) ||
    state.value.手机.账号[props.target.id]?.人物id === state.value.玩家.id ||
    projection.value.contacts.some(c => c.id === props.target.id))
    ? state.value.手机.账号[props.target.id]
    : null,
);

const post = computed(() =>
  props.target.type === '帖子'
    ? [...projection.value.posts, ...phoneProjection(state.value, '微澜', true).posts].find(
        p => p.id === props.target.id,
      )
    : null,
);

const message = computed(() =>
  props.target.type === '消息'
    ? Object.values(projection.value.messagesMap)
        .flat()
        .find(m => m.id === props.target.id)
    : null,
);
</script>

<style scoped lang="scss">
.cw-media-view {
  padding: 14px 16px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: var(--cw-bg-surface);
  color: var(--cw-text-primary);
}

.cw-media-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--cw-border);
}

.cw-media-header-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--cw-text-primary);
}

.cw-account-hero-card {
  display: flex;
  gap: 14px;
  padding: 14px;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);

  .cw-hero-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }

  .cw-hero-name-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .cw-hero-nickname {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
  }

  .cw-hero-handle {
    font-size: 12px;
    color: var(--cw-text-muted);
  }

  .cw-hero-bio {
    margin: 4px 0 0;
    font-size: 13px;
    color: var(--cw-text-secondary);
    line-height: 1.5;
  }
}

.cw-media-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cw-section-subtitle {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--cw-text-primary);
}

.cw-post-card {
  padding: 14px;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);
  display: flex;
  flex-direction: column;
  gap: 10px;

  .cw-post-header {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .cw-post-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .cw-post-author {
    font-size: 13px;
    font-weight: 600;
  }

  .cw-post-time {
    font-size: 11px;
    color: var(--cw-text-muted);
  }

  .cw-post-body {
    margin: 0;
    font-size: 13px;
    line-height: 1.6;
    white-space: pre-wrap;
  }
}

.cw-post-comments-box {
  border-top: 1px dashed var(--cw-border);
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;

  .cw-comments-heading {
    margin: 0 0 4px;
    font-size: 12px;
    color: var(--cw-text-muted);
  }

  .cw-comment-item {
    font-size: 12px;
    line-height: 1.5;
    background: var(--cw-bg-surface);
    padding: 6px 8px;
    border-radius: var(--cw-radius-sm);
  }
}

.cw-message-detail-card {
  padding: 14px;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);
  display: flex;
  flex-direction: column;
  gap: 8px;

  .cw-msg-header {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: var(--cw-text-muted);
    border-bottom: 1px solid var(--cw-border);
    padding-bottom: 4px;
  }

  .cw-msg-blocks {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .cw-msg-block-item {
    margin: 0;
    font-size: 13px;
    line-height: 1.6;
  }
}

.cw-empty-backdrop {
  flex: 1;
  width: 100%;
  min-height: 200px;
  box-sizing: border-box;
  margin: 0;
  padding: 36px 16px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  border: none;
  border-radius: 0;
  background: transparent;

  .cw-empty-icon {
    color: var(--cw-text-muted);
    opacity: 0.35;
    margin-bottom: 12px;
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
    max-width: 260px;
  }

  .cw-empty-action {
    margin-top: 14px;
  }
}
</style>
