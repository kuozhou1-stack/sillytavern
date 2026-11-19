<template>
  <div class="cw-modal-backdrop" @click.self="emit('close')">
    <div class="cw-modal-box cw-wizard-modal">
      <div class="cw-modal-header">
        <div class="cw-header-title">
          <SvgIcon name="userPlus" :size="20" class="cw-header-icon" />
          <span>开局建档向导 (五步建档)</span>
        </div>
        <button class="cw-btn cw-btn-ghost cw-close-btn" @click="emit('close')">
          <SvgIcon name="close" :size="18" />
        </button>
      </div>

      <!-- 步骤指示条 -->
      <div class="cw-steps-indicator">
        <div
          v-for="s in 5"
          :key="s"
          class="cw-step-dot"
          :class="{ active: currentStep === s, finished: currentStep > s }"
          @click="currentStep = s"
        >
          <span class="cw-step-num">{{ s }}</span>
          <span class="cw-step-label">{{ stepLabels[s - 1] }}</span>
        </div>
      </div>

      <div class="cw-modal-body">
        <!-- 步骤 1：姓名与基本身份 -->
        <div v-if="currentStep === 1" class="cw-wizard-step">
          <div class="cw-step-desc">第一步：确定您在瓦罗兰市的基本姓名、称呼与社会身份。</div>
          <div class="cw-wizard-form">
            <div class="cw-f-item">
              <label>角色姓名：</label>
              <input v-model="form.姓名" placeholder="例如：江予安" class="cw-input" />
            </div>
            <div class="cw-f-item">
              <label>日常称呼/自称：</label>
              <input v-model="form.称呼" placeholder="例如：予安 / 小安" class="cw-input" />
            </div>
            <div class="cw-f-item">
              <label>性别：</label>
              <select v-model="form.性别" class="cw-select">
                <option value="男">男</option>
                <option value="女">女</option>
                <option value="其他">其他</option>
              </select>
            </div>
            <div class="cw-f-item">
              <label>年龄 (由玩家自主决定填写)：</label>
              <input v-model.number="form.年龄" type="number" placeholder="例如：26" class="cw-input" />
            </div>
          </div>
        </div>

        <!-- 步骤 2：外貌与身形 -->
        <div v-else-if="currentStep === 2" class="cw-wizard-step">
          <div class="cw-step-desc">第二步：勾勒角色外貌、身形特征与穿搭风格。</div>
          <div class="cw-wizard-form">
            <div class="cw-f-item">
              <label>身高 / 体重：</label>
              <input v-model="form.身形" placeholder="例如：178cm / 68kg，匀称挺拔" class="cw-input" />
            </div>
            <div class="cw-f-item">
              <label>显著面容与发型：</label>
              <input v-model="form.发型特征" placeholder="例如：短碎发微卷，戴黑框眼镜" class="cw-input" />
            </div>
            <div class="cw-f-item cw-item-full">
              <label>整体外貌描述：</label>
              <textarea
                v-model="form.外貌描述"
                rows="3"
                placeholder="整体衣着习惯与第一眼给人的气质印象..."
                class="cw-textarea"
              ></textarea>
            </div>
          </div>
        </div>

        <!-- 步骤 3：生平背景与职业 -->
        <div v-else-if="currentStep === 3" class="cw-wizard-step">
          <div class="cw-step-desc">第三步：设定身份与社会经历。</div>
          <div class="cw-wizard-form">
            <div class="cw-f-item">
              <label>身份：</label>
              <input v-model="form.身份" placeholder="例如：自由摄影师 / 文案策划" class="cw-input" />
            </div>
            <div class="cw-f-item cw-item-full">
              <label>重要过往经历：</label>
              <textarea
                v-model="form.重要过往"
                rows="3"
                placeholder="简述过往求学或来沪生活的契机..."
                class="cw-textarea"
              ></textarea>
            </div>
          </div>
        </div>

        <!-- 步骤 4：居所与开局片区 -->
        <div v-else-if="currentStep === 4" class="cw-wizard-step">
          <div class="cw-step-desc">第四步：挑选初始常驻片区与起居住所。</div>
          <div class="cw-wizard-form">
            <div class="cw-f-item cw-item-full">
              <label>落脚片区：</label>
              <select v-model="form.片区" class="cw-select">
                <option v-for="district in cityDistricts" :key="district.id" :value="district.id">
                  {{ district.name }}（{{ district.role }}）
                </option>
              </select>
            </div>
            <div class="cw-f-item cw-item-full">
              <label>住处描述：</label>
              <input v-model="form.住处" placeholder="例如：艺文居住区里一间带露台的小公寓" class="cw-input" />
            </div>
          </div>
        </div>

        <!-- 步骤 5：档案确认并生成 -->
        <div v-else-if="currentStep === 5" class="cw-wizard-step">
          <div class="cw-step-desc">第五步：复核初始事实。确认后将初始化角色状态并开启瓦洛兰生活！</div>
          <div class="cw-review-card">
            <div class="cw-review-row">
              <span>姓名：</span><b>{{ form.姓名 || '未填' }} ({{ form.称呼 || '无' }})</b>
            </div>
            <div class="cw-review-row">
              <span>性别与年龄：</span><b>{{ form.性别 }} · {{ form.年龄 }}岁</b>
            </div>
            <div class="cw-review-row">
              <span>身份：</span><b>{{ form.身份 }}</b>
            </div>
            <div class="cw-review-row">
              <span>居住地：</span><b>{{ form.住处 }}</b>
            </div>
          </div>
        </div>
      </div>

      <div class="cw-modal-footer">
        <button v-if="currentStep > 1" class="cw-btn cw-btn-ghost" @click="currentStep--">上一步</button>
        <button v-if="currentStep < 5" class="cw-btn cw-btn-primary" @click="currentStep++">下一步</button>
        <button v-else class="cw-btn cw-btn-primary" @click="handleFinish">完成建档并开启游戏</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { cityDistricts } from '../../utils/city';
import { ref } from 'vue';
import SvgIcon from '../icons/SvgIcon.vue';

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'finish', profile: any): void;
}>();

const currentStep = ref(1);
const stepLabels = ['基本身份', '外貌身形', '背景经历', '居住片区', '确认档案'];

const form = ref({
  姓名: '江予安',
  称呼: '予安',
  性别: '男',
  年龄: 26,
  身形: '178cm / 68kg 匀称挺拔',
  发型特征: '黑色短碎发，戴微金边眼镜',
  外貌描述: '穿着素色棉麻衬衫与深色休闲长裤，神态从容温和。',
  身份: '自由摄影师与撰稿人',
  重要过往: '大学毕业后辗转数城，半年前决定在瓦罗兰定居，探索街区、展览与日常生活。',
  片区: 'residential',
  住处: '静安风尚生活广场附近的一间采光良好的公寓',
});

function handleFinish() {
  emit('finish', form.value);
  emit('close');
}
</script>

<style scoped lang="scss">
.cw-wizard-modal {
  width: 640px;
  height: 560px;
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

.cw-steps-indicator {
  display: flex;
  justify-content: space-between;
  padding: 14px 24px;
  background: var(--cw-bg-surface);
  border-bottom: 1px solid var(--cw-border);

  .cw-step-dot {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    font-size: 12px;
    color: var(--cw-text-muted);

    .cw-step-num {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: var(--cw-bg-card-subtle);
      border: 1px solid var(--cw-border);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
    }

    &.active {
      color: var(--cw-accent);
      font-weight: 600;

      .cw-step-num {
        background: var(--cw-accent);
        color: #fff;
        border-color: var(--cw-accent);
      }
    }

    &.finished {
      color: var(--cw-success);

      .cw-step-num {
        background: var(--cw-success-bg);
        color: var(--cw-success);
        border-color: rgba(63, 143, 107, 0.4);
      }
    }
  }
}

.cw-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

.cw-step-desc {
  font-size: 13px;
  color: var(--cw-text-secondary);
  margin-bottom: 16px;
}

.cw-wizard-form {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;

  .cw-f-item {
    display: flex;
    flex-direction: column;
    gap: 6px;

    label {
      font-size: 12px;
      font-weight: 600;
      color: var(--cw-text-secondary);
    }

    .cw-input,
    .cw-select,
    .cw-textarea {
      padding: 8px 12px;
      border-radius: var(--cw-radius-sm);
      border: 1px solid var(--cw-border);
      background: var(--cw-bg-input);
      font-size: 13px;
      color: var(--cw-text-primary);
      outline: none;

      &:focus {
        border-color: var(--cw-accent);
      }
    }

    &.cw-item-full {
      grid-column: span 2;
    }
  }
}

.cw-review-card {
  padding: 16px;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 13px;

  .cw-review-row {
    display: flex;
    gap: 8px;
    span {
      color: var(--cw-text-muted);
      width: 100px;
    }
    b {
      color: var(--cw-text-primary);
    }
  }
}

.cw-modal-footer {
  padding: 14px 20px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid var(--cw-border);
  background: var(--cw-bg-card-subtle);
}
</style>
