<template>
  <div class="cw-information-tab" :aria-label="`${kind}资料管理`">
    <RosterAutoPanel
      title="自动资料选择"
      :icon="kind === '地点' ? 'mapPin' : 'shield'"
      :enabled="autoEnabled"
      :description="autoEnabled ? '已开启 · 地点与组织共用，按本轮剧情选取资料。' : '已关闭 · 地点与组织保留当前展开名单。'"
      :disabled="disabled"
      :error="feedbackArea === 'auto' ? error : ''"
      @change="toggleAuto"
    >
      <p>手动指定的加载方式优先。选「展开」会持续提供完整资料，选「仅名称」只提供名称，选「自动」交给调度。</p>
    </RosterAutoPanel>
    <div v-if="notice && feedbackArea === 'auto'" class="cw-callout cw-callout-success" role="status">{{ notice }}</div>
    <WorldInformationQuota :kind="kind" />
    <section class="cw-information-card">
      <div v-if="!selectedRecord" class="cw-information-tools">
        <h4>{{ kind }}资料目录</h4>
        <span class="cw-information-count">{{ allRows.length }} 条<span v-if="rows.length !== allRows.length"> · 匹配 {{ rows.length }} 条</span></span>
      </div>
      <div v-if="error && feedbackArea === 'record'" class="cw-callout cw-callout-danger" role="alert">{{ error }}</div>
      <div v-if="notice && feedbackArea === 'record'" class="cw-callout cw-callout-success" role="status">{{ notice }}</div>

      <template v-if="selectedRecord">
        <div class="cw-information-detail-head">
          <button type="button" class="cw-btn cw-btn-secondary cw-btn-sm" @click="selectedId = null">
            <SvgIcon name="chevronLeft" :size="14" />返回列表
          </button>
          <span class="cw-badge" :class="expandedIds.has(selectedId!) ? 'cw-badge-accent' : ''">
            本轮向 AI 提供：{{ expandedIds.has(selectedId!) ? '详情' : '仅名称' }}
          </span>
        </div>
        <div class="cw-information-heading">
          <div>
            <h4>{{ selectedRecord.名称 || '未命名' + kind }}</h4>
            <p>{{ selectedRecord.类型 || '类型未记录' }}</p>
          </div>
          <label class="cw-mode-control">
            <span>加载方式</span>
            <select :value="preference(selectedId!)" :disabled="disabled"
              :aria-label="`${selectedRecord.名称 || kind}的加载方式`" @change="changeMode(selectedId!, $event)">
              <option v-for="mode in modes" :key="mode" :value="mode">{{ mode }}</option>
            </select>
          </label>
        </div>
        <p class="cw-information-prose">{{ selectedRecord.简介 || '尚未记录简介。' }}</p>

        <template v-if="selectedLocation">
          <dl class="cw-information-fields">
            <div><dt>所属片区</dt><dd>{{ districtName(selectedLocation.片区id) }}</dd></div>
            <div><dt>上级场所</dt><dd>{{ selectedLocation.上级地点id ? locationName(selectedLocation.上级地点id) : '未设置' }}</dd></div>
            <div><dt>室内外</dt><dd>{{ selectedLocation.室内外 }}</dd></div>
            <div><dt>地图位置</dt><dd>{{ positionText(selectedLocation.地图位置) }}</dd></div>
            <div><dt>常规开放时间</dt><dd>{{ selectedLocation.常规开放时间 || '未记录' }}</dd></div>
            <div><dt>进入条件</dt><dd>{{ selectedLocation.进入条件 || '未记录' }}</dd></div>
          </dl>
          <div class="cw-information-section">
            <h5>临时状态</h5>
            <ul v-if="Object.keys(selectedLocation.动态状态).length" class="cw-information-facts">
              <li v-for="(status, id) in selectedLocation.动态状态" :key="id">
                <span>{{ status.说明 || '未记录说明' }}</span>
                <small>{{ timeRange(status.生效时间, status.结束时间) }}</small>
              </li>
            </ul>
            <p v-else class="cw-information-muted">未记录临时状态。</p>
          </div>
          <div class="cw-information-section">
            <h5>关联人物</h5>
            <ul v-if="Object.keys(selectedLocation.关联人物).length" class="cw-information-facts">
              <li v-for="(role, id) in selectedLocation.关联人物" :key="id">
                {{ personName(String(id)) }} · {{ role || '关系未记录' }}
              </li>
            </ul>
            <p v-else class="cw-information-muted">未记录关联人物。</p>
          </div>
        </template>

        <template v-if="selectedOrganization">
          <dl class="cw-information-fields">
            <div><dt>相关场所</dt><dd>{{ selectedOrganization.场所id.map(locationName).join('、') || '未记录' }}</dd></div>
            <div><dt>活动日程</dt><dd>{{ selectedOrganization.活动日程id.map(scheduleName).join('、') || '未记录' }}</dd></div>
          </dl>
          <div class="cw-information-section">
            <h5>已记录成员</h5>
            <ul v-if="Object.keys(selectedOrganization.已知成员).length" class="cw-information-facts">
              <li v-for="(member, id) in selectedOrganization.已知成员" :key="id">
                {{ personName(String(id)) }} · {{ member.职务 || '职务未记录' }}
              </li>
            </ul>
            <p v-else class="cw-information-muted">未记录成员。</p>
          </div>
          <div class="cw-information-section">
            <h5>完整设定与规则</h5>
            <p class="cw-information-prose">{{ selectedOrganization.规则 || '尚未记录组织规则。' }}</p>
          </div>
        </template>
      </template>

      <template v-else>
        <div class="cw-information-search">
          <label class="cw-search-field">
            <SvgIcon name="search" :size="15" />
            <input v-model="search" type="search" :placeholder="`搜索${kind}名称或类型`" :aria-label="`搜索${kind}`" />
          </label>
          <select v-model="filter" aria-label="筛选本轮资料状态">
            <option value="全部">全部资料</option>
            <option value="详情">本轮提供详情</option>
            <option value="仅名称">本轮仅名称</option>
          </select>
        </div>
        <div v-if="rows.length" class="cw-information-list">
          <article v-for="row in rows" :key="row.id" class="cw-information-row" :data-information-id="row.id">
            <button type="button" class="cw-information-open" :aria-label="`查看${row.name}详情`" @click="selectedId = row.id">
              <span class="cw-information-name">{{ row.name }}</span>
              <span class="cw-information-status" :class="{ expanded: expandedIds.has(row.id) }">
                {{ row.type || '类型未记录' }} · 本轮{{ expandedIds.has(row.id) ? '已展开' : '仅名称' }}
              </span>
            </button>
            <label class="cw-mode-control">
              <span>加载方式</span>
              <select :value="preference(row.id)" :disabled="disabled" :aria-label="`${row.name}的加载方式`"
                @change="changeMode(row.id, $event)">
                <option v-for="mode in modes" :key="mode" :value="mode">{{ mode }}</option>
              </select>
            </label>
          </article>
        </div>
        <p v-else class="cw-information-empty">{{ allRows.length ? '没有匹配的资料。' : `尚未收录${kind}资料。` }}</p>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { RuntimeKey, type Runtime } from '../../../../运行/host';
import { effectiveInformationIds } from '../../../../运行/knowledge-context';
import { resolveCharacterName } from '../../utils/entity';
import SvgIcon from '../icons/SvgIcon.vue';
import RosterAutoPanel from './RosterAutoPanel.vue';
import WorldInformationQuota from './WorldInformationQuota.vue';

type Kind = '地点' | '组织';
type Mode = '自动' | '展开' | '仅名称';
const runtime = inject<Runtime | null>(RuntimeKey, null);
const modes: Mode[] = ['自动', '展开', '仅名称'];
const props = defineProps<{ kind?: Kind }>();
const kind = computed<Kind>(() => props.kind ?? '地点');
const search = ref(''), filter = ref('全部'), selectedId = ref<string | null>(null);
watch(kind, () => { selectedId.value = null; });
const saving = ref(false), error = ref(''), notice = ref('');
const feedbackArea = ref<'auto' | 'record'>('auto');
const state = computed(() => runtime?.view.data);
const disabled = computed(() => !runtime || !state.value || saving.value || runtime.view.readOnly || runtime.view.busy);
const autoEnabled = computed(() => runtime?.settings.informationAuto ?? true);
const expandedIds = computed(() => state.value ? effectiveInformationIds(state.value, kind.value) : new Set<string>());
const allRows = computed(() => Object.entries(state.value?.[kind.value] ?? {}).map(([id, record]) => ({
  id, name: record.名称 || `未命名${kind.value}`, type: record.类型,
})));
const rows = computed(() => {
  const query = search.value.trim().toLocaleLowerCase();
  return allRows.value.filter(row => (!query || `${row.name} ${row.type ?? ''}`.toLocaleLowerCase().includes(query)) &&
    (filter.value === '全部' || (filter.value === '详情') === expandedIds.value.has(row.id)));
});
const selectedRecord = computed(() => selectedId.value ? state.value?.[kind.value]?.[selectedId.value] : null);
const selectedLocation = computed(() => kind.value === '地点' && selectedId.value ? state.value?.地点[selectedId.value] : null);
const selectedOrganization = computed(() => kind.value === '组织' && selectedId.value ? state.value?.组织[selectedId.value] : null);

function preference(id: string): Mode {
  const selection = state.value?._系统.资料加载;
  return (kind.value === '地点' ? selection?.地点覆盖[id] : selection?.组织覆盖[id]) ?? '自动';
}
function locationName(id: string) { return state.value?.地点[id]?.名称 || '未命名地点'; }
function districtName(id: string | null) { return id ? state.value?.世界.片区[id]?.名称 || '未命名片区' : '未记录'; }
function personName(id: string) { return resolveCharacterName(state.value, id); }
function scheduleName(id: string) { return state.value?.世界.城市日程[id]?.名称 || '未命名日程'; }
function positionText(position: { x: number | null; y: number | null; 精度: string }) {
  return position.精度 === '地点' && position.x != null && position.y != null
    ? `${position.x}，${position.y}（地点坐标）`
    : position.精度 === '片区' ? '仅知所属片区' : '具体位置未知';
}
type Time = { 年: number; 月: number; 日: number; 时: number; 分: number } | null;
function timeText(time: Time) {
  if (!time) return '时间未定';
  return `${time.年}年${time.月}月${time.日}日 ${String(time.时).padStart(2, '0')}:${String(time.分).padStart(2, '0')}`;
}
function timeRange(start: Time, end: Time) { return `${timeText(start)}起 · ${end ? timeText(end) + '结束' : '结束时间未定'}`; }

async function changeMode(id: string, event: Event) {
  const input = event.target as HTMLSelectElement;
  const next = input.value as Mode;
  if (!runtime || disabled.value || !modes.includes(next)) return;
  const targetKind = kind.value;
  feedbackArea.value = 'record';
  saving.value = true; error.value = ''; notice.value = '';
  try {
    await runtime.manageInformation(targetKind, id, next);
    notice.value = `${state.value?.[targetKind]?.[id]?.名称 || targetKind}已设为“${next}”。`;
  } catch (cause) {
    error.value = String(cause);
  } finally {
    input.value = preference(id);
    saving.value = false;
  }
}
async function toggleAuto(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!runtime || disabled.value) return;
  const enabled = input.checked;
  feedbackArea.value = 'auto';
  saving.value = true; error.value = ''; notice.value = '';
  try {
    await runtime.saveSettings({ informationAuto: enabled }, 'general');
    notice.value = enabled ? '自动资料选择已开启，下一次互动前按情节调整。' : '自动资料选择已关闭，当前名单保持不变。';
  } catch (cause) {
    error.value = String(cause);
  } finally {
    input.checked = runtime.settings.informationAuto;
    saving.value = false;
  }
}
</script>

<style scoped>
.cw-information-tab, .cw-information-card, .cw-information-list { display: flex; flex-direction: column; gap: 14px; }
.cw-information-card { border: 1px solid var(--cw-border); border-radius: var(--cw-radius, 12px); padding: 16px; background: var(--cw-bg-card); }
.cw-information-heading, .cw-information-tools, .cw-information-detail-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.cw-information-heading > div { flex: 1; min-width: 0; }
h4, h5, p { margin: 0; }
h4 { font-size: 14px; color: var(--cw-text-primary); }
h5 { font-size: 13px; margin-bottom: 8px; color: var(--cw-text-primary); }
.cw-information-heading p { font-size: 12px; color: var(--cw-text-secondary); margin-top: 5px; line-height: 1.6; }
.cw-information-summary strong { color: var(--cw-accent); }
.cw-auto-option { display: flex; gap: 6px; align-items: center; font-size: 12px; cursor: pointer; }
input[type='checkbox'] { accent-color: var(--cw-accent); }
.cw-information-note { padding: 10px 12px; border-radius: var(--cw-radius-sm, 8px); background: var(--cw-accent-bg); color: var(--cw-text-secondary); font-size: 12px; line-height: 1.6; }
.cw-information-help { color: var(--cw-text-secondary); font-size: 12px; line-height: 1.7; }
.cw-information-help summary { cursor: pointer; color: var(--cw-accent); }
.cw-information-count, .cw-information-muted, .cw-information-status { font-size: 12px; color: var(--cw-text-muted); }
.cw-information-search { display: flex; gap: 8px; }
.cw-search-field { display: flex; gap: 7px; align-items: center; flex: 1; min-width: 0; border: 1px solid var(--cw-border); border-radius: var(--cw-radius-sm, 8px); padding: 7px 9px; color: var(--cw-text-muted); }
.cw-search-field input { width: 100%; min-width: 0; background: transparent; border: 0; outline: none; color: var(--cw-text-primary); font: inherit; font-size: 12px; }
select { border: 1px solid var(--cw-border); border-radius: var(--cw-radius-sm, 8px); background: var(--cw-bg-surface); color: var(--cw-text-primary); padding: 7px 8px; font: inherit; font-size: 12px; max-width: 100%; }
.cw-information-list { gap: 6px; }
.cw-information-row { display: flex; align-items: center; gap: 12px; border: 1px solid var(--cw-border); border-radius: var(--cw-radius-sm, 8px); background: var(--cw-bg-surface); padding: 10px 12px; }
.cw-information-open { color: var(--cw-text-primary); display: flex; flex-direction: column; align-items: flex-start; flex: 1; gap: 4px; min-width: 0; text-align: left; background: transparent; border: 0; padding: 0; font: inherit; cursor: pointer; overflow-wrap: anywhere; }
.cw-information-open:hover .cw-information-name { color: var(--cw-accent); }
.cw-information-name { color: var(--cw-text-primary); font-size: 13px; font-weight: 600; }
.cw-information-status.expanded { color: var(--cw-accent); }
.cw-selection-reason { font-size: 12px; line-height: 1.6; color: var(--cw-text-secondary); overflow-wrap: anywhere; }
.cw-mode-control { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--cw-text-muted); flex-shrink: 0; }
.cw-information-fields { display: grid; grid-template-columns: 1fr; gap: 10px; margin: 0; }
.cw-information-fields > div { display: grid; grid-template-columns: 95px minmax(0, 1fr); gap: 10px; font-size: 12px; line-height: 1.6; }
.cw-information-fields dt { color: var(--cw-text-muted); }
.cw-information-fields dd { margin: 0; color: var(--cw-text-primary); white-space: pre-wrap; overflow-wrap: anywhere; }
.cw-information-prose { font-size: 13px; line-height: 1.8; color: var(--cw-text-primary); white-space: pre-wrap; overflow-wrap: anywhere; }
.cw-information-section { border-top: 1px solid var(--cw-border); padding-top: 12px; }
.cw-information-facts { margin: 0; padding-left: 18px; color: var(--cw-text-secondary); font-size: 12px; line-height: 1.7; }
.cw-information-facts small { display: block; color: var(--cw-text-muted); }
.cw-information-empty { padding: 20px 8px; text-align: center; color: var(--cw-text-muted); font-size: 13px; }
.cw-information-error { color: var(--cw-danger, #ef4444); font-size: 12px; }
.cw-information-notice { color: var(--cw-accent); font-size: 12px; }
button:focus-visible, select:focus-visible, .cw-search-field:focus-within { outline: 2px solid var(--cw-accent); outline-offset: 2px; }
button:disabled, select:disabled, input:disabled { cursor: not-allowed; opacity: 0.6; }
@media (max-width: 640px) {
  .cw-information-tab { gap: 10px; }
  .cw-information-card { padding: 10px 12px; gap: 10px; }
  .cw-information-intro-card { padding: 8px 10px; }
  .cw-information-search { flex-wrap: wrap; }
  .cw-search-field { flex-basis: 100%; }
  .cw-information-row { gap: 8px; padding: 8px 10px; }
  .cw-information-fields > div { grid-template-columns: 1fr; gap: 2px; }

  .cw-auto-option { flex-basis: 100%; }
}
</style>
