import geography from './world-geography.json';
import type { State } from './core';

/** 稳定ID下的旧内置显示名；现名由地区YAML派生产物提供。自定义名称保持原样。 */
const legacyNames: Record<string, string> = {
  "riverside": "中央谐振区",
  "riverside_riverwalk": "谐振中央广场",
  "riverside_international_hotel": "谐振国际酒店",
  "university_university": "战斗学院",
  "university_student_dorms": "战斗学院学生生活区",
  "university_weapon_hall": "神之武器谐振礼堂",
  "bandle_passage": "班德尔维度入口",
  "demacia_city": "德玛西亚白色城邦",
  "market_craft_court": "符文工坊手创院",
  "qinghe_base_sunroom": "灵佑基地暖阳玻璃阳光房",
  "targon_foothills": "巨神峰山脚教派区"
};

export function normalizeGeographicNames(state: State): State {
  let areas = state.世界.片区;
  let places = state.地点;
  for (const [id, oldName] of Object.entries(legacyNames)) {
    const area = areas[id];
    const district = geography.districts.find(row => row.id === id);
    if (area?.名称 === oldName && district) {
      if (areas === state.世界.片区) areas = { ...areas };
      areas[id] = { ...area, 名称: district.name };
    }
    const place = places[id];
    const name = (geography.locationNames as Record<string, string>)[id];
    if (place?.名称 === oldName && name) {
      if (places === state.地点) places = { ...places };
      places[id] = { ...place, 名称: name };
    }
  }
  if (areas === state.世界.片区 && places === state.地点) return state;
  return { ...state, 世界: { ...state.世界, 片区: areas }, 地点: places };
}
