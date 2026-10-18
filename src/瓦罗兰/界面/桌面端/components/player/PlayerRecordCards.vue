<template>
  <div ref="rootRef" class="cw-player-record-cards-root" @keydown.esc.stop="closeDetail">
    <!-- 统一检索与时间排序工具栏 (解决问题 14) -->
    <div class="cw-records-toolbar">
      <div class="cw-search-input-wrap">
        <SvgIcon name="search" :size="14" class="cw-search-icon" />
        <input
          v-model="searchQuery"
          type="search"
          class="cw-input cw-records-search-input"
          :placeholder="searchPlaceholder"
          aria-label="搜索记录关键词"
        />
        <button
          v-if="searchQuery"
          type="button"
          class="cw-btn-clear"
          title="清空搜索"
          @click="searchQuery = ''"
        >
          <SvgIcon name="close" :size="12" />
        </button>
      </div>

      <div class="cw-sort-toggle">
        <button
          type="button"
          class="cw-btn cw-btn-secondary cw-btn-xs cw-sort-btn"
          :title="hasRecordTimes ? '按已记录的日期切换先后顺序，未记录日期的内容列在后面' : '没有记录日期，按录入顺序切换'"
          @click="sortOrder = sortOrder === 'desc' ? 'asc' : 'desc'"
        >
          <SvgIcon :name="sortOrder === 'desc' ? 'arrowDown' : 'arrowUp'" :size="13" />
          <span>{{ hasRecordTimes ? (sortOrder === 'desc' ? '最新在先' : '较早在先') : (sortOrder === 'desc' ? '录入倒序' : '录入正序') }}</span>
        </button>
      </div>
    </div>

    <!-- 备忘与经历：直接展示三列卡片网格 -->
    <template v-if="tab !== 'knowledge'">
      <div v-if="sortedRecordItems.length > 0" class="cw-record-card-grid">
        <div
          v-for="item in sortedRecordItems"
          :key="item.id"
          class="cw-record-card is-interactive"
          tabindex="0"
          role="button"
          :aria-label="`查看 ${item.title} 详情`"
          @click="openDetail(item, $event)"
          @keydown.enter="openDetail(item, $event)"
        >
          <!-- 头部：标题与性质徽标 (移除重复分类标签，解决问题 16) -->
          <div class="cw-card-header">
            <div class="cw-card-title" :title="item.title">{{ item.title }}</div>
            <div class="cw-card-badges">
              <span
                v-if="item.timeBadge"
                class="cw-card-time-badge"
              >
                {{ item.timeBadge }}
              </span>
              <span
                v-if="item.nature"
                class="cw-card-nature-badge"
                :class="natureClass(item.nature)"
              >
                {{ item.nature }}
              </span>
            </div>
          </div>

          <!-- 正文或摘要 -->
          <div class="cw-card-body">
            <p class="cw-card-text">{{ item.content }}</p>
          </div>

          <!-- 底部辅助信息标签与规范详情胶囊按钮 (解决问题 16) -->
          <div class="cw-card-footer">
            <div v-if="item.tags.length > 0" class="cw-card-tags">
              <span
                v-for="(tag, idx) in item.tags.slice(0, 3)"
                :key="idx"
                class="cw-tag-chip"
                :title="`${tag.label}: ${tag.value}`"
              >
                <span class="cw-tag-k">{{ tag.label }}:</span>
                <span class="cw-tag-v">{{ tag.value }}</span>
              </span>
              <span v-if="item.tags.length > 3" class="cw-tag-chip cw-tag-more">
                +{{ item.tags.length - 3 }}
              </span>
            </div>

            <div class="cw-card-action">
              <button
                type="button"
                class="cw-detail-btn"
                aria-label="查看详情"
                @click.stop="openDetail(item, $event)"
              >
                <span>查看详情</span>
                <SvgIcon name="chevronRight" :size="12" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else class="cw-empty-compact">
        <SvgIcon name="bookmark" :size="15" class="cw-empty-icon" />
        <span>{{ searchQuery ? '未搜索到匹配的记录' : emptyText }}</span>
      </div>
    </template>

    <!-- 已知信息：严格分类展示，不把不同内容混在一起 -->
    <template v-else>
      <div v-if="totalKnowledgeCount > 0" class="cw-knowledge-container">
        <!-- 二级分类筛选标签栏 -->
        <div class="cw-subcat-tabs" role="tablist" aria-label="已知信息分类">
          <button
            type="button"
            class="cw-subcat-tab"
            :class="{ active: selectedSubCat === 'all' }"
            @click="selectedSubCat = 'all'"
          >
            全部 <span>{{ totalKnowledgeCount }}</span>
          </button>
          <button
            v-for="group in knowledgeGroups"
            v-show="group.items.length > 0"
            :key="group.key"
            type="button"
            class="cw-subcat-tab"
            :class="{ active: selectedSubCat === group.key }"
            @click="selectedSubCat = group.key"
          >
            <SvgIcon :name="group.icon" :size="12" />
            {{ group.label }} <span>{{ group.items.length }}</span>
          </button>
        </div>

        <!-- 独立分类分组展示（互不混杂） -->
        <div class="cw-knowledge-groups-list">
          <div
            v-for="group in displayedKnowledgeGroups"
            :key="group.key"
            class="cw-knowledge-group-section"
          >
            <!-- 分类标题栏（附带图标与本类总数） -->
            <div class="cw-group-section-header">
              <div class="cw-group-section-title">
                <SvgIcon :name="group.icon" :size="14" class="cw-group-icon" />
                <span>{{ group.label }}</span>
                <span class="cw-group-badge">{{ group.items.length }}</span>
              </div>
            </div>

            <!-- 本分类专用的三列卡片网格 -->
            <div class="cw-record-card-grid">
              <div
                v-for="item in group.items"
                :key="item.id"
                class="cw-record-card is-interactive"
                tabindex="0"
                role="button"
                :aria-label="`查看 ${item.title} 详情`"
                @click="openDetail(item, $event)"
                @keydown.enter="openDetail(item, $event)"
              >
                <!-- 头部：标题与性质徽标 (已在分类组内，无需重复标注分类名) -->
                <div class="cw-card-header">
                  <div class="cw-card-title" :title="item.title">{{ item.title }}</div>
                  <div class="cw-card-badges">
                    <span
                      v-if="item.timeBadge"
                      class="cw-card-time-badge"
                    >
                      {{ item.timeBadge }}
                    </span>
                    <span
                      v-if="item.nature"
                      class="cw-card-nature-badge"
                      :class="natureClass(item.nature)"
                    >
                      {{ item.nature }}
                    </span>
                  </div>
                </div>

                <!-- 正文或摘要 -->
                <div class="cw-card-body">
                  <p class="cw-card-text">{{ item.content }}</p>
                </div>

                <!-- 底部辅助信息标签与详情胶囊按钮 -->
                <div class="cw-card-footer">
                  <div v-if="item.tags.length > 0" class="cw-card-tags">
                    <span
                      v-for="(tag, idx) in item.tags.slice(0, 3)"
                      :key="idx"
                      class="cw-tag-chip"
                      :title="`${tag.label}: ${tag.value}`"
                    >
                      <span class="cw-tag-k">{{ tag.label }}:</span>
                      <span class="cw-tag-v">{{ tag.value }}</span>
                    </span>
                    <span v-if="item.tags.length > 3" class="cw-tag-chip cw-tag-more">
                      +{{ item.tags.length - 3 }}
                    </span>
                  </div>

                  <div class="cw-card-action">
                    <button
                      type="button"
                      class="cw-detail-btn"
                      aria-label="查看详情"
                      @click.stop="openDetail(item, $event)"
                    >
                      <span>查看详情</span>
                      <SvgIcon name="chevronRight" :size="12" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 已知信息整体为空状态 -->
      <div v-else class="cw-empty-compact">
        <SvgIcon name="bookmark" :size="15" class="cw-empty-icon" />
        <span>当前无已知信息记录</span>
      </div>
    </template>

    <!-- 平面化详情弹窗：挂载到当前可见界面的缩放根/桌面壳容器内，避免流式同层模式下落入隐藏后台脚本 iframe -->
    <Teleport :to="teleportTarget || 'body'" :disabled="!teleportTarget">
      <div
        v-if="detailItem"
        class="cw-record-modal-overlay"
        role="dialog"
        aria-modal="true"
        :aria-label="detailItem.title"
        @click.self="closeDetail"
        @keydown.esc.stop.prevent="closeDetail"
      >
        <div class="cw-record-modal-panel">
          <div class="cw-modal-header">
            <div class="cw-modal-title-group">
              <span class="cw-modal-category">{{ detailItem.category }}</span>
              <span
                v-if="detailItem.nature"
                class="cw-card-nature-badge"
                :class="natureClass(detailItem.nature)"
              >
                {{ detailItem.nature }}
              </span>
              <h3 class="cw-modal-title">{{ detailItem.title }}</h3>
            </div>
            <button
              ref="closeBtnRef"
              type="button"
              class="cw-modal-close-btn"
              aria-label="关闭详情"
              @click="closeDetail"
            >
              <SvgIcon name="close" :size="16" />
            </button>
          </div>

          <div class="cw-modal-content">
            <!-- 完整主要内容 -->
            <div class="cw-modal-section">
              <div class="cw-modal-label">详细内容</div>
              <div class="cw-modal-body-text">{{ detailItem.content }}</div>
            </div>

            <!-- 平面键值辅助属性 -->
            <div v-if="detailItem.details.length > 0" class="cw-modal-section">
              <div class="cw-modal-label">相关属性与来源</div>
              <div class="cw-modal-props-grid">
                <div
                  v-for="(prop, pIdx) in detailItem.details"
                  :key="pIdx"
                  class="cw-modal-prop-item"
                >
                  <span class="cw-prop-k">{{ prop.label }}</span>
                  <span class="cw-prop-v">{{ prop.value }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="cw-modal-footer">
            <button
              type="button"
              class="cw-btn cw-btn-sm"
              @click="closeDetail"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import SvgIcon from '../icons/SvgIcon.vue';
import { locationName } from '../../utils/context';
import { resolveAccountName } from '../../utils/entity';

export interface CardTag {
  label: string;
  value: string;
}

export interface FlatRecordItem {
  id: string;
  category: string;
  title: string;
  content: string;
  nature?: string;
  timeBadge?: string;
  timestamp?: number;
  tags: CardTag[];
  details: CardTag[];
  raw?: any;
}

export interface KnowledgeGroup {
  key: string;
  label: string;
  icon: string;
  items: FlatRecordItem[];
}

const props = defineProps<{
  tab: 'memos' | 'experiences' | 'knowledge';
  player: any;
  state: any;
}>();

const rootRef = ref<HTMLElement | null>(null);
const detailItem = ref<FlatRecordItem | null>(null);
const selectedSubCat = ref<string>('all');
const searchQuery = ref('');
const sortOrder = ref<'desc' | 'asc'>('desc');
const closeBtnRef = ref<HTMLButtonElement | null>(null);
let _lastFocused: HTMLElement | null = null;

const teleportTarget = computed<HTMLElement | null>(() => {
  const root = rootRef.value;
  if (!root) return null;
  return (
    (root.closest('.cw-scale-root') as HTMLElement | null) ??
    (root.closest('.cw-desktop-shell') as HTMLElement | null) ??
    root.ownerDocument?.body ??
    null
  );
});

const searchPlaceholder = computed(() => {
  if (props.tab === 'memos') return '搜索备忘标题、内容或关联事项...';
  if (props.tab === 'experiences') return '搜索经历提要、日期或事件关键词...';
  return '搜索获知事项、认识人物、地点或账号...';
});

function openDetail(item: FlatRecordItem, event?: Event) {
  const doc = rootRef.value?.ownerDocument ?? document;
  const triggerEl = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  _lastFocused = triggerEl ?? (doc.activeElement instanceof HTMLElement ? doc.activeElement : null);
  if (triggerEl && doc.activeElement !== triggerEl) {
    triggerEl.focus({ preventScroll: true });
  }
  detailItem.value = item;
  nextTick(() => {
    closeBtnRef.value?.focus({ preventScroll: true });
  });
}

function closeDetail() {
  const toRestore = _lastFocused;
  _lastFocused = null;
  detailItem.value = null;
  nextTick(() => {
    if (toRestore && toRestore.isConnected) {
      toRestore.focus({ preventScroll: true });
    }
  });
}

function handleEscapeKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && detailItem.value) {
    e.preventDefault();
    e.stopImmediatePropagation();
    closeDetail();
  }
}

let hostWin: Window | null = null;
onMounted(() => {
  window.addEventListener('keydown', handleEscapeKeydown, true);
  const view = rootRef.value?.ownerDocument?.defaultView;
  if (view && view !== window) {
    hostWin = view;
    hostWin.addEventListener('keydown', handleEscapeKeydown, true);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleEscapeKeydown, true);
  if (hostWin) {
    hostWin.removeEventListener('keydown', handleEscapeKeydown, true);
    hostWin = null;
  }
});

function characterName(state: any, id: unknown): string {
  if (typeof id !== 'string' || !id) return '未知人物';
  if (id === state?.玩家?.id) return state?.玩家?.姓名 || state?.玩家?.称呼 || '本人';
  const person = state?.角色?.[id];
  return person?.姓名 || person?.称呼 || id;
}

function resolvePlace(state: any, id: unknown): string {
  if (typeof id !== 'string' || !id) return '未知地点';
  return locationName(state, id) || id;
}

function resolveAccount(state: any, id: unknown): string {
  if (typeof id !== 'string' || !id) return '未知账号';
  return resolveAccountName(state, id) || id;
}

function formatTime(t: any): string | null {
  if (!t || typeof t !== 'object') return null;
  if (t.年 == null) return null;
  const mm = t.月 != null ? `${t.月}月` : '';
  const dd = t.日 != null ? `${t.日}日` : '';
  const timeStr = t.时 != null && t.分 != null ? ` ${String(t.时).padStart(2, '0')}:${String(t.分).padStart(2, '0')}` : '';
  return `${t.年}年${mm}${dd}${timeStr}`.trim();
}

function recordTime(item: FlatRecordItem): number | null {
  const raw = item.raw;
  const time = raw?.来源?.获得时间 ?? raw?.获得时间 ?? raw?.位置获知时间;
  if (time?.年 != null && time?.月 != null && time?.日 != null)
    return Date.UTC(time.年, time.月 - 1, time.日, time.时 ?? 0, time.分 ?? 0);
  // 只解析明确的公历日期；“小时候”等说明不伪造日期。
  const date = typeof raw?.日期说明 === 'string' && raw.日期说明.match(/^(\d{4})[年/-](\d{1,2})(?:[月/-](\d{1,2}))?/);
  return date ? Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3] ?? 1)) : null;
}

function sortRecords(items: FlatRecordItem[]): FlatRecordItem[] {
  const direction = sortOrder.value === 'asc' ? 1 : -1;
  return items.map((item, index) => ({ item, index, time: recordTime(item) }))
    .sort((a, b) => {
      if (a.time != null && b.time != null) return direction * (a.time - b.time || a.index - b.index);
      if (a.time != null) return -1;
      if (b.time != null) return 1;
      return direction * (a.index - b.index);
    }).map(row => row.item);
}

const hasRecordTimes = computed(() => (props.tab === 'knowledge'
  ? knowledgeGroups.value.flatMap(group => group.items) : recordItems.value).some(item => recordTime(item) != null));

function natureClass(nature: string) {
  switch (nature) {
    case '事实':
      return 'cw-nature-fact';
    case '推测':
      return 'cw-nature-spec';
    case '误解':
      return 'cw-nature-mis';
    case '未确认':
    default:
      return 'cw-nature-unconfirmed';
  }
}

const emptyText = computed(() => {
  if (props.tab === 'memos') return '当前无特别个人备忘';
  if (props.tab === 'experiences') return '当前无重要经历记录';
  return '当前无已知信息记录';
});

// 备忘或经历卡片
const recordItems = computed<FlatRecordItem[]>(() => {
  const p = props.player;
  const s = props.state;
  if (!p) return [];

  // 1. 备忘
  if (props.tab === 'memos') {
    const memos = p.个人记录?.个人备忘 ?? {};
    const list: FlatRecordItem[] = [];
    for (const [id, memo] of Object.entries(memos) as [string, any][]) {
      if (!memo || typeof memo !== 'object') continue;
      const content = memo.内容 || '备忘细节暂未详述';
      let title = memo.标题;
      if (!title || title.startsWith('memo_') || title === id) {
        const clean = content.replace(/^[\s#*>\-]+/, '').trim();
        const firstLine = clean.split('\n')[0].trim();
        title = firstLine.length > 0 && firstLine.length <= 22 ? firstLine : (clean.slice(0, 18) + (clean.length > 18 ? '…' : '')) || '个人备忘';
      }
      const tags: CardTag[] = [];
      const details: CardTag[] = [];

      if (Array.isArray(memo.关联事项id) && memo.关联事项id.length > 0) {
        const items = memo.关联事项id.join('、');
        details.push({ label: '关联事项', value: items });
      }

      list.push({
        id,
        category: '备忘',
        title,
        content,
        tags,
        details,
        raw: memo,
      });
    }
    return list;
  }

  // 2. 经历 (解决问题 15：提取经历关键事实为标题，日期降为辅助标签)
  if (props.tab === 'experiences') {
    const exps = p.个人记录?.重要经历 ?? {};
    const list: FlatRecordItem[] = [];
    for (const [id, exp] of Object.entries(exps) as [string, any][]) {
      if (!exp || typeof exp !== 'object') continue;
      const content = exp.经历 || '经历细节暂未详述';
      // 智能提取第一句或前 20 字作为具有高辨识度的主标题
      const clean = content.replace(/^[\s#*>\-]+/, '').trim();
      const firstSent = clean.split(/[。！？\n]/)[0].trim();
      const title = firstSent.length >= 4 && firstSent.length <= 26
        ? firstSent
        : (clean.slice(0, 22) + (clean.length > 22 ? '…' : '')) || '重要经历';
      const timeBadge = exp.日期说明 || '';

      const tags: CardTag[] = [];
      const details: CardTag[] = [];

      if (exp.日期说明) {
        tags.push({ label: '时间', value: exp.日期说明 });
        details.push({ label: '日期说明', value: exp.日期说明 });
      }
      if (exp.日期精度 && exp.日期精度 !== '未知') {
        tags.push({ label: '精度', value: exp.日期精度 });
        details.push({ label: '日期精度', value: exp.日期精度 });
      }
      if (exp.来源存档id && typeof exp.来源存档id === 'string') {
        details.push({ label: '来源存档', value: '有存档记录' });
      }
      if (Array.isArray(exp.来源事件id) && exp.来源事件id.length > 0) {
        tags.push({ label: '关联事件', value: `${exp.来源事件id.length} 项` });
        details.push({ label: '关联事件数', value: `${exp.来源事件id.length} 项` });
      }

      list.push({
        id,
        category: '经历',
        title,
        timeBadge,
        content,
        tags,
        details,
        raw: exp,
      });
    }
    return list;
  }

  return [];
});

// 备忘/经历排序与检索计算
const sortedRecordItems = computed(() => {
  let list = recordItems.value;
  const q = searchQuery.value.trim().toLowerCase();
  if (q) {
    list = list.filter(item =>
      item.title.toLowerCase().includes(q) ||
      item.content.toLowerCase().includes(q) ||
      (item.timeBadge && item.timeBadge.toLowerCase().includes(q)) ||
      item.tags.some(t => t.value.toLowerCase().includes(q)),
    );
  }
  return sortRecords(list);
});

// 已知信息：分 4 个严格独立的分类分组
const knowledgeGroups = computed<KnowledgeGroup[]>(() => {
  const p = props.player;
  const s = props.state;
  if (!p) return [];
  const kn = p.已知信息 ?? {};

  // 3.1 获知事项
  const factsList: FlatRecordItem[] = [];
  const facts = kn.获知事项 ?? {};
  for (const [id, fact] of Object.entries(facts) as [string, any][]) {
    if (!fact || typeof fact !== 'object') continue;
    const content = fact.内容 || '事项内容暂未详述';
    let title = '';
    if (fact.对象id) {
      const who = characterName(s, fact.对象id);
      const place = resolvePlace(s, fact.对象id);
      const acc = resolveAccount(s, fact.对象id);
      title = who !== '未知人物' ? who : place !== '未知地点' ? place : acc !== '未知账号' ? acc : '获知事项';
    }
    if (!title) {
      title = content.length > 16 ? content.slice(0, 16) + '...' : content;
    }
    const nature = fact.性质 || '未确认';
    const tags: CardTag[] = [];
    const details: CardTag[] = [];

    tags.push({ label: '性质', value: nature });
    details.push({ label: '信息性质', value: nature });

    if (fact.来源?.方式 && fact.来源.方式 !== '未设定') {
      tags.push({ label: '来源方式', value: fact.来源.方式 });
      details.push({ label: '来源方式', value: fact.来源.方式 });
    }
    if (fact.来源?.人物id) {
      const who = characterName(s, fact.来源.人物id);
      tags.push({ label: '来源人物', value: who });
      details.push({ label: '来源人物', value: who });
    }
    if (fact.来源?.说明) {
      details.push({ label: '来源说明', value: fact.来源.说明 });
    }
    const timeStr = formatTime(fact.来源?.获得时间);
    if (timeStr) {
      tags.push({ label: '获知时间', value: timeStr });
      details.push({ label: '获知时间', value: timeStr });
    }
    if (fact.对象id) {
      const _charN = characterName(s, fact.对象id);
      const _placeN = resolvePlace(s, fact.对象id);
      const _accN = resolveAccount(s, fact.对象id);
      const displayObj = _charN !== '未知人物' ? _charN
        : _placeN !== '未知地点' ? _placeN
        : _accN !== '未知账号' ? _accN
        : null;
      if (displayObj) details.push({ label: '关联对象', value: displayObj });
    }
    if (fact.分享范围) {
      details.push({ label: '分享范围', value: fact.分享范围 });
    }

    factsList.push({
      id: `fact_${id}`,
      category: '获知事项',
      title,
      content,
      nature,
      tags,
      details,
      raw: fact,
    });
  }

  // 3.2 已认识人物
  const peopleList: FlatRecordItem[] = [];
  const people = kn.已认识人物 ?? {};
  for (const [charId, person] of Object.entries(people) as [string, any][]) {
    if (!person || typeof person !== 'object') continue;
    const name = characterName(s, charId);
    const title = name !== '未知人物' ? name : person.称呼 || '认识人物';
    const content = person.已知资料 || (person.称呼 ? `已知称呼为“${person.称呼}”` : '已结识该人物');
    const tags: CardTag[] = [];
    const details: CardTag[] = [];

    if (person.称呼) {
      details.push({ label: '已知称呼', value: person.称呼 });
    }
    if (person.上次已知地点id) {
      const place = resolvePlace(s, person.上次已知地点id);
      tags.push({ label: '上次地点', value: place });
      details.push({ label: '上次已知地点', value: place });
    }
    if (person.已明确不在场) {
      tags.push({ label: '状态', value: '明确不在场' });
      details.push({ label: '在场状态', value: '已明确不在场' });
    } else {
      details.push({ label: '在场状态', value: '未确认不在场' });
    }
    if (person.来源?.方式 && person.来源.方式 !== '未设定') {
      tags.push({ label: '获知方式', value: person.来源.方式 });
      details.push({ label: '来源方式', value: person.来源.方式 });
    }
    const timeStr = formatTime(person.来源?.获得时间) || formatTime(person.位置获知时间);
    if (timeStr) {
      tags.push({ label: '时间', value: timeStr });
      details.push({ label: '获知时间', value: timeStr });
    }

    peopleList.push({
      id: `person_${charId}`,
      category: '认识人物',
      title,
      content,
      tags,
      details,
      raw: person,
    });
  }

  // 3.3 已知地点
  const placesList: FlatRecordItem[] = [];
  const places = kn.已知地点 ?? {};
  for (const [locId, place] of Object.entries(places) as [string, any][]) {
    if (!place || typeof place !== 'object') continue;
    const title = resolvePlace(s, locId);
    const content = place.说明 || '已获知该地点位置与信息';
    const tags: CardTag[] = [];
    const details: CardTag[] = [];

    if (place.方式 && place.方式 !== '未设定') {
      tags.push({ label: '获知方式', value: place.方式 });
      details.push({ label: '获知方式', value: place.方式 });
    }
    if (place.人物id) {
      const who = characterName(s, place.人物id);
      tags.push({ label: '告知人', value: who });
      details.push({ label: '告知人物', value: who });
    }
    const timeStr = formatTime(place.获得时间);
    if (timeStr) {
      tags.push({ label: '时间', value: timeStr });
      details.push({ label: '获得时间', value: timeStr });
    }

    placesList.push({
      id: `place_${locId}`,
      category: '已知地点',
      title,
      content,
      tags,
      details,
      raw: place,
    });
  }

  // 3.4 已知账号
  const accountsList: FlatRecordItem[] = [];
  const accounts = kn.已知账号 ?? {};
  for (const [accId, acc] of Object.entries(accounts) as [string, any][]) {
    if (!acc || typeof acc !== 'object') continue;
    const title = resolveAccount(s, accId);
    const content = acc.说明 || '已获知该社交账号';
    const tags: CardTag[] = [];
    const details: CardTag[] = [];

    if (acc.方式 && acc.方式 !== '未设定') {
      tags.push({ label: '获知方式', value: acc.方式 });
      details.push({ label: '获知方式', value: acc.方式 });
    }
    if (acc.人物id) {
      const who = characterName(s, acc.人物id);
      tags.push({ label: '关联人', value: who });
      details.push({ label: '关联人物', value: who });
    }
    const timeStr = formatTime(acc.获得时间);
    if (timeStr) {
      tags.push({ label: '时间', value: timeStr });
      details.push({ label: '获得时间', value: timeStr });
    }

    accountsList.push({
      id: `account_${accId}`,
      category: '已知账号',
      title,
      content,
      tags,
      details,
      raw: acc,
    });
  }

  return [
    { key: 'facts', label: '获知事项', icon: 'info', items: factsList },
    { key: 'people', label: '认识人物', icon: 'users', items: peopleList },
    { key: 'places', label: '已知地点', icon: 'mapPin', items: placesList },
    { key: 'accounts', label: '已知账号', icon: 'globe', items: accountsList },
  ];
});

const totalKnowledgeCount = computed(() =>
  knowledgeGroups.value.reduce((sum, g) => sum + g.items.length, 0),
);

const displayedKnowledgeGroups = computed(() => {
  let groups = knowledgeGroups.value;
  if (selectedSubCat.value !== 'all') {
    groups = groups.filter(g => g.key === selectedSubCat.value);
  }
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) {
    return groups.filter(g => g.items.length > 0).map(g => ({ ...g, items: sortRecords(g.items) }));
  }
  return groups
    .map(g => ({
      ...g,
      items: sortRecords(g.items.filter(item =>
        item.title.toLowerCase().includes(q) ||
        item.content.toLowerCase().includes(q) ||
        item.tags.some(t => t.value.toLowerCase().includes(q)),
      )),
    }))
    .filter(g => g.items.length > 0);
});
</script>

<style scoped lang="scss">
/* 搜索与排序工具栏 (解决问题 14) */
.cw-records-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;

  .cw-search-input-wrap {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;

    .cw-search-icon {
      position: absolute;
      left: 10px;
      color: var(--cw-text-muted);
      pointer-events: none;
    }

    .cw-records-search-input {
      padding-left: 30px;
      padding-right: 28px;
      height: 32px;
      border: 1px solid var(--cw-border);
      border-radius: var(--cw-radius);
      background: var(--cw-bg-card-subtle);
      font-size: 12px;

      &:focus {
        border-color: var(--cw-accent);
        background: var(--cw-bg-surface);
      }
    }

    .cw-btn-clear {
      position: absolute;
      right: 6px;
      background: none;
      border: none;
      color: var(--cw-text-muted);
      cursor: pointer;
      padding: 4px;
      display: flex;

      &:hover {
        color: var(--cw-text-primary);
      }
    }
  }

  .cw-sort-toggle {
    flex-shrink: 0;

    .cw-sort-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 32px;
      padding: 0 10px;
      font-size: 12px;
      white-space: nowrap;
    }
  }
}

/* 在根元素自建 inline-size container，不依赖任何父级 container-name */
.cw-player-record-cards-root {
  width: 100%;
  container-type: inline-size;
  container-name: cw-record-cards;
}

/* 正常容器宽度下一行三张等宽卡片；移除与 @media 断点的冲突，只保留 container query */
.cw-record-card-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

/* 容器 < 720px（约三列各 240px 最小宽度）降为两列 */
@container cw-record-cards (max-width: 719px) {
  .cw-record-card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* 容器 < 440px 降为单列 */
@container cw-record-cards (max-width: 439px) {
  .cw-record-card-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* 已知信息二级分类筛选条 */
.cw-knowledge-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cw-subcat-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-bottom: 2px;
}

.cw-subcat-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 9px;
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius-sm);
  background: var(--cw-bg-card-subtle);
  color: var(--cw-text-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    color: var(--cw-text-primary);
    border-color: var(--cw-accent-border);
  }

  &.active {
    background: var(--cw-accent-bg);
    border-color: var(--cw-accent-border);
    color: var(--cw-accent);
    font-weight: 500;
  }

  span {
    font-size: 11px;
    opacity: 0.8;
  }
}

/* 分类分组独立区块 */
.cw-knowledge-groups-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cw-knowledge-group-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cw-group-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 2px;
  border-bottom: 1px dashed var(--cw-border);
}

.cw-group-section-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--cw-text-primary);

  .cw-group-icon {
    color: var(--cw-accent);
  }

  .cw-group-badge {
    font-size: 11px;
    padding: 1px 6px;
    border-radius: var(--cw-radius-full);
    background: var(--cw-bg-card-subtle);
    border: 1px solid var(--cw-border);
    color: var(--cw-text-muted);
    font-weight: normal;
  }
}

/* 独立记录小卡片 (支持整卡点击激活，解决问题 16) */
.cw-record-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 12px 14px;
  min-height: 120px;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;

  &.is-interactive {
    cursor: pointer;
    user-select: none;

    &:hover {
      border-color: var(--cw-accent);
      background: var(--cw-bg-card);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      transform: translateY(-1px);

      .cw-detail-btn {
        background: var(--cw-accent);
        color: var(--cw-text-inverse, #fff);
      }
    }

    &:active {
      transform: translateY(0);
    }
  }
}

.cw-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 6px;
}

.cw-card-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--cw-text-primary);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.cw-card-badges {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  flex-shrink: 0;
}

.cw-card-time-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: var(--cw-radius-full);
  background: var(--cw-bg-card);
  border: 1px solid var(--cw-border);
  color: var(--cw-accent);
  font-weight: 500;
  line-height: 1.3;
}

.cw-card-cat-badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: var(--cw-radius-sm);
  background: var(--cw-bg-card);
  border: 1px solid var(--cw-border);
  color: var(--cw-text-secondary);
  line-height: 1.3;
}

.cw-card-nature-badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: var(--cw-radius-sm);
  line-height: 1.3;
  font-weight: 500;

  &.cw-nature-fact {
    background: rgba(46, 125, 50, 0.12);
    color: #2e7d32;
    border: 1px solid rgba(46, 125, 50, 0.25);
  }

  &.cw-nature-spec {
    background: rgba(2, 136, 209, 0.12);
    color: #0288d1;
    border: 1px solid rgba(2, 136, 209, 0.25);
  }

  &.cw-nature-mis {
    background: rgba(211, 47, 47, 0.12);
    color: #d32f2f;
    border: 1px solid rgba(211, 47, 47, 0.25);
  }

  &.cw-nature-unconfirmed {
    background: rgba(120, 144, 156, 0.12);
    color: #607d8b;
    border: 1px solid rgba(120, 144, 156, 0.25);
  }
}

.cw-card-body {
  flex: 1;
  margin-bottom: 8px;
}

.cw-card-text {
  margin: 0;
  font-size: 12px;
  color: var(--cw-text-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-word;
}

.cw-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--cw-border);
}

.cw-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.cw-tag-chip {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: var(--cw-radius-sm);
  background: var(--cw-bg-card);
  border: 1px solid var(--cw-border);
  color: var(--cw-text-muted);
  display: inline-flex;
  align-items: center;
  gap: 2px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  .cw-tag-k {
    opacity: 0.8;
  }
  .cw-tag-v {
    font-weight: 500;
    color: var(--cw-text-secondary);
  }
}

.cw-tag-more {
  font-weight: 500;
  color: var(--cw-accent);
}

.cw-card-action {
  flex-shrink: 0;
}

/* 升级为易触控胶囊按钮 (解决问题 16) */
.cw-detail-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: var(--cw-radius-full);
  background: var(--cw-accent-bg);
  border: 1px solid var(--cw-accent-border);
  color: var(--cw-accent);
  font-weight: 500;
  font-size: 11px;
  height: 26px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: var(--cw-accent);
    color: var(--cw-text-inverse, #fff);
  }
}

/* 局部空状态 */
.cw-empty-compact {
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: var(--cw-radius-sm);
  background: var(--cw-bg-card-subtle);
  border: 1px dashed var(--cw-border);
  color: var(--cw-text-muted);
  font-size: 12px;

  .cw-empty-icon {
    opacity: 0.5;
    flex-shrink: 0;
  }
}

/* 平面化详情弹窗 (无树状分支，无嵌套缩进) */
.cw-record-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: rgba(0, 0, 0, 0.48);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;

  @media (max-width: 640px) {
    padding: 10px;
  }
}

.cw-record-modal-panel {
  width: 100%;
  max-width: 520px;
  max-height: min(85vh, calc(100% - 16px));
  display: flex;
  flex-direction: column;
  background: var(--cw-bg-card);
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  box-sizing: border-box;
  overflow: hidden;
}

.cw-modal-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--cw-border);
}

.cw-modal-title-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.cw-modal-category {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: var(--cw-radius-sm);
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);
  color: var(--cw-text-secondary);
}

.cw-modal-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--cw-text-primary);
  line-height: 1.4;
}

.cw-modal-close-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid var(--cw-border);
  background: var(--cw-bg-card-subtle);
  color: var(--cw-text-secondary);
  border-radius: var(--cw-radius-sm);
  cursor: pointer;

  &:hover {
    background: var(--cw-accent-bg);
    color: var(--cw-accent);
  }
}

.cw-modal-content {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cw-modal-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cw-modal-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--cw-text-muted);
}

.cw-modal-body-text {
  font-size: 13px;
  line-height: 1.65;
  color: var(--cw-text-primary);
  background: var(--cw-bg-card-subtle);
  padding: 10px 12px;
  border-radius: var(--cw-radius-sm);
  border: 1px solid var(--cw-border);
  white-space: pre-wrap;
  word-break: break-word;
}

.cw-modal-props-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 10px;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
}

.cw-modal-prop-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  border-radius: var(--cw-radius-sm);
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);

  .cw-prop-k {
    font-size: 11px;
    color: var(--cw-text-muted);
  }

  .cw-prop-v {
    font-size: 12px;
    font-weight: 500;
    color: var(--cw-text-primary);
    word-break: break-word;
  }
}

.cw-modal-footer {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  padding: 10px 16px;
  border-top: 1px solid var(--cw-border);
  background: var(--cw-bg-card-subtle);
}
</style>
