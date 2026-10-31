<template>
  <section
    v-if="runtime && (waiting.length || recoverable.length || opening.length || receipts.length)"
    class="cw-queue-status"
    aria-live="polite"
  >
    <button
      v-if="compact"
      class="cw-btn cw-btn-ghost cw-btn-xs cw-queue-toggle"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <SvgIcon name="clock" :size="13" />
      任务与回执<span v-if="waiting.length"> · 待发送 {{ waiting.length }}</span
      ><span v-if="recoverable.length"> · 待恢复 {{ recoverable.length }}</span>
      <span v-if="opening.length"> · 角色待整理 {{ openingPeople }}</span
      ><span v-if="receipts.length"> · 回执 {{ receipts.length }}</span>
      <span>{{ expanded ? '收起' : '展开' }}</span>
    </button>
    <div v-if="!compact || expanded" class="cw-queue-list">
      <!-- 角色开局整批整理状态 -->
      <div v-if="opening.length" class="cw-queue-row">
        <span class="cw-queue-label">
          <SvgIcon name="users" :size="13" />
          角色整批整理：{{ openingPeople }} 名角色待处理，将随下一次结算一并处理。{{
            openingConfigured ? '' : '（请在设置中配置变量额外 API）'
          }}
        </span>
        <button
          class="cw-btn cw-btn-xs"
          :disabled="runtime.view.busy || runtime.view.updating"
          @click="act(() => runtime!.startOpening())"
        >
          {{ hasStory ? '排入下次结算' : '重试开场' }}
        </button>
      </div>

      <p
        v-for="item in opening.filter(t => t.错误)"
        :key="item.提交id ?? item.目标id.join(',')"
        class="cw-queue-err"
        role="alert"
      >
        {{ item.错误 }}
      </p>

      <!-- 待发送队列 -->
      <div v-for="item in waiting" :key="item.id" class="cw-queue-row">
        <span class="cw-queue-label">
          <SvgIcon name="clock" :size="13" />
          待发送 · {{ item.label }}
        </span>
        <button class="cw-btn cw-btn-xs" @click="act(() => runtime!.cancelQueued(item.id))">取消</button>
      </div>

      <!-- 可恢复失败项 -->
      <div v-for="item in recoverable" :key="item.id" class="cw-queue-recoverable-row">
        <div class="cw-recover-info">
          <span class="cw-queue-label cw-text-warning">
            <SvgIcon name="alertTriangle" :size="13" />
            未完成 · {{ item.label }}
          </span>
          <span class="cw-queue-preview-short">{{ item.preview || '操作尚未确认完成' }}</span>
        </div>
        <div class="cw-queue-actions">
          <button class="cw-btn cw-btn-xs cw-btn-primary" @click="act(() => runtime!.resumeQueued(item.id))">
            手动恢复
          </button>
          <button class="cw-btn cw-btn-xs" @click="act(() => runtime!.cancelQueued(item.id))">移除</button>
        </div>
      </div>

      <p v-if="error" class="cw-queue-err" role="alert">{{ error }}</p>

      <!-- 解决 F33：详细回执收纳为模态弹窗入口，消除狭小嵌套折叠树 -->
      <div v-if="receipts.length" class="cw-queue-row cw-receipts-summary-row">
        <span class="cw-queue-label">
          <SvgIcon name="checkCircle" :size="13" />
          角色更新回执已记录（共 {{ receipts.length }} 次保存）
        </span>
        <button class="cw-btn cw-btn-xs cw-btn-ghost" @click="showReceiptsModal = true">查看回执详情</button>
      </div>
    </div>
    <!-- 回执详情模态弹窗 -->
    <Teleport v-if="showReceiptsModal" to=".cw-desktop-shell">
      <div v-if="showReceiptsModal" class="cw-modal-backdrop" @click.self="showReceiptsModal = false">
        <div class="cw-modal-box cw-receipts-modal">
          <div class="cw-modal-header">
            <div class="cw-header-title">
              <SvgIcon name="checkCircle" :size="18" />
              <span>角色更新回执详情（共 {{ receipts.length }} 次）</span>
            </div>
            <button class="cw-btn cw-btn-ghost cw-close-btn" @click="showReceiptsModal = false">
              <SvgIcon name="close" :size="16" />
            </button>
          </div>

          <div class="cw-modal-body">
            <div v-for="(item, idx) in receipts" :key="item.commitId || idx" class="cw-receipt-card">
              <div class="cw-rc-header">
                <span class="cw-rc-targets">
                  {{ item.targets.map(id => resolveCharacterName(runtime?.view.data, id)).join('、') }}
                </span>
                <span class="cw-badge cw-badge-sm">本次写入 {{ item.changed.length }} 项</span>
              </div>
              <p class="cw-rc-tip">本次更新已写回酒馆状态，不代表全部适用字段均已补齐。</p>

              <!-- 本次修改字段列表（人类可读格式） -->
              <div class="cw-rc-field-section">
                <span class="cw-rc-subtitle">本次修改的字段：</span>
                <div class="cw-rc-chips">
                  <span v-for="path in item.changed" :key="path" class="cw-field-chip">
                    {{ formatFieldPath(path) }}
                  </span>
                </div>
              </div>

              <!-- 仍为空/未知字段 -->
              <div v-for="id in item.targets" :key="id" class="cw-rc-unknown-box">
                <div class="cw-unknown-header">
                  <span class="cw-target-name">{{ resolveCharacterName(runtime?.view.data, id) }}</span>
                  <span class="cw-muted">仍为空／未知（含不适用项）：{{ unknownPaths(id).length }} 项</span>
                </div>
                <details class="cw-unknown-details">
                  <summary>展开查看未知字段</summary>
                  <div class="cw-rc-chips cw-chips-sm">
                    <span v-for="path in unknownPaths(id)" :key="path" class="cw-field-chip cw-chip-muted">
                      {{ formatFieldPath(path) }}
                    </span>
                  </div>
                </details>
              </div>

              <div class="cw-rc-footer">
                <button
                  class="cw-btn cw-btn-xs cw-btn-primary"
                  :disabled="
                    runtime.view.busy ||
                    runtime.view.updating ||
                    opening.some(t => item.targets.some(id => t.目标id.includes(id)))
                  "
                  @click="act(() => supplement(item.targets))"
                >
                  下次结算整批补全
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { RuntimeKey, type Runtime } from '../../../../运行/host';
import { isApiConfigured } from '../../../../运行/settings';
import { unknownPublicPaths } from '../../../../运行/update-receipt';
import { planOpeningCharacters } from '../../../../运行/opening';
import { resolveCharacterName } from '../../utils/entity';
import SvgIcon from '../icons/SvgIcon.vue';

const runtime = inject<Runtime | null>(RuntimeKey, null);
const props = withDefaults(defineProps<{ scope?: 'all' | 'phone' | 'story' | 'novel'; compact?: boolean }>(), {
  scope: 'all',
  compact: false,
});
const expanded = ref(false);
const matches = (kind: string) => props.scope === 'all' || kind === props.scope;
const error = ref('');
const showReceiptsModal = ref(false);

const waiting = computed(() => (runtime?.view.queued ?? []).filter(i => matches(i.kind)));
const recoverable = computed(() => (runtime?.view.recoverable ?? []).filter(i => matches(i.kind)));
const hasStory = computed(() => !!Object.keys(runtime?.view.data?._系统.已计轮事件 ?? {}).length);
const receipts = computed(() =>
  props.scope === 'phone' || props.scope === 'novel'
    ? []
    : (runtime?.view.updates ?? []).filter(r => runtime?.view.data?._系统.任务[r.taskId]?.类别 === '建档'),
);

const unknownPaths = (id: string) => unknownPublicPaths(runtime?.view.data?.角色[id]);

async function supplement(ids: string[]) {
  await runtime!.commit(s => planOpeningCharacters(s, ids));
}

const opening = computed(() =>
  props.scope === 'phone' || props.scope === 'novel'
    ? []
    : Object.values(runtime?.view.data?._系统.任务 ?? {}).filter(
        t => t.类别 === '建档' && !['已提交', '失效', '取消'].includes(t.状态),
      ),
);
const openingPeople = computed(() => new Set(opening.value.flatMap(t => t.目标id)).size);
const openingConfigured = computed(() => !!runtime && isApiConfigured(runtime.settings.variable));

async function act(fn: () => Promise<unknown>) {
  try {
    await fn();
    error.value = '';
  } catch (e) {
    error.value = String(e);
  }
}

// 人类可读字段路径格式化，避免直接显示 JSON Pointer
function formatFieldPath(path: string): string {
  if (!path) return '';
  return path.replace(/^\//, '').split('/').filter(Boolean).join(' · ');
}
</script>

<style scoped lang="scss">
.cw-queue-toggle {
  justify-content: flex-start;
  flex-wrap: wrap;
}
.cw-queue-list {
  max-height: 160px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cw-queue-status {
  flex-shrink: 0;
  padding: 6px 14px;
  color: var(--cw-text-primary);
  background: var(--cw-bg-card-subtle);
  border-top: 1px solid var(--cw-border);
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cw-queue-row {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;

  .cw-queue-label {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    overflow-wrap: anywhere;
  }
}

.cw-queue-recoverable-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 8px;
  background: var(--cw-bg-surface);
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius-sm);

  .cw-recover-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;

    .cw-queue-preview-short {
      font-size: 11px;
      color: var(--cw-text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 400px;
    }
  }

  .cw-queue-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }
}

.cw-queue-err {
  margin: 0;
  color: var(--cw-danger);
  font-size: 11px;
}

.cw-receipts-summary-row {
  padding-top: 4px;
  border-top: 1px dashed var(--cw-border);
}

.cw-text-warning {
  color: var(--cw-warning, #d9822b);
}

/* 回执模态弹窗 */
.cw-receipts-modal {
  width: 600px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.cw-receipt-card {
  padding: 12px 14px;
  border-radius: var(--cw-radius-sm);
  background: var(--cw-bg-card);
  border: 1px solid var(--cw-border);
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;

  .cw-rc-header {
    display: flex;
    align-items: center;
    justify-content: space-between;

    .cw-rc-targets {
      font-size: 14px;
      font-weight: 600;
      color: var(--cw-text-primary);
    }
  }

  .cw-rc-tip {
    margin: 0;
    font-size: 12px;
    color: var(--cw-text-muted);
  }

  .cw-rc-field-section {
    display: flex;
    flex-direction: column;
    gap: 4px;

    .cw-rc-subtitle {
      font-size: 11px;
      color: var(--cw-text-secondary);
      font-weight: 500;
    }
  }

  .cw-rc-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;

    &.cw-chips-sm {
      margin-top: 6px;
    }
  }

  .cw-field-chip {
    padding: 2px 7px;
    border-radius: var(--cw-radius-full);
    border: 1px solid var(--cw-border);
    background: var(--cw-bg-surface);
    font-size: 11px;
    color: var(--cw-text-primary);

    &.cw-chip-muted {
      color: var(--cw-text-muted);
      background: var(--cw-bg-card-subtle);
    }
  }

  .cw-rc-unknown-box {
    padding: 8px 10px;
    background: var(--cw-bg-card-subtle);
    border-radius: var(--cw-radius-sm);
    font-size: 11px;

    .cw-unknown-header {
      display: flex;
      justify-content: space-between;
      color: var(--cw-text-secondary);
    }

    .cw-unknown-details {
      margin-top: 4px;
      cursor: pointer;
    }
  }

  .cw-rc-footer {
    display: flex;
    justify-content: flex-end;
    margin-top: 4px;
  }
}
</style>
