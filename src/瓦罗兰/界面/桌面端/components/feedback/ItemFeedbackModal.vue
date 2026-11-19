<template>
  <div class="cw-modal-backdrop" @click.self="emit('close')">
    <div class="cw-modal-box cw-item-feedback-modal">
      <div class="cw-modal-header">
        <div class="cw-header-title">
          <SvgIcon name="bolt" :size="18" class="cw-header-icon" />
          <span>物品使用反馈</span>
        </div>
        <button class="cw-btn cw-btn-ghost cw-close-btn" @click="emit('close')">
          <SvgIcon name="close" :size="18" />
        </button>
      </div>

      <div class="cw-modal-body">
        <div class="cw-item-feedback-card">
          <div class="cw-fb-top">
            <span class="cw-fb-name">{{ item?.名称 || item?.id }}</span>
            <span class="cw-badge" :class="getBadgeClass(item?.类别)">{{ item?.类别 || '常规物品' }}</span>
          </div>

          <div class="cw-fb-rule-box">
            <template v-if="item?.类别 === '消耗品'">
              <div class="cw-rule-line cw-rule-consume">
                <SvgIcon name="alertCircle" :size="14" />
                <span>该物品为【消耗品】：使用后已扣减本次使用量 1 件。</span>
              </div>
              <div v-if="item?.数量 <= 0" class="cw-rule-line cw-rule-remove">
                <span>该消耗品剩余数量已归零，已从当前可用物品栏中规范化移除。</span>
              </div>
              <div v-else class="cw-rule-line">
                <span>剩余可用数量：{{ item?.数量 }} 件。</span>
              </div>
            </template>
            <template v-else>
              <div class="cw-rule-line cw-rule-keep">
                <SvgIcon name="check" :size="14" />
                <span
                  >该物品为【{{
                    item?.类别 || '非消耗品'
                  }}】：使用其相应功能，已完好保留在物品栏中，数量不作扣除。</span
                >
              </div>
            </template>
          </div>

          <div class="cw-action-effect-desc">
            <span class="cw-effect-title">本地演示反馈：</span>
            <p class="cw-effect-text">
              {{ getActionEffectText(item) }}
            </p>
          </div>
        </div>
      </div>

      <div class="cw-modal-footer">
        <button class="cw-btn cw-btn-primary" @click="emit('close')">确定</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import SvgIcon from '../icons/SvgIcon.vue';

const props = defineProps<{
  item: any;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

function getBadgeClass(cat?: string) {
  if (cat === '消耗品') return 'cw-badge-warning';
  if (cat === '工具与设备') return 'cw-badge-accent';
  return 'cw-badge-info';
}

function getActionEffectText(item: any) {
  if (!item) return '';
  if (item.类别 === '消耗品') {
    if (item.名称?.includes('水') || item.名称?.includes('饮')) {
      return '演示已扣除一份饮品；水分值变化须由实际剧情确定，此处未更新。';
    }
    return '演示已扣除一份食品；身体状态未自动更新。';
  }
  if (item.类别 === '工具与设备') {
    return `启动并使用了【${item.名称 || '工具'}】，仅作使用反馈，未写入场景记录。`;
  }
  if (item.类别 === '穿戴用品') {
    return `整理并穿戴了【${item.名称 || '用品'}】，仅作穿戴反馈，未更新穿搭变量。`;
  }
  if (item.类别 === '资料与凭证') {
    return `查阅并出示了【${item.名称 || '凭证'}】，仅作出示反馈，不代表已经取得准入权限。`;
  }
  return `使用了【${item.名称 || '物品'}】，相关行动已顺利完成。`;
}
</script>

<style scoped lang="scss">
.cw-item-feedback-modal {
  width: 480px;
}

.cw-modal-header {
  padding: 14px 18px;
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
  .cw-header-icon {
    color: var(--cw-accent);
  }
}

.cw-modal-body {
  padding: 20px;
}

.cw-item-feedback-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cw-fb-top {
  display: flex;
  align-items: center;
  justify-content: space-between;

  .cw-fb-name {
    font-size: 16px;
    font-weight: 700;
    color: var(--cw-text-primary);
  }
}

.cw-fb-rule-box {
  padding: 12px 14px;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;

  .cw-rule-line {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--cw-text-primary);

    &.cw-rule-consume {
      color: var(--cw-warning);
      font-weight: 500;
    }
    &.cw-rule-remove {
      color: var(--cw-danger);
    }
    &.cw-rule-keep {
      color: var(--cw-success);
      font-weight: 500;
    }
  }
}

.cw-action-effect-desc {
  display: flex;
  flex-direction: column;
  gap: 4px;

  .cw-effect-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--cw-text-secondary);
  }
  .cw-effect-text {
    margin: 0;
    font-size: 13px;
    color: var(--cw-text-primary);
    line-height: 1.6;
  }
}

.cw-modal-footer {
  padding: 12px 18px;
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid var(--cw-border);
  background: var(--cw-bg-card-subtle);
}
</style>
