<template>
  <div class="cw-tab-pane cw-char-tab-private">
    <!-- 判断是否适用 -->
    <div v-if="isApplicable" class="cw-private-content">
      <!-- 身体生理档案 -->
      <div class="cw-private-card">
        <h4 class="cw-section-title">
          <SvgIcon name="lock" :size="16" />
          <span>身体私密特征</span>
        </h4>
        <div class="cw-private-grid">
          <div class="cw-priv-cell cw-cell-full">
            <span class="cw-priv-k">胸部体征信息</span>
            <span class="cw-priv-v">{{ char?.性特征?.奶子信息 || '未知 / 未记录' }}</span>
          </div>
          <div class="cw-priv-cell cw-cell-full">
            <span class="cw-priv-k">下体密处信息</span>
            <span class="cw-priv-v">{{ char?.性特征?.蜜穴信息 || '未知 / 未记录' }}</span>
          </div>
          <div v-if="char?.性特征?.其他" class="cw-priv-cell cw-cell-full">
            <span class="cw-priv-k">特殊性癖与敏感体质</span>
            <span class="cw-priv-v">{{ char.性特征.其他 }}</span>
          </div>
        </div>
      </div>

      <!-- 性经历记录 -->
      <div class="cw-private-card">
        <h4 class="cw-section-title">
          <SvgIcon name="heart" :size="16" />
          <span>既往亲密经历档案</span>
        </h4>
        <div class="cw-private-grid">
          <div class="cw-priv-cell">
            <span class="cw-priv-k">经验确数</span>
            <span class="cw-priv-v">
              {{
                char?.性特征?.性经验?.性次数?.确数 !== null && char?.性特征?.性经验?.性次数?.确数 !== undefined
                  ? `${char.性特征.性经验.性次数.确数} 次`
                  : '未知 / 未确认'
              }}
            </span>
          </div>
          <div class="cw-priv-cell">
            <span class="cw-priv-k">概数说明</span>
            <span class="cw-priv-v">
              {{ char?.性特征?.性经验?.性次数?.概数说明 || '未知 / 未确认' }}
            </span>
          </div>
          <div class="cw-priv-cell cw-cell-full">
            <span class="cw-priv-k">亲密交往人群</span>
            <span class="cw-priv-v">
              {{ char?.性特征?.性经验?.性人群 || '未知 / 未确认' }}
            </span>
          </div>
          <div v-if="char?.性特征?.性经验?.性次数?.已知新增说明" class="cw-priv-cell cw-cell-full">
            <span class="cw-priv-k">近期新增说明</span>
            <span class="cw-priv-v">{{ char.性特征.性经验.性次数.已知新增说明 }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 不适用提示 -->
    <div v-else class="cw-not-applicable-box">
      <SvgIcon name="info" :size="32" class="cw-na-icon" />
      <span class="cw-na-title">本组资料不适用</span>
      <p class="cw-na-desc">该角色为男性、次要人物或当前未达到适用知情条件，依照设定规则省略整组私密字段。</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import SvgIcon from '../../icons/SvgIcon.vue';

const props = defineProps<{
  char: any;
}>();

const isApplicable = computed(() => {
  // 男性或者未定义性特征的对象整组省略
  const gender = props.char?.基础信息?.性别 || props.char?.性别;
  if (gender === '男') return false;
  return props.char?.性特征 !== undefined && props.char?.性特征 !== null;
});
</script>

<style scoped lang="scss">
.cw-char-tab-private {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cw-private-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cw-private-card {
  padding: 16px 20px;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card);
  border: 1px solid var(--cw-border);
}

.cw-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 14px;
  font-size: 14px;
  font-weight: 600;
  color: var(--cw-text-primary);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--cw-border);
}

.cw-private-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;

  .cw-priv-cell {
    padding: 10px 14px;
    border-radius: var(--cw-radius-sm);
    background: var(--cw-bg-card-subtle);
    border: 1px solid var(--cw-border);
    display: flex;
    flex-direction: column;
    gap: 4px;

    .cw-priv-k {
      font-size: 11px;
      color: var(--cw-text-muted);
    }
    .cw-priv-v {
      font-size: 13px;
      font-weight: 500;
      color: var(--cw-text-primary);
      line-height: 1.5;
    }

    &.cw-cell-full {
      grid-column: span 2;
    }
  }
}

.cw-not-applicable-box {
  padding: 48px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card-subtle);
  border: 1px dashed var(--cw-border);
  gap: 10px;

  .cw-na-icon {
    color: var(--cw-text-muted);
  }
  .cw-na-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--cw-text-primary);
  }
  .cw-na-desc {
    margin: 0;
    font-size: 13px;
    color: var(--cw-text-secondary);
    max-width: 440px;
    line-height: 1.6;
  }
}
</style>
