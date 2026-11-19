<template>
  <div class="cw-map-app">
    <!-- 顶栏 -->
    <div class="cw-app-header">
      <div class="cw-header-left">
        <button
          class="cw-btn-icon"
          :title="isOverview ? '返回手机' : '返回世界地图'"
          @click="isOverview ? emit('back') : focusDistrict('all')"
        >
          <SvgIcon name="chevronLeft" :size="20" />
        </button>
        <span class="cw-header-title">{{ isOverview ? '瓦罗兰 · 世界地图' : activeDistrictName }}</span>
      </div>
      <div v-if="!isOverview" class="cw-header-right">
        <button
          class="cw-btn-icon"
          :class="{ active: showLocationList }"
          title="地点列表"
          @click="showLocationList = !showLocationList"
        >
          <SvgIcon name="list" :size="18" />
        </button>
        <button
          class="cw-btn-icon"
          :class="{ active: showBookmarksOnly }"
          title="我的收藏"
          @click="showBookmarksOnly = !showBookmarksOnly"
        >
          <SvgIcon name="bookmark" :size="18" />
        </button>
      </div>
    </div>

    <div v-if="!isOverview" class="cw-map-caption">
      <span>{{ activeDistrictDescription }}</span>
      <button v-if="unmappedCount" class="cw-map-uncertain" @click="showLocationList = true">
        {{ unmappedCount }} 处仅知片区或位置待确认
      </button>
    </div>

    <!-- 地图可视区：SVG 交互式矢量地图 -->
    <div class="cw-map-viewport">
      <!-- 悬浮地图交互工具栏 (放大、缩小、重置) -->
      <div class="cw-map-floating-controls">
        <button class="cw-map-ctrl-btn" title="放大地图" @click.stop="zoomIn">
          <SvgIcon name="plus" :size="13" />
        </button>
        <button class="cw-map-ctrl-btn" title="缩小地图" @click.stop="zoomOut">
          <SvgIcon name="minus" :size="13" />
        </button>
        <button
          class="cw-map-ctrl-btn"
          :title="isOverview ? '复位世界地图' : '复位当前地区地图'"
          @click.stop="resetZoom"
        >
          <SvgIcon name="refreshCw" :size="12" />
        </button>
      </div>

      <div ref="mapSurface" class="cw-map-surface">
        <svg
          ref="mapSvg"
          :viewBox="currentViewBox"
          class="cw-city-svg-map"
          :class="{ 'is-dragging': isDragging }"
          @wheel.prevent.stop="onWheel"
          @pointerdown="onMapPointerDown"
          @pointermove="onMapPointerMove"
          @pointerup="onMapPointerUp"
          @pointercancel="onMapPointerUp"
        >
          <MapBaseLayer :district-id="isOverview ? null : selectedDistrictId" />

          <g v-if="isOverview" class="cw-districts-layer">
            <g
              v-for="dist in mapDistricts"
              :key="dist.id"
              :data-district="dist.id"
              role="button"
              tabindex="0"
              :aria-label="'查看' + dist.name"
              @click.stop="!moved && focusDistrict(dist.id)"
              @keydown.enter.prevent="focusDistrict(dist.id)"
              @keydown.space.prevent="focusDistrict(dist.id)"
            >
              <rect
                :x="dist.x - (dist.name.length * 6 + 13) * overviewLabelScale"
                :y="dist.y - 14 * overviewLabelScale"
                :width="(dist.name.length * 12 + 26) * overviewLabelScale"
                :height="28 * overviewLabelScale"
                :rx="10 * overviewLabelScale"
                class="cw-district-label-bg"
              />
              <text
                :x="dist.x"
                :y="dist.y + 4 * overviewLabelScale"
                text-anchor="middle"
                class="cw-district-label"
                :style="{ fontSize: 12 * overviewLabelScale + 'px' }"
              >
                {{ dist.name }}
              </text>
            </g>
          </g>

          <!-- 精确地点按存档坐标投影，文字避让不移动地点。 -->
          <g v-else class="cw-landmarks-layer">
            <!-- 引导线层 (位于打点下方) -->
            <g class="cw-leader-lines-layer">
              <line
                v-for="item in spotLayoutList"
                v-show="item.hasLeader"
                :key="'line_' + item.id"
                :x1="item.lineX1"
                :y1="item.lineY1"
                :x2="item.lineX2"
                :y2="item.lineY2"
                class="cw-leader-line"
                :class="{ active: selectedSpotId === item.id }"
                :style="{ strokeWidth: `${(selectedSpotId === item.id ? 2.2 : 1.4) * labelScale}px` }"
              />
            </g>

            <!-- 地标打点与胶囊标签 -->
            <g
              v-for="item in spotLayoutList"
              :key="item.id"
              class="cw-spot-marker"
              :class="{ active: selectedSpotId === item.id }"
              :data-location-id="item.id"
              role="button"
              tabindex="0"
              :aria-label="item.spot.名称"
              @click.stop="selectSpot(item.id, item.spot)"
              @keydown.enter.prevent="focusSpot(item.id, item.spot)"
            >
              <title>{{ item.spot.名称 }}</title>
              <!-- 热区跟随示意点位，正式存档坐标不变。 -->
              <circle
                :cx="item.baseX"
                :cy="item.baseY"
                :r="12 * labelScale"
                fill="transparent"
                class="cw-marker-hitbox"
                @click.stop="selectSpot(item.id, item.spot)"
              />
              <!-- 脉冲外圈 -->
              <circle
                :cx="item.baseX"
                :cy="item.baseY"
                :r="(selectedSpotId === item.id ? 16 : 10) * labelScale"
                class="cw-marker-pulse"
                :style="{ strokeWidth: `${1 * labelScale}px` }"
                @click.stop="selectSpot(item.id, item.spot)"
              />
              <!-- 中心圆点 -->
              <circle
                :cx="item.baseX"
                :cy="item.baseY"
                :r="5 * labelScale"
                class="cw-marker-core"
                :style="{ strokeWidth: `${1.8 * labelScale}px` }"
                @click.stop="selectSpot(item.id, item.spot)"
              />
              <g
                v-if="item.count > 1"
                :transform="`translate(${item.baseX + 10 * labelScale}, ${item.baseY - 10 * labelScale})`"
              >
                <circle :r="8 * labelScale" class="cw-marker-count-bg" />
                <text
                  text-anchor="middle"
                  :y="3 * labelScale"
                  class="cw-marker-count-text"
                  :style="{ fontSize: 10 * labelScale + 'px' }"
                >
                  {{ item.count }}
                </text>
              </g>
              <!-- 地点名称胶囊文字标签 (反向比例尺补偿，解决 F23 地名过小问题) -->
              <g
                v-if="item.showLabel"
                class="cw-spot-label-group"
                :class="{ active: selectedSpotId === item.id }"
                :transform="`translate(${item.lx}, ${item.ly})`"
                @click.stop="selectSpot(item.id, item.spot)"
              >
                <rect
                  :x="(-item.w * labelScale) / 2"
                  :y="(-item.h * labelScale) / 2"
                  :width="item.w * labelScale"
                  :height="item.h * labelScale"
                  :rx="5 * labelScale"
                  class="cw-spot-label-bg"
                  :style="{ strokeWidth: `${(selectedSpotId === item.id ? 1.8 : 1) * labelScale}px` }"
                />
                <text
                  x="0"
                  :y="3.5 * labelScale"
                  text-anchor="middle"
                  class="cw-spot-name-text"
                  :style="{ fontSize: `${Math.round(10.5 * labelScale)}px` }"
                >
                  {{ item.label }}
                </text>
              </g>
            </g>
          </g>
        </svg>
      </div>
      <div v-if="!isOverview" class="cw-map-compass" aria-label="地图北向">N<span>↑</span></div>
      <div v-if="!isOverview" class="cw-map-legend">
        <span><i class="cw-legend-water"></i>水域</span>
        <span><i class="cw-legend-green"></i>绿地</span>
        <span><i class="cw-legend-road"></i>道路</span>
        <span class="cw-map-scale">{{ (1000 / vbW).toFixed(1) }}×</span>
      </div>

      <!-- 选中地点的详情浮层卡片 (置于地图内部底部，不挤压地图) -->
      <transition name="cw-slide-up">
        <div v-if="!isOverview && selectedSpot && !routeOpen" class="cw-spot-detail-card">
          <div class="cw-spot-card-top">
            <div class="cw-spot-card-title">
              <span class="cw-spot-title-text">{{ selectedSpot.名称 }}</span>
              <span class="cw-badge cw-badge-accent">{{ selectedSpot.类型 || '地标' }}</span>
              <span v-if="selectedSpot.片区id" class="cw-badge">{{
                districts[selectedSpot.片区id]?.名称 || selectedSpot.片区id
              }}</span>
            </div>
            <button class="cw-btn-close-spot" @click="selectedSpotId = null">
              <SvgIcon name="close" :size="15" />
            </button>
          </div>

          <p class="cw-spot-desc">{{ selectedSpot.简介 }}</p>

          <div v-if="selectedGroup.length > 1" class="cw-building-places">
            <button
              v-for="id in selectedGroup"
              :key="id"
              class="cw-building-place"
              :class="{ active: id === selectedSpotId }"
              @click="focusSpot(id, spots[id])"
            >
              {{ spots[id]?.名称 }}
            </button>
          </div>

          <div class="cw-spot-specs">
            <div v-if="selectedSpot.上级地点id && spots[selectedSpot.上级地点id]" class="cw-spec-row">
              <span class="cw-k">所在场所：</span>
              <span class="cw-v">{{ spots[selectedSpot.上级地点id].名称 }}</span>
            </div>
            <div v-if="!displayPositions[selectedSpotId ?? '']" class="cw-spec-row">
              <span class="cw-k">位置范围：</span>
              <span class="cw-v">{{
                selectedSpot.地图位置?.精度 === '片区' ? '仅知所属片区，具体地址待确认' : '位置尚未确认'
              }}</span>
            </div>
            <div class="cw-spec-row">
              <span class="cw-k">开放时间：</span>
              <span class="cw-v">{{ selectedSpot.常规开放时间 ?? '未知' }}</span>
            </div>
            <div class="cw-spec-row">
              <span class="cw-k">进入条件：</span>
              <span class="cw-v">{{ selectedSpot.进入条件 ?? '未知' }}</span>
            </div>
          </div>

          <!-- 三大操作入口：前往、设为约定地点、收藏 -->
          <div class="cw-spot-actions">
            <button class="cw-btn cw-btn-primary cw-btn-sm" @click="handleGoThere(selectedSpot)">
              <SvgIcon name="compass" :size="13" />
              <span>前往</span>
            </button>
            <button class="cw-btn cw-btn-ghost cw-btn-sm" @click="handleMakeCovenant(selectedSpot)">
              <SvgIcon name="calendar" :size="13" />
              <span>设为约定</span>
            </button>
            <button
              class="cw-btn cw-btn-ghost cw-btn-sm"
              :class="{ 'cw-bookmarked': isBookmarked(selectedSpotId) }"
              @click="toggleBookmark(selectedSpotId)"
            >
              <SvgIcon name="bookmark" :size="13" />
              <span>{{ isBookmarked(selectedSpotId) ? '已收藏' : '收藏' }}</span>
            </button>
          </div>
        </div>
      </transition>
    </div>

    <!-- 解决 F24：独立抽屉地点列表，不再常显底部挤压地图 -->
    <transition name="cw-fade">
      <div v-if="showLocationList" class="cw-modal-backdrop" @click="showLocationList = false">
        <div class="cw-location-drawer" @click.stop>
          <div class="cw-drawer-header">
            <div class="cw-drawer-title">
              <SvgIcon name="list" :size="16" />
              <span>地点名录（共 {{ Object.keys(filteredSpots).length }} 处）</span>
            </div>
            <button class="cw-btn-icon" @click="showLocationList = false">
              <SvgIcon name="close" :size="16" />
            </button>
          </div>
          <div class="cw-drawer-body">
            <div
              v-for="(spot, id) in filteredSpots"
              :key="id"
              class="cw-loc-item-card"
              :class="{ active: selectedSpotId === String(id) }"
              @click="onPickLocation(String(id), spot)"
            >
              <div class="cw-loc-item-main">
                <span class="cw-loc-name">{{ spot.名称 }}</span>
                <span class="cw-badge cw-badge-sm">{{ spot.类型 || '地点' }}</span>
              </div>
              <div class="cw-loc-meta">
                <span>{{ spot.上级地点id ? '建筑内部' : (spot.地图位置?.精度 ?? '未知位置') }}</span>
                <span v-if="spot.片区id"> · {{ districts[spot.片区id]?.名称 }}</span>
              </div>
            </div>
            <div v-if="Object.keys(filteredSpots).length === 0" class="cw-empty-backdrop">
              <SvgIcon name="mapPin" :size="32" class="cw-empty-icon" />
              <div class="cw-empty-title">暂无匹配地点</div>
              <div class="cw-empty-desc">该地区暂无已知地点，或收藏中没有匹配地点</div>
              <button
                v-if="showBookmarksOnly"
                class="cw-btn cw-btn-ghost cw-btn-xs cw-empty-action"
                @click="showBookmarksOnly = false"
              >
                重置筛选
              </button>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- 解决 F24：路线与邀约规划采用完整模态抽屉表单，表单整齐且提交/取消常显 -->
    <transition name="cw-fade">
      <div v-if="routeOpen" class="cw-modal-backdrop" @click="routeOpen = false">
        <div class="cw-route-drawer" @click.stop>
          <div class="cw-drawer-header">
            <div class="cw-drawer-title">
              <SvgIcon :name="inviting ? 'calendar' : 'compass'" :size="16" />
              <span>{{ inviting ? '发起约定与邀约' : '规划前往路线' }}</span>
            </div>
            <button class="cw-btn-icon" @click="routeOpen = false">
              <SvgIcon name="close" :size="16" />
            </button>
          </div>

          <div class="cw-drawer-body">
            <!-- 目标地点摘要卡片 -->
            <div class="cw-route-target-card">
              <div class="cw-target-name">{{ selectedSpot?.名称 ?? '未知地点' }}</div>
              <div class="cw-target-sub">
                预计耗时：<strong>{{ travelMinutes == null ? '耗时未知' : travelMinutes + ' 分钟' }}</strong>
                <span class="cw-muted">（途中事件可能改变实际耗时）</span>
              </div>
            </div>

            <!-- 出行方式选择 -->
            <div class="cw-form-group">
              <label class="cw-form-label">出行方式</label>
              <div class="cw-mode-chips">
                <button
                  v-for="mode in ['公共交通', '步行', '网约车']"
                  :key="mode"
                  type="button"
                  class="cw-mode-chip"
                  :class="{ active: routeMode === mode }"
                  @click="routeMode = mode"
                >
                  {{ mode }}
                </button>
              </div>
            </div>

            <!-- 邀约特定字段 -->
            <template v-if="inviting">
              <div class="cw-form-group">
                <label class="cw-form-label">邀约对象 <span class="cw-required">*</span></label>
                <input v-model="inviteWho" class="cw-input" placeholder="输入角色姓名或对象" aria-label="邀约对象" />
              </div>
              <div class="cw-form-group">
                <label class="cw-form-label">邀约时间 <span class="cw-required">*</span></label>
                <input
                  v-model="inviteWhen"
                  class="cw-input"
                  placeholder="例如：明天下午、本周末"
                  aria-label="邀约时间"
                />
              </div>
            </template>

            <!-- 行动意图草稿 -->
            <div class="cw-form-group">
              <label class="cw-form-label">行动说明</label>
              <textarea
                v-model="actionDraft"
                rows="3"
                class="cw-textarea"
                placeholder="行动意向描述……"
                aria-label="行动草稿"
              ></textarea>
            </div>
          </div>

          <!-- 底部吸底操作栏 -->
          <div class="cw-drawer-footer">
            <button class="cw-btn cw-btn-ghost" @click="routeOpen = false">取消</button>
            <button class="cw-btn cw-btn-primary" @click="submitDraft">
              <SvgIcon name="send" :size="14" />
              <span>提交行动</span>
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, inject, watch } from 'vue';
import { useWorldState } from '../../../utils/context';
import { RuntimeKey, type Runtime } from '../../../../../运行/host';
import { visibleLocations, wheelView, estimateTravel } from '../../../../../运行/map';
const state = useWorldState();
const runtime = inject<Runtime | null>(RuntimeKey, null);
import SvgIcon from '../../icons/SvgIcon.vue';
import MapBaseLayer from './MapBaseLayer.vue';
import { worldDistricts } from '../../../utils/city';
import {
  districtPositions,
  mapPositions,
  groupMapPoints,
  layoutMapLabels,
  layoutDistrictLabels,
} from '../../../utils/map-layout';

const props = defineProps<{
  world: any;
  focusLocation?: string;
}>();

const emit = defineEmits<{
  (e: 'back'): void;
  (e: 'actionFeedback', msg: string): void;
}>();

const selectedDistrictId = ref<string>('all');
const selectedSpotId = ref<string | null>(null);
const showLocationList = ref(false);
const isOverview = computed(() => selectedDistrictId.value === 'all');

onMounted(() => {
  if (props.focusLocation && visibleLocations(state.value)[props.focusLocation])
    focusSpot(props.focusLocation, spots.value[props.focusLocation]);
});
const showBookmarksOnly = ref(false);
const bookmarks = computed<string[]>(() => state?.value?.手机?._地图收藏 ?? []);
const routeMode = ref('公共交通');
const actionDraft = ref('');
const routeOpen = ref(false);
const inviting = ref(false),
  inviteWho = ref(''),
  inviteWhen = ref('');
const travelMinutes = computed(() =>
  estimateTravel(state.value.地点[state.value.玩家.当前状态.当前地点id], selectedSpot.value, routeMode.value),
);

// 城市生活区、周边文明与口袋维度
const districts = computed(() =>
  Object.fromEntries(
    worldDistricts.map(d => [
      d.id,
      {
        ...props.world?.片区?.[d.id],
        名称: d.name,
        功能: d.role,
      },
    ]),
  ),
);
const mapDistricts = computed(() =>
  layoutDistrictLabels(
    worldDistricts.map(d => ({ ...d, ...districtPositions[d.id] })),
    overviewLabelScale.value,
  ),
);
const activeDistrictName = computed(() => districts.value[selectedDistrictId.value]?.名称 ?? '地区地图');
const activeDistrictDescription = computed(() =>
  selectedDistrictId.value === 'all'
    ? '从瓦罗兰市走向诸文明 · 点击区域展开'
    : worldDistricts.find(d => d.id === selectedDistrictId.value)?.desc,
);
const displayPositions = computed(() =>
  isOverview.value ? {} : mapPositions(filteredSpots.value, props.world?.片区 || {}, selectedDistrictId.value),
);
const unmappedCount = computed(() => Object.keys(filteredSpots.value).filter(id => !displayPositions.value[id]).length);

// 只有玩家已知地点进入地图、名录和聚焦；公开营业不自动赋予知情。
const spots = computed(() => visibleLocations(state?.value));

// ViewBox 响应式聚焦、缩放与平移状态
const vbW = ref(1000);
const mapSvg = ref<SVGSVGElement>();
const mapSurface = ref<HTMLDivElement>();
const mapRatio = ref(0.7);
const mapWidth = ref(600);
const center = ref({ x: 500, y: 350 });
const vbH = computed(() => vbW.value * mapRatio.value);
// 相机按实际屏幕比例覆盖地图，缩到最小时也不露出画布外的空白。
const maxVbW = computed(() => Math.min(1000, 700 / mapRatio.value));

// 实际 SVG 宽度决定像素字号，适应不同地图容器。
const labelScale = computed(() => vbW.value / mapWidth.value);
const overviewLabelScale = computed(() => Math.min(2.8, labelScale.value));

function boundedOrigin(value: number, span: number, total: number) {
  return span >= total ? (total - span) / 2 : Math.max(0, Math.min(total - span, value - span / 2));
}
const vbX = computed(() => boundedOrigin(center.value.x, vbW.value, 1000));
const vbY = computed(() => boundedOrigin(center.value.y, vbH.value, 700));
let mapObserver: ResizeObserver | undefined;
onMounted(() => {
  mapObserver = new ResizeObserver(([entry]) => {
    if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
      const wasFullMap = Math.abs(vbW.value - maxVbW.value) < 1;
      mapRatio.value = entry.contentRect.height / entry.contentRect.width;
      mapWidth.value = entry.contentRect.width;
      vbW.value = wasFullMap ? maxVbW.value : Math.min(vbW.value, maxVbW.value);
    }
  });
  // ResizeObserver 观察 HTML 容器；SVG 的观测尺寸可能是内部图形边界。
  if (mapSurface.value) mapObserver.observe(mapSurface.value);
});
onBeforeUnmount(() => mapObserver?.disconnect());

const currentViewBox = computed(() => `${vbX.value} ${vbY.value} ${vbW.value} ${vbH.value}`);

function focusDistrict(distId: string) {
  if (distId !== 'all' && !districts.value[distId]) return;
  selectedDistrictId.value = distId;
  selectedSpotId.value = null;
  showLocationList.value = false;
  showBookmarksOnly.value = false;
  routeOpen.value = false;
  moved = false;
  resetZoom();
}

function onWheel(e: WheelEvent) {
  const matrix = mapSvg.value?.getScreenCTM();
  if (!matrix) return;
  const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
  const next = wheelView(
    { x: vbX.value, y: vbY.value, width: vbW.value, ratio: mapRatio.value, maxWidth: maxVbW.value },
    point,
    e.deltaY,
    e.deltaMode,
  );
  vbW.value = next.width;
  center.value = next.center;
}
function zoomIn() {
  vbW.value = Math.max(Math.min(280, maxVbW.value), vbW.value * 0.8);
}

function zoomOut() {
  vbW.value = Math.min(maxVbW.value, vbW.value * 1.25);
}

function resetZoom() {
  vbW.value = maxVbW.value;
  center.value = { x: 500, y: 350 };
}

// 拖拽平移支持
const isDragging = ref(false);
let dragStartX = 0;
let dragStartY = 0;
let startVbX = 0;
let startVbY = 0;
let dragScale = 1;
let moved = false;
let activePointer: number | null = null;

function onMapPointerDown(e: PointerEvent) {
  if (e.button !== 0 || activePointer !== null) return;
  activePointer = e.pointerId;
  moved = false;
  isDragging.value = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  startVbX = vbX.value;
  startVbY = vbY.value;
  dragScale = mapSvg.value?.getScreenCTM()?.a || 1;
}

function onMapPointerMove(e: PointerEvent) {
  if (e.pointerId !== activePointer) return;
  if (Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY) <= 4 && !moved) return;
  moved = true;
  mapSvg.value?.setPointerCapture(e.pointerId);
  const dx = (e.clientX - dragStartX) / dragScale;
  const dy = (e.clientY - dragStartY) / dragScale;
  center.value = {
    x: boundedOrigin(startVbX + vbW.value / 2 - dx, vbW.value, 1000) + vbW.value / 2,
    y: boundedOrigin(startVbY + vbH.value / 2 - dy, vbH.value, 700) + vbH.value / 2,
  };
}

function onMapPointerUp(e: PointerEvent) {
  if (e.pointerId !== activePointer) return;
  if (mapSvg.value?.hasPointerCapture(e.pointerId)) mapSvg.value.releasePointerCapture(e.pointerId);
  activePointer = null;
  isDragging.value = false;
}

const mapMarkers = computed(() => groupMapPoints(filteredSpots.value, displayPositions.value, selectedSpotId.value));
const markerSpots = computed(() => Object.fromEntries(mapMarkers.value.map(point => [point.id, point.spot])));
const spotLayoutList = computed(() =>
  isOverview.value
    ? []
    : layoutMapLabels(markerSpots.value, displayPositions.value, {
        x: vbX.value,
        y: vbY.value,
        w: vbW.value,
        h: vbH.value,
        scale: labelScale.value,
        selected: selectedSpotId.value,
      }).map(item => ({ ...item, count: mapMarkers.value.find(point => point.id === item.id)?.members.length ?? 1 })),
);

const filteredSpots = computed(() => {
  const result: Record<string, any> = {};
  if (isOverview.value) return result;
  Object.entries(spots.value).forEach(([id, s]: [string, any]) => {
    if (s.片区id !== selectedDistrictId.value) {
      return;
    }
    if (showBookmarksOnly.value && !bookmarks.value.includes(id)) {
      return;
    }
    result[id] = s;
  });
  return result;
});

const selectedSpot = computed(() => {
  if (isOverview.value || !selectedSpotId.value) return null;
  return filteredSpots.value[selectedSpotId.value] || null;
});
const selectedGroup = computed(
  () => mapMarkers.value.find(point => point.members.includes(selectedSpotId.value ?? ''))?.members ?? [],
);

function selectSpot(id: string, spot: any) {
  if (moved) return;
  focusSpot(id, spot);
}

function focusSpot(id: string, spot: any) {
  const known = spots.value[id];
  if (!known || !districts.value[known.片区id]) {
    emit('actionFeedback', '该地点尚未确认或归属地区地图未配置');
    return;
  }
  const changingDistrict = selectedDistrictId.value !== known.片区id;
  if (changingDistrict) focusDistrict(known.片区id);
  showBookmarksOnly.value = false;
  selectedSpotId.value = id;
  const position = displayPositions.value[id];
  if (position) {
    const sx = position.x;
    const sy = position.y;
    if (vbW.value > 600) vbW.value = Math.max(280, Math.min(460, mapWidth.value));
    center.value = { x: sx, y: sy };
  } else {
    resetZoom();
  }
}

function onPickLocation(id: string, spot: any) {
  focusSpot(id, spot);
  showLocationList.value = false;
}

function isBookmarked(id: string | null) {
  if (!id) return false;
  return bookmarks.value.includes(id);
}

async function toggleBookmark(id: string | null) {
  if (!id) return;
  if (!runtime) {
    emit('actionFeedback', '离线展示不保存收藏');
    return;
  }
  try {
    await runtime.commit(s => {
      const list = s.手机._地图收藏;
      s.手机._地图收藏 = list.includes(id) ? list.filter(k => k !== id) : [...list, id];
    });
  } catch (e) {
    emit('actionFeedback', String(e));
  }
}

function handleGoThere(spot: any) {
  inviting.value = false;
  routeOpen.value = true;
  actionDraft.value = '计划前往' + spot.名称 + '。';
}

function handleMakeCovenant(spot: any) {
  inviting.value = true;
  routeOpen.value = true;
  actionDraft.value = '提出邀约，地点：' + spot.名称 + '。等待对方回应。';
}

async function submitDraft() {
  if (!runtime) {
    emit('actionFeedback', '离线展示不提交行动');
    return;
  }
  if (inviting.value && (!inviteWho.value.trim() || !inviteWhen.value.trim())) {
    emit('actionFeedback', '请填写邀约对象与时间');
    return;
  }
  try {
    await runtime.send(
      actionDraft.value +
        (inviting.value ? ` 对象：${inviteWho.value}；时间：${inviteWhen.value}。` : '') +
        ' 交通方式：' +
        routeMode.value +
        '，路线基准耗时：' +
        (travelMinutes.value ?? '未知') +
        '分钟。按实际过程判断耗时与是否抵达；提出邀约不视为对方同意。',
    );
    routeOpen.value = false;
  } catch (e) {
    emit('actionFeedback', String(e));
  }
}

watch(
  () => props.focusLocation,
  id => {
    if (id && spots.value[id]) focusSpot(id, spots.value[id]);
  },
  { immediate: true },
);
</script>

<style scoped lang="scss">
.cw-map-caption {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  padding: 7px 12px;
  background: #f7f5ed;
  color: #6e786b;
  font-size: 11px;
  line-height: 1.6;
  flex-shrink: 0;
}
.cw-map-uncertain {
  border: 0;
  background: transparent;
  color: #8c653b;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}
.cw-districts-layer {
  cursor: pointer;
}
.cw-district-label-bg {
  fill: #fff8e5f0;
  stroke: #897251;
  stroke-width: 1;
}
.cw-districts-layer > g:hover .cw-district-label-bg,
.cw-districts-layer > g:focus .cw-district-label-bg {
  fill: #fffdf4;
  stroke: #5d795e;
  stroke-width: 2;
}
.cw-marker-count-bg {
  fill: #526d5a;
  stroke: #fff7e8;
  stroke-width: 1.5;
}
.cw-marker-count-text {
  fill: #fffdf5;
  font-weight: 700;
  pointer-events: none;
}
.cw-building-places {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0;
}
.cw-building-place {
  border: 1px solid var(--cw-border);
  border-radius: 6px;
  padding: 4px 8px;
  background: var(--cw-bg-surface);
  color: var(--cw-text-secondary);
  font-size: 11px;
  cursor: pointer;
}
.cw-building-place.active {
  border-color: var(--cw-accent);
  color: var(--cw-accent);
  background: var(--cw-bg-card-subtle);
}

.cw-map-app {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--cw-bg-main);
  overflow: hidden;
  position: relative;
}

.cw-app-header {
  height: 48px;
  background: var(--cw-bg-surface);
  border-bottom: 1px solid var(--cw-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  user-select: none;
  z-index: 10;
  flex-shrink: 0;

  .cw-header-left,
  .cw-header-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .cw-header-title {
    font-size: 15px;
    font-weight: 600;
  }
}

.cw-btn-icon {
  background: none;
  border: none;
  color: var(--cw-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 5px;
  border-radius: var(--cw-radius-sm);
  cursor: pointer;

  &:hover,
  &.active {
    color: var(--cw-accent);
    background: var(--cw-bg-card-subtle);
  }
}

.cw-districts-bar {
  display: flex;
  gap: 6px;
  padding: 8px 12px;
  background: var(--cw-bg-surface);
  border-bottom: 1px solid var(--cw-border);
  overflow-x: auto;
  user-select: none;
  z-index: 10;
  flex-shrink: 0;

  .cw-dist-chip {
    padding: 3px 10px;
    border-radius: var(--cw-radius-full);
    border: 1px solid var(--cw-border);
    background: var(--cw-bg-card-subtle);
    color: var(--cw-text-secondary);
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;

    &.active {
      background: var(--cw-accent);
      color: var(--cw-text-inverse);
      border-color: var(--cw-accent);
    }
  }
}

.cw-map-viewport {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #eeeae1;
}
.cw-map-surface {
  flex: 1;
  min-height: 0;
  width: 100%;
  position: relative;
  overflow: hidden;
}

.cw-map-compass {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  color: #526964;
  background: #fffdf3e8;
  border: 1px solid #d5dace;
  border-radius: 18px;
  padding: 5px 8px;
  font: 600 10px/1.2 system-ui;
  pointer-events: none;
  z-index: 5;
  span {
    font-size: 22px;
  }
}

.cw-map-legend {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-top: 1px solid #d9dece;
  background: #faf9f2;
  color: #64726c;
  font-size: 10px;
  z-index: 5;
  span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  i {
    width: 9px;
    height: 9px;
    border-radius: 2px;
  }
  .cw-legend-water {
    background: #b6d4d9;
  }
  .cw-legend-green {
    background: #d2dfc7;
  }
  .cw-legend-road {
    background: #fff1cf;
    border: 1px solid #d4c1a0;
  }
  .cw-map-scale {
    margin-left: auto;
  }
}

.cw-map-floating-controls {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 20;

  .cw-map-ctrl-btn {
    width: 36px;
    height: 36px;
    min-width: 36px;
    min-height: 36px;
    border-radius: var(--cw-radius-full);
    background: rgba(255, 255, 255, 0.94);
    border: 1px solid var(--cw-border);
    color: var(--cw-text-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    transition: all 0.15s ease;

    &:hover {
      background: var(--cw-bg-surface);
      color: var(--cw-accent);
      transform: scale(1.08);
    }
  }
}

.cw-city-svg-map {
  width: 100%;
  height: 100%;
  display: block;
  min-height: 0;
  touch-action: none;
  user-select: none;
  cursor: grab;

  &.is-dragging {
    cursor: grabbing;
  }
}

.cw-district-label {
  font-weight: 700;
  fill: #4b5d51;
  paint-order: stroke;
  stroke: #f9f6ec;
  letter-spacing: 2px;
}

.cw-district-sublabel {
  fill: #617062;
}

.cw-leader-line {
  stroke: #7c6d59;
  stroke-dasharray: 3 2.5;
  opacity: 0.75;
  pointer-events: none;
  transition:
    stroke 0.2s,
    opacity 0.2s;

  &.active {
    stroke: var(--cw-accent);
    stroke-dasharray: none;
    opacity: 1;
  }
}

.cw-spot-marker {
  cursor: pointer;

  .cw-marker-hitbox {
    cursor: pointer;
  }

  .cw-marker-pulse {
    fill: rgba(196, 120, 60, 0.2);
    stroke: var(--cw-accent);
    transition:
      r 0.2s,
      fill 0.2s;
  }

  .cw-marker-core {
    fill: var(--cw-accent);
    stroke: #ffffff;
  }

  .cw-spot-label-group {
    cursor: pointer;
    pointer-events: auto;

    .cw-spot-label-bg {
      fill: rgba(255, 255, 255, 0.94);
      stroke: rgba(0, 0, 0, 0.2);
      filter: drop-shadow(0 1.5px 3px rgba(0, 0, 0, 0.16));
      transition:
        fill 0.2s,
        stroke 0.2s,
        filter 0.2s;
    }

    .cw-spot-name-text {
      font-weight: 600;
      fill: #22201c;
      letter-spacing: 0.3px;
      transition: fill 0.2s;
    }
  }

  &:hover,
  &.active {
    .cw-marker-pulse {
      fill: rgba(196, 120, 60, 0.45);
    }
    .cw-marker-core {
      fill: var(--cw-danger);
    }
    .cw-spot-label-group {
      .cw-spot-label-bg {
        fill: #ffffff;
        stroke: var(--cw-accent);
        filter: drop-shadow(0 2px 6px rgba(196, 120, 60, 0.35));
      }
      .cw-spot-name-text {
        fill: var(--cw-accent);
        font-weight: 700;
      }
    }
  }
}

/* 地点详情浮层卡片 (浮动在地图视口下方) */
.cw-spot-detail-card {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 12px;
  z-index: 15;
  max-height: 75%;
  overflow-y: auto;
  background: var(--cw-bg-surface);
  border-radius: var(--cw-radius);
  border: 1px solid var(--cw-border);
  box-shadow: var(--cw-shadow-lg);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;

  .cw-spot-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;

    .cw-spot-card-title {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      flex-wrap: wrap;

      .cw-spot-title-text {
        font-size: 14px;
        font-weight: 700;
        color: var(--cw-text-primary);
      }
    }
  }

  .cw-btn-close-spot {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--cw-text-muted);
    padding: 6px;
    min-width: 28px;
    min-height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;

    &:hover {
      color: var(--cw-text-primary);
    }
  }

  .cw-spot-desc {
    margin: 0;
    font-size: 12px;
    color: var(--cw-text-secondary);
    line-height: 1.5;
  }

  .cw-spot-specs {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 11px;

    .cw-spec-row {
      display: flex;
      gap: 4px;

      .cw-k {
        color: var(--cw-text-muted);
      }
      .cw-v {
        color: var(--cw-text-primary);
      }
    }
  }

  .cw-spot-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 4px;
    padding-top: 6px;
    border-top: 1px dashed var(--cw-border);
  }

  .cw-bookmarked {
    color: var(--cw-accent);
    font-weight: 600;
  }
}

/* 模态遮罩与抽屉容器 */
.cw-modal-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 100;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.cw-location-drawer,
.cw-route-drawer {
  background: var(--cw-bg-surface);
  border-top-left-radius: var(--cw-radius-lg);
  border-top-right-radius: var(--cw-radius-lg);
  border-top: 1px solid var(--cw-border);
  box-shadow: var(--cw-shadow-lg);
  display: flex;
  flex-direction: column;
  max-height: 80%;
  animation: cwSlideUp 0.25s ease-out;
}

.cw-drawer-header {
  height: 44px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--cw-border);
  flex-shrink: 0;

  .cw-drawer-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--cw-text-primary);
  }
}

.cw-drawer-body {
  padding: 12px 14px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-height: 0;
}

.cw-drawer-footer {
  padding: 10px 14px;
  border-top: 1px solid var(--cw-border);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  background: var(--cw-bg-card-subtle);
  flex-shrink: 0;
}

/* 地点名录卡片 */
.cw-loc-item-card {
  padding: 8px 10px;
  border-radius: var(--cw-radius-sm);
  border: 1px solid var(--cw-border);
  background: var(--cw-bg-card-subtle);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
  transition: all 0.15s ease;

  &:hover,
  &.active {
    border-color: var(--cw-accent);
    background: var(--cw-bg-surface);
  }

  .cw-loc-item-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;

    .cw-loc-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--cw-text-primary);
    }
  }

  .cw-loc-meta {
    font-size: 11px;
    color: var(--cw-text-secondary);
  }
}

/* 路线卡片 */
.cw-route-target-card {
  padding: 10px 12px;
  background: var(--cw-bg-card-subtle);
  border-radius: var(--cw-radius-sm);
  border: 1px solid var(--cw-border);

  .cw-target-name {
    font-size: 14px;
    font-weight: 700;
    color: var(--cw-text-primary);
  }
  .cw-target-sub {
    font-size: 12px;
    color: var(--cw-text-secondary);
    margin-top: 3px;
  }
}

.cw-form-group {
  display: flex;
  flex-direction: column;
  gap: 5px;

  .cw-form-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--cw-text-secondary);
  }
}

.cw-mode-chips {
  display: flex;
  gap: 8px;

  .cw-mode-chip {
    flex: 1;
    padding: 6px 0;
    border-radius: var(--cw-radius-sm);
    border: 1px solid var(--cw-border);
    background: var(--cw-bg-card-subtle);
    color: var(--cw-text-secondary);
    font-size: 12px;
    cursor: pointer;
    text-align: center;

    &.active {
      background: var(--cw-accent);
      color: var(--cw-text-inverse);
      border-color: var(--cw-accent);
      font-weight: 600;
    }
  }
}

.cw-input,
.cw-textarea {
  width: 100%;
  padding: 7px 10px;
  border-radius: var(--cw-radius-sm);
  border: 1px solid var(--cw-border);
  background: var(--cw-bg-surface);
  color: var(--cw-text-primary);
  font-size: 12px;
  box-sizing: border-box;

  &:focus {
    border-color: var(--cw-accent);
    outline: none;
  }
}

.cw-textarea {
  resize: vertical;
}

.cw-required {
  color: var(--cw-danger);
}

.cw-empty-state {
  text-align: center;
  padding: 24px;
  color: var(--cw-text-muted);
  font-size: 12px;
}

.cw-empty-backdrop {
  flex: 1;
  width: 100%;
  min-height: 180px;
  box-sizing: border-box;
  margin: 0;
  padding: 32px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  border: none;
  border-radius: 0;
  background: transparent;

  .cw-empty-icon {
    color: var(--cw-text-muted);
    opacity: 0.35;
    margin-bottom: 12px;
  }

  .cw-empty-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--cw-text-secondary);
    margin-bottom: 6px;
  }

  .cw-empty-desc {
    font-size: 12px;
    color: var(--cw-text-muted);
    line-height: 1.6;
    max-width: 260px;
  }

  .cw-empty-action {
    margin-top: 14px;
  }
}

@keyframes cwSlideUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}
</style>
