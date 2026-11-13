<template>
  <div
    class="cw-message-item"
    :class="[
      message.role === 'user' ? 'cw-msg-user' : 'cw-msg-assistant',
      { 'cw-msg-incomplete': message.isIncomplete, mes: message.id >= 0 },
    ]"
    :mesid="message.id >= 0 ? message.id : undefined"
    :data-cw-message-id="message.id >= 0 ? message.id : undefined"
    :is_user="message.role === 'user' ? 'true' : 'false'"
    :ch_name="message.role === 'user' ? '玩家' : message.characterName || 'AI'"
  >
    <!-- 消息对话主体 -->
    <div class="cw-message-bubble mes_block">
      <!-- 气泡顶栏：楼层号、时间戳、未完成告示与右上角操作按钮 -->
      <div class="cw-bubble-header">
        <div class="cw-header-left">
          <div class="cw-avatar-col">
            <div class="cw-avatar" :class="message.role === 'user' ? 'cw-avatar-user' : 'cw-avatar-assistant'">
              <SvgIcon :name="message.role === 'user' ? 'user' : 'userCheck'" :size="20" />
            </div>
            <span class="cw-role-label">{{ message.role === 'user' ? '玩家' : message.characterName || 'AI' }}</span>
          </div>
          <span class="cw-floor-badge">{{ message.id < 0 ? '生成中' : '#' + message.id + ' 楼' }}</span>
          <span v-if="message.isUpdatePending" class="cw-badge">正文已完成 · 变量更新中</span>
          <span v-if="message.time" class="cw-msg-time">{{ message.time }}</span>
          <!-- 未完成告示 -->
          <span v-if="message.isIncomplete && message.id >= 0" class="cw-badge cw-badge-warning cw-incomplete-tag">
            <SvgIcon name="alertCircle" :size="12" />
            <span>生成已停止 · 未完成</span>
          </span>
        </div>

        <!-- 对话框右上角功能按钮（均需二次确认） -->
        <div
          v-if="message.id >= 0"
          class="cw-bubble-actions"
          :inert="actionsBlocked || undefined"
          :aria-disabled="actionsBlocked || undefined"
        >
          <button
            v-if="message.isUpdatePending"
            class="cw-action-btn cw-action-danger"
            title="放弃待结算正文，删除该消息及其后续全部楼层"
            @click="emit('triggerAction', { type: 'delete', message })"
          >
            <SvgIcon name="trash" :size="13" />
            <span>删除</span>
          </button>
          <!-- 玩家对话框按钮：发送、删除、编辑 -->
          <template v-else-if="message.role === 'user'">
            <button
              class="cw-action-btn"
              title="对该条玩家正文发起续接生成（清除其后续楼层）"
              @click="emit('triggerAction', { type: 'player_send', message })"
            >
              <SvgIcon name="send" :size="13" />
              <span>发送</span>
            </button>
            <button
              class="cw-action-btn cw-action-edit"
              title="编辑该条玩家正文（保留后续楼层，不同步修改变量）"
              @click="emit('triggerAction', { type: 'edit', message })"
            >
              <SvgIcon name="edit" :size="13" />
              <span>编辑</span>
            </button>
            <button
              class="cw-action-btn cw-action-danger"
              title="删除该消息及其后续全部楼层"
              @click="emit('triggerAction', { type: 'delete', message })"
            >
              <SvgIcon name="trash" :size="13" />
              <span>删除</span>
            </button>
          </template>

          <!-- AI 对话框按钮：重roll、删除、编辑 -->
          <template v-else>
            <button
              class="cw-action-btn cw-action-reroll"
              title="重新生成此AI回复（清除其后续楼层）"
              @click="emit('triggerAction', { type: 'ai_reroll', message })"
            >
              <SvgIcon name="refresh" :size="13" />
              <span>重roll</span>
            </button>
            <button
              class="cw-action-btn cw-action-edit"
              title="编辑此AI正文（保留后续楼层，不同步修改变量）"
              @click="emit('triggerAction', { type: 'edit', message })"
            >
              <SvgIcon name="edit" :size="13" />
              <span>编辑</span>
            </button>
            <button
              class="cw-action-btn cw-action-danger"
              title="删除该消息及其后续全部楼层"
              @click="emit('triggerAction', { type: 'delete', message })"
            >
              <SvgIcon name="trash" :size="13" />
              <span>删除</span>
            </button>
          </template>
        </div>
      </div>

      <!-- 消息正文内容 -->
      <MessageContent
        :id="message.id"
        class="cw-bubble-content cw-reading-text"
        :content="message.content"
        :role="message.role"
        :incomplete="message.isIncomplete"
      />
      <VariableStatusBar
        v-if="message.role === 'assistant' && message.variableUpdate"
        :status="message.variableUpdate"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import MessageContent from './MessageContent.vue';
import SvgIcon from '../icons/SvgIcon.vue';
import VariableStatusBar from '../shared/VariableStatusBar.vue';
import type { StoryChangeStatus } from '../../../../运行/variable-changes';

export interface ChatMessageItem {
  id: number;
  role: 'user' | 'assistant';
  characterName?: string;
  content: string;
  time?: string;
  isIncomplete?: boolean;
  isUpdatePending?: boolean;
  variableUpdate?: StoryChangeStatus;
}

const props = defineProps<{
  message: ChatMessageItem;
  actionsBlocked?: boolean;
}>();

const emit = defineEmits<{
  (e: 'triggerAction', payload: { type: string; message: ChatMessageItem }): void;
}>();
</script>

<style scoped lang="scss">
.cw-message-item {
  display: flex;
  gap: 0;
  margin-bottom: 24px;
  max-width: 860px;
  width: 100%;
  margin-left: auto;
  margin-right: auto;
  animation: cwFadeIn 0.2s ease-out;

  &.cw-msg-user {
    .cw-avatar-user {
      background: var(--cw-accent-bg);
      color: var(--cw-accent);
      border-color: var(--cw-accent-border);
    }
    .cw-message-bubble {
      background: var(--cw-bg-card);
      border: 1px solid var(--cw-border);
      border-left: 3px solid var(--cw-accent);
      border-top-right-radius: 4px;
    }
    .cw-bubble-content {
      color: var(--cw-text-primary);
    }
  }

  &.cw-msg-assistant {
    .cw-avatar-assistant {
      background: var(--cw-bg-surface);
      color: var(--cw-text-secondary);
      border-color: var(--cw-border);
    }
    .cw-message-bubble {
      background: var(--cw-bg-surface);
      border: 1px solid var(--cw-border);
      border-left: 3px solid rgba(112, 125, 103, 0.4);
    }
    .cw-bubble-content {
      color: var(--cw-text-primary);
      line-height: 1.75;
    }
  }

  &.cw-msg-incomplete {
    .cw-message-bubble {
      border-left-color: var(--cw-warning);
      background: rgba(217, 130, 43, 0.03);
    }
  }
}

.cw-avatar-col {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;

  .cw-avatar {
    width: 26px;
    height: 26px;
    border-radius: var(--cw-radius-full);
    border: 1px solid var(--cw-border);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: var(--cw-shadow-sm);
  }

  .cw-role-label {
    font-size: 11px;
    color: var(--cw-text-muted);
    text-align: center;
    max-width: 50px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.cw-message-bubble {
  min-width: 0;
  flex: 1;
  border-radius: var(--cw-radius);
  border: 1px solid var(--cw-border);
  box-shadow: var(--cw-shadow-sm);
  padding: 14px 18px;
  transition: all 0.2s ease;

  &:hover {
    box-shadow: var(--cw-shadow);
    border-color: var(--cw-border-hover);

    .cw-bubble-actions {
      opacity: 1;
    }
  }
}

.cw-bubble-header {
  flex-wrap: wrap;
  gap: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px dashed var(--cw-border);
  user-select: none;
}

.cw-header-left {
  flex-wrap: wrap;
  display: flex;
  align-items: center;
  gap: 8px;

  .cw-floor-badge {
    font-family: monospace, sans-serif;
    font-size: 12px;
    font-weight: 600;
    color: var(--cw-text-muted);
  }

  .cw-msg-time {
    font-size: 12px;
    color: var(--cw-text-muted);
  }

  .cw-incomplete-tag {
    animation: cwPulse 2s infinite;
  }
}

/* 解决 F34：大幅降低楼层工具条的视觉权重 */
.cw-bubble-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0.65;
  transition: opacity 0.2s ease;
}

.cw-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px;
  font-size: 11px;
  font-weight: 500;
  border-radius: var(--cw-radius-sm);
  border: 1px solid transparent;
  background: transparent;
  color: var(--cw-text-muted);
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: var(--cw-bg-card-subtle);
    color: var(--cw-text-primary);
    border-color: var(--cw-border);
  }

  &.cw-action-reroll:hover {
    color: var(--cw-accent);
    border-color: var(--cw-accent);
  }

  &.cw-action-edit:hover {
    color: var(--cw-info);
    border-color: var(--cw-info);
  }

  &.cw-action-danger:hover {
    color: var(--cw-danger);
    background: var(--cw-danger-bg);
    border-color: rgba(201, 74, 74, 0.4);
  }
}

.cw-bubble-content {
  line-height: var(--cw-line-height-body);
  letter-spacing: var(--cw-letter-spacing-body);
  font-size: var(--cw-font-size-body);
  color: var(--cw-text-primary);
  word-break: break-word;
}

@keyframes cwPulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}
</style>
