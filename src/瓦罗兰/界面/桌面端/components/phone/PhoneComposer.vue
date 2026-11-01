<template>
  <div class="cw-compose-overlay" role="dialog" aria-label="编辑手机内容">
    <div class="cw-compose-header">
      <div class="cw-compose-title">
        <SvgIcon :name="kind === 'send' ? 'messageSquare' : 'edit'" :size="16" />
        <span>{{ kind === 'send' ? '编辑消息内容' : '发布动态' }} ({{ platform }})</span>
      </div>
      <button class="cw-btn-icon" title="关闭" @click="emit('close')">
        <SvgIcon name="close" :size="16" />
      </button>
    </div>

    <div class="cw-compose-body">
      <div v-if="error" class="cw-compose-error" role="alert">
        <SvgIcon name="alertTriangle" :size="14" />
        <span>{{ error }}</span>
      </div>

      <!-- 内容块类型选择器 -->
      <div class="cw-form-group">
        <label class="cw-form-label">添加内容块类型</label>
        <div class="cw-type-chips">
          <button
            v-for="t in types"
            :key="t"
            type="button"
            class="cw-chip-btn"
            :class="{ active: type === t }"
            @click="type = t"
          >
            {{ t }}
          </button>
        </div>
      </div>

      <!-- 动态表单项 -->
      <div class="cw-form-group">
        <textarea
          v-model="text"
          rows="3"
          class="cw-compose-textarea"
          :placeholder="textPlaceholder"
        ></textarea>
      </div>

      <div v-if="type === '语音' || type === '视频'" class="cw-form-group">
        <label class="cw-form-label">模拟时长（秒，可选）</label>
        <input
          v-model="duration"
          type="number"
          class="cw-compose-input"
          placeholder="例如：15"
        />
      </div>

      <div v-if="type === '位置'" class="cw-form-group">
        <label class="cw-form-label">选择已知地点</label>
        <select v-model="target" class="cw-compose-select" aria-label="选择地点">
          <option value="">-- 请选择地点 --</option>
          <option v-for="(p, id) in locations" :key="id" :value="id">{{ p.名称 }}</option>
        </select>
      </div>

      <div v-if="type === '名片'" class="cw-form-group">
        <label class="cw-form-label">选择推荐账号名片</label>
        <select v-model="target" class="cw-compose-select" aria-label="选择名片">
          <option value="">-- 请选择账号 --</option>
          <option v-for="(a, id) in accounts" :key="id" :value="id">
            {{ a.昵称 ?? a.账号名 ?? '未知昵称' }} ({{ a.平台 }})
          </option>
        </select>
      </div>

      <div v-if="type === '分享'" class="cw-form-group">
        <label class="cw-form-label">选择分享的动态</label>
        <select v-model="target" class="cw-compose-select" aria-label="分享帖子">
          <option value="">-- 请选择可见动态 --</option>
          <option v-for="p in posts" :key="p.id" :value="p.id">
            {{ p.authorName }}：{{ p.content.slice(0, 30) }}
          </option>
        </select>
      </div>

      <button type="button" class="cw-btn cw-btn-ghost cw-btn-sm cw-add-block-btn" @click="addBlock">
        <SvgIcon name="userPlus" :size="14" />
        <span>加入该内容块</span>
      </button>

      <!-- 已添加内容块列表 -->
      <div v-if="blocks.length > 0" class="cw-blocks-list">
        <div class="cw-form-label">已包含内容块 ({{ blocks.length }})</div>
        <div v-for="(b, index) in blocks" :key="b.id" class="cw-block-chip">
          <span class="cw-block-type-badge">{{ b.类型 }}</span>
          <span class="cw-block-summary">{{ blockText([b]) }}</span>
          <button type="button" class="cw-remove-chip-btn" title="移除" @click="blocks.splice(index, 1)">
            <SvgIcon name="close" :size="12" />
          </button>
        </div>
      </div>

      <!-- 发动态专属话题设置 -->
      <template v-if="kind === 'post'">
        <div v-if="platform === '微澜'" class="cw-form-group" style="margin-top: 14px;">
          <label class="cw-form-label">添加话题标签 (空格分隔)</label>
          <input v-model="topics" class="cw-compose-input" placeholder="#生活 #摄影 #瓦罗兰" />
        </div>

      </template>
    </div>

    <!-- 底部操作栏 -->
    <div class="cw-compose-footer">
      <button type="button" class="cw-btn cw-btn-ghost" @click="emit('close')">取消</button>
      <button type="button" class="cw-btn cw-btn-primary" @click="submit">
        {{ kind === 'send' ? '确认发送' : '立即发布' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useWorldState } from '../../utils/context';
import { phoneProjection, blockText } from '../../../../运行/phone';
import { visibleLocations } from '../../../../运行/map';
import { uid, copy } from '../../../../运行/core';
import SvgIcon from '../icons/SvgIcon.vue';

const props = defineProps<{
  kind: 'send' | 'post';
  platform: '邻信' | '微澜';
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'submit', value: any): void;
}>();

const state = useWorldState();
const type = ref('文字');
const text = ref('');
const duration = ref('');
const target = ref('');
const error = ref('');
const blocks = ref<any[]>([]);

const types = ['文字', '图片', '语音', '表情', '视频', '位置', '名片', '分享'];
const topics = ref('');

const contacts = computed(() => phoneProjection(state.value).contacts);
const locations = computed(() => visibleLocations(state.value));
const accounts = computed(() =>
  Object.fromEntries(
    Object.entries(state.value.手机?.账号 || {}).filter(
      ([id, a]: any) =>
        a.人物id === state.value.玩家?.id ||
        contacts.value.some(c => c.id === id) ||
        Object.hasOwn(state.value.玩家?.已知信息?.已知账号 || {}, id),
    ),
  ),
);

const posts = computed(() => [
  ...phoneProjection(state.value).posts,
  ...phoneProjection(state.value, '微澜').posts,
]);

const textPlaceholder = computed(() => {
  switch (type.value) {
    case '图片':
      return '描述图片内容（例如：瓦罗兰港湾海堤日落风景照）';
    case '语音':
      return '语音转写文字内容...';
    case '表情':
      return '输入动态表情内容（例如：开心猫猫摇尾巴）';
    case '视频':
      return '简述视频画面过程（例如：店里咖啡拉花展示）';
    case '位置':
    case '名片':
    case '分享':
      return '附加留言或备注（可选）';
    default:
      return '输入消息正文...';
  }
});

function addBlock(): boolean {
  try {
    const b: any = { 类型: type.value, id: uid('block') };
    const field: Record<string, string> = {
      文字: '正文',
      图片: '图片描述',
      语音: '转写文字',
      表情: '表情内容',
      视频: '画面过程描述',
    };
    if (field[type.value]) {
      if (!text.value.trim()) throw Error('请输入具体内容');
      b[field[type.value]] = text.value.trim();
    } else {
      if (!target.value) throw Error('请选择目标项');
      if (type.value === '位置') {
        b.地点id = target.value;
        b.显示名称 = locations.value[target.value]?.名称 || '地点';
      }
      if (type.value === '名片') b.账号id = target.value;
      if (type.value === '分享') {
        b.目标类型 = '帖子';
        b.目标id = target.value;
      }
      b.附言 = text.value.trim() || null;
    }
    if (type.value === '语音' || type.value === '视频') {
      if (duration.value !== '' && (!Number.isFinite(Number(duration.value)) || Number(duration.value) < 0))
        throw Error('时长必须为有效正数');
      b.模拟时长秒 = duration.value === '' ? null : Number(duration.value);
    }
    blocks.value.push(b);
    text.value = '';
    target.value = '';
    duration.value = '';
    error.value = '';
    return true;
  } catch (e: any) {
    error.value = String(e.message || e);
    return false;
  }
}

function submit() {
  if (!blocks.value.length) {
    if (text.value.trim() || target.value) {
      if (!addBlock()) return;
    } else {
      error.value = '请先加入至少一项有效内容块';
      return;
    }
  }
  emit('submit', {
    blocks: copy(blocks.value),
    topics: topics.value.split(/\s+/).filter(Boolean),
  });
}
</script>

<style scoped lang="scss">
.cw-compose-overlay {
  position: absolute;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  background: var(--cw-bg-surface);
  color: var(--cw-text-primary);
}

.cw-compose-header {
  height: 48px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--cw-border);
  background: var(--cw-bg-card-subtle);

  .cw-compose-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 600;
  }
}

.cw-compose-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cw-compose-error {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: var(--cw-radius-sm);
  background: var(--cw-bg-card);
  border: 1px solid var(--cw-danger);
  color: var(--cw-danger);
  font-size: 12px;
}

.cw-form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;

  .cw-form-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--cw-text-secondary);
  }
}

.cw-type-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  .cw-chip-btn {
    padding: 4px 10px;
    border-radius: var(--cw-radius-full);
    border: 1px solid var(--cw-border);
    background: var(--cw-bg-card);
    color: var(--cw-text-secondary);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;

    &:hover {
      border-color: var(--cw-accent);
      color: var(--cw-text-primary);
    }

    &.active {
      background: var(--cw-accent-bg);
      border-color: var(--cw-accent-border);
      color: var(--cw-accent);
      font-weight: 600;
    }
  }
}

.cw-compose-textarea {
  width: 100%;
  padding: 10px 12px;
  border-radius: var(--cw-radius);
  border: 1px solid var(--cw-border);
  background: var(--cw-bg-main);
  color: var(--cw-text-primary);
  font-size: 13px;
  resize: vertical;
  outline: none;
  box-sizing: border-box;

  &:focus {
    border-color: var(--cw-accent);
  }
}

.cw-compose-input,
.cw-compose-select {
  width: 100%;
  padding: 8px 12px;
  border-radius: var(--cw-radius);
  border: 1px solid var(--cw-border);
  background: var(--cw-bg-main);
  color: var(--cw-text-primary);
  font-size: 13px;
  outline: none;
  box-sizing: border-box;

  &:focus {
    border-color: var(--cw-accent);
  }
}

.cw-add-block-btn {
  align-self: flex-start;
}

.cw-blocks-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);

  .cw-block-chip {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: var(--cw-radius-sm);
    background: var(--cw-bg-surface);
    border: 1px solid var(--cw-border);
    font-size: 12px;

    .cw-block-type-badge {
      padding: 1px 6px;
      border-radius: var(--cw-radius-sm);
      background: var(--cw-accent-bg);
      color: var(--cw-accent);
      font-size: 11px;
      font-weight: 600;
    }

    .cw-block-summary {
      flex: 1;
      color: var(--cw-text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .cw-remove-chip-btn {
      padding: 3px;
      border-radius: 50%;
      border: none;
      background: transparent;
      color: var(--cw-text-muted);
      cursor: pointer;

      &:hover {
        color: var(--cw-danger);
      }
    }
  }
}

.cw-compose-footer {
  padding: 10px 14px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid var(--cw-border);
  background: var(--cw-bg-card-subtle);
}
</style>
