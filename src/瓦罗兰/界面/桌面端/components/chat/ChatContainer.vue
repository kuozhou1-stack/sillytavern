<template>
  <div class="cw-chat-viewport">
    <div ref="scrollContainer" class="cw-chat-scroll" @scroll="handleScroll">
      <!-- 楼层消息流 -->
      <div class="cw-message-list">
        <CreationReceipt v-if="!messages.length" />
        <MessageItem
          v-for="msg in messages"
          :key="msg.id"
          :message="msg"
          :is-latest="msg.id === messages.at(-1)?.id"
          :actions-blocked="actionsBlocked"
          @trigger-action="handleActionTrigger"
        />
      </div>
    </div>

    <!-- 手动“到达最新楼层”悬浮定位按钮（用户主动点击，绝不强制滚动） -->
    <transition name="cw-fade">
      <button
        v-if="showScrollToBottom"
        class="cw-scroll-to-bottom-btn"
        title="快速滚动定位至最新楼层"
        @click="scrollToBottom"
      >
        <SvgIcon name="arrowDown" :size="16" />
        <span>到达最新楼层</span>
      </button>
    </transition>

    <!-- 操作二次确认弹窗 -->
    <MessageConfirmModal
      v-if="activeAction"
      :action-type="activeAction.type"
      :message="activeAction.message"
      @confirm="handleActionConfirmed"
      @cancel="activeAction = null"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue';
import SvgIcon from '../icons/SvgIcon.vue';
import MessageItem, { type ChatMessageItem } from './MessageItem.vue';
import MessageConfirmModal from './MessageConfirmModal.vue';
import CreationReceipt from './CreationReceipt.vue';

const props = defineProps<{
  messages: ChatMessageItem[];
  actionsBlocked?: boolean;
}>();

const emit = defineEmits<{
  (e: 'executeAction', payload: { actionType: string; messageId: number; newContent?: string }): void;
}>();

const scrollContainer = ref<HTMLElement | null>(null);
const showScrollToBottom = ref(false);
const isFollowingBottom = ref(true);

const activeAction = ref<{ type: any; message: ChatMessageItem } | null>(null);

function handleScroll() {
  if (!scrollContainer.value) return;
  const { scrollTop, scrollHeight, clientHeight } = scrollContainer.value;
  const distanceToBottom = scrollHeight - (scrollTop + clientHeight);
  // 玩家回看前文时，流式输出不强行拉到底；主动回到底部后恢复跟随
  if (distanceToBottom > 40) {
    isFollowingBottom.value = false;
  } else {
    isFollowingBottom.value = true;
  }
  showScrollToBottom.value = distanceToBottom > 160;
}

watch(
  () => props.messages,
  () => {
    if (!scrollContainer.value) return;
    if (isFollowingBottom.value) {
      nextTick(() => {
        if (!scrollContainer.value) return;
        scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight;
      });
    }
  },
  { deep: true, flush: 'post' },
);

function scrollToBottom() {
  if (!scrollContainer.value) return;
  isFollowingBottom.value = true;
  scrollContainer.value.scrollTo({
    top: scrollContainer.value.scrollHeight,
    behavior: 'smooth',
  });
  showScrollToBottom.value = false;
}

function handleActionTrigger(payload: { type: string; message: ChatMessageItem }) {
  if (props.actionsBlocked) return;
  activeAction.value = {
    type: payload.type as any,
    message: payload.message,
  };
}

function handleActionConfirmed(payload: { actionType: string; messageId: number; newContent?: string }) {
  emit('executeAction', payload);
  activeAction.value = null;
}

onMounted(() => {
  handleScroll();
});
</script>

<style scoped lang="scss">
.cw-chat-viewport {
  flex: 1;
  width: 100%;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.cw-chat-scroll {
  flex: 1;
  overflow-y: auto;
  scrollbar-gutter: stable both-edges;
  padding: 16px 14px calc(var(--cw-composer-height, 100px) + 20px);
  scroll-padding-bottom: calc(var(--cw-composer-height, 100px) + 16px);
  scroll-behavior: smooth;
  box-sizing: border-box;
}

.cw-message-list {
  display: flex;
  flex-direction: column;
}

.cw-scroll-to-bottom-btn {
  position: absolute;
  bottom: calc(var(--cw-composer-height, 100px) + 24px);
  right: 18px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: var(--cw-radius-full);
  background: var(--cw-accent);
  color: var(--cw-text-inverse);
  border: 1px solid var(--cw-accent-hover);
  box-shadow: var(--cw-shadow);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  z-index: 30;
  transition: all 0.2s ease;

  &:hover {
    background: var(--cw-accent-hover);
    transform: translateY(-2px);
    box-shadow: var(--cw-shadow-lg);
  }

  &:active {
    transform: translateY(0);
  }
}

.cw-fade-enter-active,
.cw-fade-leave-active {
  transition:
    opacity 0.2s,
    transform 0.2s;
}

.cw-fade-enter-from,
.cw-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
