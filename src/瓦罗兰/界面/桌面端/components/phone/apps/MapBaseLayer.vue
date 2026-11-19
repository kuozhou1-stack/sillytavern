<template>
  <g class="cw-map-base" aria-hidden="true">
    <defs>
      <clipPath :id="clipId"><rect width="1000" height="700" /></clipPath>
    </defs>
    <rect x="-2000" y="-2000" width="5000" height="5000" fill="#eee6d5" />
    <g :clip-path="`url(#${clipId})`">
      <image v-if="!districtId" :href="worldMapBackground" width="1000" height="700" preserveAspectRatio="none" />
      <template v-else>
        <image
          v-if="background"
          :href="background.src"
          :x="-background.col * 1000"
          :y="-background.row * 700"
          width="2000"
          height="1400"
          preserveAspectRatio="none"
        />
        <template v-if="detail">
          <!-- 道路、水域及绿地直接使用插画原稿，避免叠加示意线覆盖建筑。 -->
          <g v-for="zone in detail.zones" :key="zone.name">
            <text :x="zone.x + zone.w / 2" :y="zone.y + 21" text-anchor="middle" class="cw-zone-label">{{
              zone.name
            }}</text>
          </g>
        </template>
      </template>
    </g>
  </g>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue';
import { detailedMaps } from '../../../utils/city';
import { worldMapBackground, districtBackgrounds } from '../../../utils/map-assets';
const props = defineProps<{ districtId: string | null }>();
const clipId = 'cw-map-clip-' + useId().replace(/:/g, '');
const background = computed(() => districtBackgrounds[props.districtId ?? '']);
const detail = computed(() => detailedMaps[props.districtId ?? '']);
</script>

<style scoped>
.cw-map-base {
  pointer-events: none;
}
.cw-zone-label {
  fill: #665b44;
  font-size: 12px;
  font-weight: 500;
  paint-order: stroke;
  stroke: #fff9e6dd;
  stroke-width: 3px;
  stroke-linejoin: round;
}
</style>
