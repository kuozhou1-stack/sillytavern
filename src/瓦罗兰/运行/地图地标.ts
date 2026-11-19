import geography from './world-geography.json';
import type { State } from './core';

/** 只补齐旧版本七处预置地点的空坐标，不公开地点或覆盖剧情中的移动。 */
const addedLandmarks: Record<string, string> = {
  cutie_cafe: 'oldtown',
  lotus_hot_spring: 'ionia',
  true_ice_seal: 'freljord',
  ocean_song_island: 'bilgewater',
  celestial_realm: 'targon',
  black_mist_boundary: 'shadow_isles',
  bandle_passage: 'bandle_city',
};

export function normalizeMapLandmarks(state: State): State {
  let places = state.地点;
  for (const [id, districtId] of Object.entries(addedLandmarks)) {
    const place = places[id];
    const position = place?.地图位置;
    const point = (geography.positions as Record<string, number[]>)[id];
    if (
      !place || place.片区id !== districtId || !point ||
      position?.精度 !== '未知' || position.x !== null || position.y !== null
    ) continue;
    if (places === state.地点) places = { ...places };
    places[id] = { ...place, 地图位置: { x: point[0], y: point[1], 精度: '地点' } };
  }
  return places === state.地点 ? state : { ...state, 地点: places };
}
