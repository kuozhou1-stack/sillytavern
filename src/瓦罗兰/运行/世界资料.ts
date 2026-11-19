import information from './world-information.json';
import legacyDescriptions from './legacy-location-descriptions.json';
import descriptionUpgrades from './world-description-upgrades.json';
import type { State } from './core';

/** 只替换已确认的整段旧作者文案；自定义名称、文案、坐标与剧情均保留。 */
function normalizeAuthoredDescriptions(state: State): State {
  let places = state.地点;
  let areas = state.世界.片区;
  for (const row of descriptionUpgrades) {
    if (row.kind === '地点' && (row.field === '简介' || row.field === '进入条件')) {
      const current = places[row.id];
      if (!current || current.名称 !== row.name || current[row.field] !== row.before) continue;
      places = { ...places, [row.id]: { ...current, [row.field]: row.after } };
    } else if (row.kind === '片区' && row.field === '功能') {
      const current = areas[row.id];
      if (!current || current.名称 !== row.name || current.功能 !== row.before) continue;
      areas = { ...areas, [row.id]: { ...current, 功能: row.after } };
    }
  }
  if (places === state.地点 && areas === state.世界.片区) return state;
  return { ...state, 地点: places, 世界: areas === state.世界.片区 ? state.世界 : { ...state.世界, 片区: areas } };
}

/** 仅为尚未迁入资料的旧存档补齐既有世界书内容，不触碰人物、知情和剧情状态。 */
export function normalizeWorldInformation(state: State): State {
  state = normalizeAuthoredDescriptions(state);
  if (state._系统.资料加载.资料版本 === information.版本) return state;
  const places = { ...state.地点 }, groups = { ...state.组织 };
  for (const [id, legacy] of Object.entries(legacyDescriptions)) {
    const current = places[id];
    const preset = information.地点[id as keyof typeof information.地点];
    if (!current || !preset || current.名称 !== preset.名称) continue;
    for (const field of ['简介', '进入条件'] as const)
      if (places[id][field] === legacy[field]) places[id] = { ...places[id], [field]: preset[field] };
  }
  for (const [id, detail] of Object.entries(information.场所细则)) {
    const place = places[id];
    const preset = information.地点[id as keyof typeof information.地点];
    // 旧细则已随用户补充保存时，尊重整段自定资料，不再追加一份新版。
    const hasEarlierDetail = descriptionUpgrades.some(row => row.kind === '地点' && row.id === id &&
      row.previousDetail && place?.简介?.includes(row.previousDetail));
    if (place && preset && place.名称 === preset.名称 && !place.简介?.includes(detail) && !hasEarlierDetail)
      places[id] = { ...place, 简介: [place.简介, detail].filter(Boolean).join('\n\n') };
  }
  for (const [id, preset] of Object.entries(information.组织)) {
    const current = groups[id];
    if (!current) groups[id] = structuredClone(preset);
    else if (current.名称 === preset.名称)
      groups[id] = {
        ...current,
        类型: current.类型 ?? preset.类型,
        简介: current.简介 ?? preset.简介,
        规则: current.规则?.includes(preset.规则) ? current.规则 : [current.规则, preset.规则].filter(Boolean).join('\n\n'),
      };
  }
  return {
    ...state, 地点: places, 组织: groups,
    _系统: { ...state._系统, 资料加载: { ...state._系统.资料加载, 资料版本: information.版本 } },
  };
}
