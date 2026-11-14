<template>
  <div class="cw-modal-backdrop" @click.self="emit('cancel')">
    <div class="cw-modal-box cw-confirm-modal">
      <div class="cw-modal-header">
        <div class="cw-header-title">
          <SvgIcon
            :name="actionIcon"
            :size="18"
            :class="
              {
                edit: 'cw-icon-edit',
                delete: 'cw-icon-delete',
                reroll: 'cw-icon-reroll',
                player_send: 'cw-icon-player_send',
              }[actionType]
            "
          />
          <span>{{ actionTitle }}</span>
        </div>
        <button class="cw-btn cw-btn-ghost cw-close-btn" @click="emit('cancel')">
          <SvgIcon name="close" :size="18" />
        </button>
      </div>

      <div class="cw-modal-body">
        <div class="cw-action-desc-banner">
          <SvgIcon name="alertCircle" :size="16" />
          <span>{{ actionDescription }}</span>
        </div>

        <!-- 目标楼层信息展示 -->
        <div class="cw-target-info">
          <span class="cw-badge cw-badge-accent">目标楼层：#{{ message?.id }} 楼</span>
          <span class="cw-badge">{{ message?.role === 'user' ? '玩家消息' : 'AI 回复' }}</span>
        </div>

        <!-- 如果是编辑模式，显示富文本/多行编辑框 -->
        <div v-if="actionType === 'edit'" class="cw-edit-box">
          <label class="cw-field-label">正文内容修改（保存后不自动生成）：</label>
          <textarea v-model="editDraft" class="cw-edit-textarea" rows="8"></textarea>
        </div>

        <!-- 如果是非编辑模式，预览受影响内容 -->
        <div v-else class="cw-preview-box">
          <label class="cw-field-label">所选楼层正文预览：</label>
          <div class="cw-preview-text">{{ originalContent }}</div>
        </div>
      </div>

      <div class="cw-modal-footer">
        <button class="cw-btn cw-btn-ghost" @click="emit('cancel')">取消</button>
        <button
          class="cw-btn"
          :class="actionType === 'delete' ? 'cw-btn-danger' : 'cw-btn-primary'"
          @click="handleConfirm"
        >
          {{ confirmBtnText }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import SvgIcon from '../icons/SvgIcon.vue';
import type { ChatMessageItem } from './MessageItem.vue';
import { stripProtocol } from '../../../../运行/message-protocol';

const props = defineProps<{
  actionType: 'player_send' | 'ai_reroll' | 'delete' | 'edit';
  message: ChatMessageItem;
}>();

const emit = defineEmits<{
  (e: 'confirm', payload: { actionType: string; messageId: number; newContent?: string }): void;
  (e: 'cancel'): void;
}>();

const originalContent = computed(() => props.message.role === 'user'
  ? props.message.content : stripProtocol(props.message.content));
const initialDraft = originalContent.value;
const editDraft = ref(initialDraft);

const actionTitle = computed(() => {
  switch (props.actionType) {
    case 'player_send':
      return '从本楼层续接发送';
    case 'ai_reroll':
      return '重新生成 AI 回复';
    case 'delete':
      return '删除选定楼层及后续';
    case 'edit':
      return '编辑修改正文';
    default:
      return '正文操作确认';
  }
});

const actionIcon = computed(() => {
  switch (props.actionType) {
    case 'player_send':
      return 'send';
    case 'ai_reroll':
      return 'refresh';
    case 'delete':
      return 'trash';
    case 'edit':
      return 'edit';
    default:
      return 'alertCircle';
  }
});

const actionDescription = computed(() => {
  switch (props.actionType) {
    case 'player_send':
      return '对该条已发送玩家正文发起续接生成，将清除目标之后的楼层，使用保留的上文与该条玩家内容继续推进。';
    case 'ai_reroll':
      return '重新生成选定 AI 回复，将清除目标之后的楼层，被清除的历史内容不进入新生成。';
    case 'delete':
      return '删除选中的当前楼层及其之后全部楼层（不可撤回）。';
    case 'edit':
      return props.message.role === 'assistant'
        ? '修改选定正文，保留后续楼层。编辑最新已结算 AI 回复后，需点击输入区“立即重试”重新结算变量；编辑历史回复不会自动重算后续变量。'
        : '修改选定的玩家正文，保留后续楼层，不同步修改剧情变量；保存后不自动生成，由玩家之后手动发送。';
    default:
      return '请确认是否执行此项操作。';
  }
});

const confirmBtnText = computed(() => {
  switch (props.actionType) {
    case 'player_send':
      return '确认续接发送';
    case 'ai_reroll':
      return '确认重roll';
    case 'delete':
      return '确认删除';
    case 'edit':
      return '保存修改';
    default:
      return '确认';
  }
});

function handleConfirm() {
  emit('confirm', {
    actionType: props.actionType,
    messageId: props.message.id,
    newContent: props.actionType === 'edit' && editDraft.value !== initialDraft ? editDraft.value : undefined,
  });
}
</script>

<style scoped lang="scss">
.cw-confirm-modal {
  width: 100%;
  max-width: 580px;
}

.cw-modal-header {
  padding: 16px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--cw-border);
  background: var(--cw-bg-card-subtle);

  .cw-header-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 600;
  }
}

.cw-icon-delete {
  color: var(--cw-danger);
}
.cw-icon-ai_reroll {
  color: var(--cw-accent);
}
.cw-icon-player_send {
  color: var(--cw-accent);
}
.cw-icon-edit {
  color: var(--cw-info);
}

.cw-modal-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cw-action-desc-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: var(--cw-radius);
  background: var(--cw-accent-bg);
  color: var(--cw-text-primary);
  font-size: 13px;
  line-height: 1.6;
  border: 1px solid var(--cw-accent-border);
}

.cw-target-info {
  display: flex;
  gap: 8px;
}

.cw-field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--cw-text-secondary);
  display: block;
  margin-bottom: 6px;
}

.cw-edit-textarea {
  width: 100%;
  padding: 10px 12px;
  border-radius: var(--cw-radius);
  border: 1px solid var(--cw-border);
  background: var(--cw-bg-input);
  color: var(--cw-text-primary);
  font-size: 14px;
  line-height: 1.7;
  font-family: inherit;
  resize: vertical;

  &:focus {
    outline: none;
    border-color: var(--cw-accent);
  }
}

.cw-preview-text {
  max-height: 160px;
  overflow-y: auto;
  padding: 10px 14px;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);
  font-size: 13px;
  line-height: 1.6;
  color: var(--cw-text-secondary);
}

.cw-modal-footer {
  padding: 14px 20px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid var(--cw-border);
  background: var(--cw-bg-card-subtle);
}

@media (max-width: 480px) {
  .cw-modal-header {
    padding: 12px 14px;
  }
  .cw-modal-body {
    padding: 14px 12px;
  }
  .cw-modal-footer {
    padding: 10px 12px;
    flex-direction: column-reverse;
    .cw-btn {
      width: 100%;
      justify-content: center;
    }
  }
}
</style>
