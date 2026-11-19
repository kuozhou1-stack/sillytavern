<template>
  <div class="cw-step-pane">
    <div class="cw-step-header">
      <h3 class="cw-step-title">第四步：居所环境、初始资产与随身物品</h3>
      <p class="cw-step-subtitle">
        规划您在瓦罗兰市的落脚处、开场时空、随身财务与物品。不确定的项目均可留空保持为未知。
      </p>
    </div>

    <!-- 模块 1：居所与常驻生活区 -->
    <div class="cw-section-box">
      <h4 class="cw-box-title">
        <SvgIcon name="home" :size="16" />
        <span>居所与常驻生活区</span>
      </h4>
      <fieldset class="cw-district-field">
        <legend class="cw-label">常驻片区（选填）</legend>
        <div class="cw-districts-grid">
          <label v-for="d in districts" :key="d.id" class="cw-district-card" :class="{ active: draft.片区id === d.id }">
            <input v-model="draft.片区id" type="radio" name="creation-district" :value="d.id" />
            <span class="cw-dist-text">
              <strong class="cw-dist-name">{{ d.name }}</strong>
              <span class="cw-dist-desc">{{ d.role }}</span>
            </span>
          </label>
        </div>
        <button v-if="draft.片区id" type="button" class="cw-clear-district" @click="draft.片区id = ''">清除片区选择</button>
      </fieldset>
      <label class="cw-home-description">
        <span class="cw-label">住处环境</span>
        <textarea v-model="draft.住处描述" rows="2" placeholder="例如：朝东的小公寓，窗外能看见沿街树影与轻轨线" class="cw-input"></textarea>
      </label>
    </div>

    <!-- 模块 2：开场时空与具体地点 -->
    <div class="cw-section-box">
      <h4 class="cw-box-title">
        <SvgIcon name="mapPin" :size="16" />
        <span>开场时空与具体地点</span>
      </h4>
      <p class="cw-box-subtitle">设定故事序幕拉开时，您所处的第一现场与开场具体时间。</p>

      <div class="cw-form-grid">
        <div class="cw-form-item cw-item-full">
          <label class="cw-label">开场所在具体公共地点：</label>
          <select
            :value="startLocation"
            class="cw-select"
            @change="emit('update:startLocation', ($event.target as HTMLSelectElement).value)"
          >
            <option value="">未知 / 暂不选定具体公共地点（自由开场）</option>
            <option v-for="(loc, id) in locations" :key="id" :value="id">
              {{ loc.名称 }} ({{ loc.地图位置?.精度 ?? '公共建筑' }})
            </option>
          </select>
          <span class="cw-hint">选定后作为故事起始时的所处地点，AI 将根据该处周边角色生成初次偶遇。</span>
        </div>

        <div class="cw-form-item">
          <label class="cw-label">开局日期与时间：</label>
          <input
            :value="startTime"
            type="datetime-local"
            class="cw-input"
            @input="emit('update:startTime', ($event.target as HTMLInputElement).value)"
          />
          <span class="cw-hint">留空表示使用角色卡当前既定时空。</span>
        </div>

        <div class="cw-form-item">
          <label class="cw-label">初始天气状况：</label>
          <input
            :value="weather"
            placeholder="例如：晴朗、微雨有风、清晨薄雾（留空为未知）"
            class="cw-input"
            @input="emit('update:weather', ($event.target as HTMLInputElement).value)"
          />
          <span class="cw-hint">开局首个场景的天气描写。</span>
        </div>
      </div>
    </div>

    <!-- 模块 3：初始财务与随身物品 -->
    <div class="cw-section-box">
      <div class="cw-box-header-row">
        <div>
          <h4 class="cw-box-title">
            <SvgIcon name="coins" :size="16" />
            <span>财务资产、邻信账号与随身物品</span>
          </h4>
          <p class="cw-box-subtitle">管理开局初始资金、智能手机邻信账号名与随身随行物品。</p>
        </div>
      </div>

      <div class="cw-form-grid" style="margin-bottom: 16px">
        <div class="cw-form-item">
          <label class="cw-label">初始资金余额（金币）：</label>
          <input
            :value="balance"
            type="number"
            min="0"
            step="0.01"
            placeholder="例如：3500.00（留空为未知）"
            class="cw-input"
            @input="emit('update:balance', ($event.target as HTMLInputElement).value)"
          />
          <span class="cw-hint">系统将自动转换为分进行精确结算，支持小数。</span>
        </div>

        <div class="cw-form-item">
          <label class="cw-label">邻信账号名称（手机社交）：</label>
          <input
            :value="phoneName"
            :placeholder="hasPlayerAccount ? '填写已有账号的名称' : '例如：江予安_Jiang（留空表示未注册邻信）'"
            class="cw-input"
            @input="emit('update:phoneName', ($event.target as HTMLInputElement).value)"
          />
          <span class="cw-hint">{{ hasPlayerAccount ? '沿用原账号和联系人，清空此栏只会清空账号名称。' : '用于手机通讯录、朋友圈及群聊中对外展示的个人账号名。' }}</span>
        </div>
      </div>

      <!-- 物品条目行内管理 -->
      <div class="cw-sub-header-row">
        <div class="cw-sub-title">
          <SvgIcon name="backpack" :size="14" />
          <span>随身携带物品明细</span>
        </div>
        <button type="button" class="cw-btn cw-btn-secondary cw-btn-xs" @click="addItemRow">
          <SvgIcon name="plus" :size="13" />
          <span>添加物品</span>
        </button>
      </div>

      <div v-if="itemsList.length > 0" class="cw-items-table">
        <div class="cw-item-row cw-item-header">
          <span class="cw-col-name">物品名称</span>
          <span class="cw-col-category">分类类别</span>
          <span class="cw-col-count">数量</span>
          <span class="cw-col-unit">单位</span>
          <span class="cw-col-action">操作</span>
        </div>
        <div v-for="(item, idx) in itemsList" :key="item.id || idx" class="cw-item-row cw-item-card">
          <div class="cw-col-name">
            <span class="cw-mobile-col-lbl">名称</span>
            <input v-model="item.名称" placeholder="物品名称（如钥匙）" class="cw-input" />
          </div>
          <div class="cw-col-category">
            <span class="cw-mobile-col-lbl">类别</span>
            <input v-model="item.类别" placeholder="数码/生活/工具" class="cw-input" />
          </div>
          <div class="cw-col-count">
            <span class="cw-mobile-col-lbl">数量</span>
            <input v-model.number="item.数量" type="number" placeholder="数量" class="cw-input" />
          </div>
          <div class="cw-col-unit">
            <span class="cw-mobile-col-lbl">单位</span>
            <input v-model="item.单位" placeholder="部/件" class="cw-input" />
          </div>
          <div class="cw-col-action">
            <button type="button" class="cw-btn-icon-del" title="删除此项" @click="removeItemRow(idx)">
              <SvgIcon name="close" :size="14" />
            </button>
          </div>
        </div>
      </div>
      <div v-else class="cw-empty-items-hint">
        <span>暂无预设随身物品。点击右上角“添加物品”添加，或留空开局。</span>
      </div>
    </div>

    <!-- 模块 4：初始身体生理状态 -->
    <div class="cw-section-box">
      <h4 class="cw-box-title">
        <SvgIcon name="activity" :size="16" />
        <span>初始身体生理状态（选填调节）</span>
      </h4>
      <p class="cw-box-subtitle">饱食度、水分值和体力值默认充足（100 分），如有特殊开局设定可手动微调。</p>

      <div class="cw-status-bars-setup">
        <div class="cw-status-input-row">
          <div class="cw-status-meta">
            <span class="cw-status-label">饱食度：</span>
            <span class="cw-status-val">{{ draft.饱食度 ?? 100 }}</span>
          </div>
          <div class="cw-input-slider-group">
            <input
              type="range"
              min="0"
              max="100"
              :value="draft.饱食度 ?? 100"
              class="cw-slider"
              @input="e => (draft.饱食度 = Number((e.target as HTMLInputElement).value))"
            />
            <button
              type="button"
              class="cw-btn cw-btn-xs cw-btn-ghost"
              @click="draft.饱食度 = 100"
            >
              满值 100
            </button>
          </div>
        </div>

        <div class="cw-status-input-row">
          <div class="cw-status-meta">
            <span class="cw-status-label">水分值：</span>
            <span class="cw-status-val">{{ draft.水分值 ?? 100 }}</span>
          </div>
          <div class="cw-input-slider-group">
            <input
              type="range"
              min="0"
              max="100"
              :value="draft.水分值 ?? 100"
              class="cw-slider"
              @input="e => (draft.水分值 = Number((e.target as HTMLInputElement).value))"
            />
            <button
              type="button"
              class="cw-btn cw-btn-xs cw-btn-ghost"
              @click="draft.水分值 = 100"
            >
              满值 100
            </button>
          </div>
        </div>

        <div class="cw-status-input-row">
          <div class="cw-status-meta">
            <span class="cw-status-label">体力值：</span>
            <span class="cw-status-val">{{ draft.体力值 ?? 100 }}</span>
          </div>
          <div class="cw-input-slider-group">
            <input
              type="range"
              min="0"
              max="100"
              :value="draft.体力值 ?? 100"
              class="cw-slider"
              @input="e => (draft.体力值 = Number((e.target as HTMLInputElement).value))"
            />
            <button
              type="button"
              class="cw-btn cw-btn-xs cw-btn-ghost"
              @click="draft.体力值 = 100"
            >
              满值 100
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useVModel } from '@vueuse/core';
import SvgIcon from '../icons/SvgIcon.vue';
import { cityDistricts } from '../../utils/city';

interface StartingItem {
  id: string;
  名称: string;
  类别: string;
  数量: number | null;
  单位: string;
}

const props = defineProps<{
  modelValue: {
    片区id: string;
    住处描述: string;
    饱食度: number | null;
    水分值: number | null;
    体力值: number | null;
  };
  startTime?: string;
  weather?: string;
  startLocation?: string;
  accountName?: string;
  balance?: string | number;
  phoneName?: string;
  hasPlayerAccount?: boolean;
  startingItems?: StartingItem[];
  locations?: Record<string, any>;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: typeof props.modelValue): void;
  (e: 'update:startTime', val: string): void;
  (e: 'update:weather', val: string): void;
  (e: 'update:startLocation', val: string): void;
  (e: 'update:accountName', val: string): void;
  (e: 'update:balance', val: string): void;
  (e: 'update:phoneName', val: string): void;
  (e: 'update:startingItems', val: StartingItem[]): void;
}>();

const draft = useVModel(props, 'modelValue', emit, { passive: true, deep: true, clone: true });

const itemsList = computed({
  get: () => props.startingItems || [],
  set: val => emit('update:startingItems', val),
});

function addItemRow() {
  const current = [...itemsList.value];
  current.push({
    id: 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    名称: '',
    类别: '',
    数量: 1,
    单位: '件',
  });
  itemsList.value = current;
}

function removeItemRow(idx: number) {
  const current = [...itemsList.value];
  current.splice(idx, 1);
  itemsList.value = current;
}

const districts = cityDistricts;
</script>

<style scoped lang="scss">
.cw-step-pane {
  display: flex;
  flex-direction: column;
  gap: 20px;
  container-type: inline-size;
}

.cw-step-header {
  border-bottom: 1px solid var(--cw-border);
  padding-bottom: 12px;

  .cw-step-title {
    margin: 0 0 6px;
    font-size: 17px;
    font-weight: 700;
    color: var(--cw-text-primary);
  }

  .cw-step-subtitle {
    margin: 0;
    font-size: 13px;
    color: var(--cw-text-secondary);
    line-height: 1.6;
  }
}

.cw-section-box {
  padding: 16px 20px;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card);
  border: 1px solid var(--cw-border);

  .cw-box-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .cw-box-title {
    margin: 0 0 4px;
    font-size: 14px;
    font-weight: 600;
    color: var(--cw-text-primary);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .cw-box-subtitle {
    margin: 0;
    font-size: 12px;
    color: var(--cw-text-muted);
  }
}

.cw-district-field {
  min-width: 0;
  margin: 12px 0;
  padding: 0;
  border: 0;
  legend { padding: 0; }
}
.cw-districts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 225px), 1fr));
  gap: 8px;
  margin-top: 6px;
}

.cw-district-card {
  position: relative;
  padding: 10px 12px;
  border-radius: var(--cw-radius-sm);
  border: 1px solid var(--cw-border);
  background: var(--cw-bg-surface);
  cursor: pointer;
  &:hover, &.active { border-color: var(--cw-accent); }
  &:has(input:focus-visible) { outline: 2px solid var(--cw-accent); outline-offset: 2px; }
  &.active {
    background: var(--cw-accent-bg);
  }
  input { position: absolute; width: 1px; height: 1px; margin: 0; opacity: 0; }
  .cw-dist-text { display: grid; gap: 3px; }
  .cw-dist-name { color: var(--cw-text-primary); font-size: 13px; line-height: 1.4; }
  .cw-dist-desc { color: var(--cw-text-secondary); font-size: 12px; line-height: 1.5; }
}
.cw-clear-district { margin-top: 6px; padding: 3px 0; border: 0; background: none; color: var(--cw-accent); font: inherit; font-size: 12px; cursor: pointer; }
.cw-home-description { display: grid; gap: 6px; padding-top: 12px; border-top: 1px solid var(--cw-border); }
.cw-home-description textarea { resize: vertical; line-height: 1.5; font-family: inherit; }

.cw-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 16px;

  .cw-form-item {
    display: flex;
    flex-direction: column;
    gap: 6px;

    &.cw-item-full {
      grid-column: 1 / -1;
    }
  }
}

.cw-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--cw-text-primary);
}

.cw-hint {
  font-size: 11px;
  color: var(--cw-text-muted);
}

.cw-input,
.cw-select {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius-sm);
  background: var(--cw-bg-input, var(--cw-bg-surface));
  color: var(--cw-text-primary);
  font-size: 12px;

  &:focus {
    border-color: var(--cw-accent);
    outline: none;
  }
}

/* 物品清单表格 */
.cw-sub-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
  margin-bottom: 8px;

  .cw-sub-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--cw-text-primary);
    display: flex;
    align-items: center;
    gap: 6px;
  }
}

.cw-items-table {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 6px;
}

.cw-mobile-col-lbl {
  display: none;
}

.cw-item-row {
  display: flex;
  align-items: center;
  gap: 8px;

  &.cw-item-header {
    font-size: 11px;
    font-weight: 600;
    color: var(--cw-text-muted);
    padding: 0 4px;
  }

  .cw-col-name {
    flex: 3;
    min-width: 0;
  }
  .cw-col-category {
    flex: 2;
    min-width: 0;
  }
  .cw-col-count {
    flex: 1.2;
    min-width: 50px;
  }
  .cw-col-unit {
    flex: 1.2;
    min-width: 50px;
  }
  .cw-col-action {
    width: 32px;
    display: flex;
    justify-content: center;
    flex-shrink: 0;
  }
}

.cw-btn-icon-del {
  background: none;
  border: none;
  color: var(--cw-text-muted);
  cursor: pointer;
  padding: 6px;
  border-radius: var(--cw-radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;

  &:hover {
    color: var(--cw-danger);
    background: rgba(192, 57, 43, 0.1);
  }
}

.cw-empty-items-hint {
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: var(--cw-text-muted);
  border: 1px dashed var(--cw-border);
  border-radius: var(--cw-radius-sm);
  margin-top: 8px;
}

/* 身体状态滑块 */
.cw-status-bars-setup {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 12px;
}

.cw-status-input-row {
  display: flex;
  align-items: center;
  gap: 16px;

  .cw-status-meta {
    width: 140px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    flex-shrink: 0;

    .cw-status-label {
      color: var(--cw-text-secondary);
    }
    .cw-status-val {
      font-weight: 600;
      color: var(--cw-text-primary);
    }
  }

  .cw-input-slider-group {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;

    .cw-slider {
      flex: 1;
    }
  }
}

@container (max-width: 545px) {
  .cw-form-grid {
    grid-template-columns: 1fr;
  }

  .cw-items-table {
    .cw-item-header {
      display: none;
    }

    .cw-item-card {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      padding: 10px;
      background: var(--cw-bg-surface);
      border: 1px solid var(--cw-border);
      border-radius: var(--cw-radius);
      .cw-col-action {
        grid-column: 1 / -1;
        width: auto;
        justify-content: flex-end;
      }

      .cw-mobile-col-lbl {
        display: block;
        font-size: 10px;
        color: var(--cw-text-muted);
        margin-bottom: 2px;
      }
    }
  }

  .cw-status-input-row {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;

    .cw-status-meta {
      width: 100%;
    }
  }
}
</style>
