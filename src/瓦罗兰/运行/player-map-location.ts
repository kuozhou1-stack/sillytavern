import type { State } from './core';
import geography from './world-geography.json';

export function playerMapLocationIds(state: State): string[] {
  return [...new Set([
    state.玩家.当前状态.当前地点id,
    state.玩家.生活.住处id,
    ...state.玩家.生活.工作地点id,
    ...state.玩家.生活.常去地点id,
  ].filter((id): id is string => Boolean(id)))];
}

/** 只补有描述、玩家已知且属于其当前生活引用的自设地址；预置点和已有坐标保留。 */
export function pendingPlayerMapLocations(state: State) {
  return playerMapLocationIds(state).flatMap(id => {
    const place = state.地点[id];
    const district = geography.districts.find(row => row.id === place?.片区id);
    if (!place || !district || (!place.名称?.trim() && !place.简介?.trim()) ||
        !Object.hasOwn(state.玩家.已知信息.已知地点, id) || Object.hasOwn(geography.locationNames, id) ||
        place.地图位置.x !== null || place.地图位置.y !== null || place.地图位置.精度 === '地点') return [];
    return [{ id, 名称: place.名称, 简介: place.简介, 片区id: place.片区id, district }];
  });
}

export function playerMapLocationPrompt(state: State, heading = '玩家') {
  const requests = pendingPlayerMapLocations(state);
  if (!requests.length) return '';
  const districtIds = new Set(requests.map(row => row.片区id));
  const maps = geography.districts.filter(row => districtIds.has(row.id)).map(row => ({
    片区id: row.id,
    名称: row.name,
    世界范围: row.map.bounds,
    街区局部范围: row.map.zones,
    已知参照点: Object.entries(state.地点)
      .filter(([id, place]) => place.片区id === row.id &&
        Object.hasOwn(state.玩家.已知信息.已知地点, id) && place.地图位置.精度 === '地点')
      .map(([id, place]) => ({ id, 名称: place.名称, x: place.地图位置.x, y: place.地图位置.y })),
  }));
  return `【${heading}自设地点定位】
玩家已授权为自己设定的地点补地图标点，包含旧存档尚未定位的开局地址。按地点名称、描述和所属地区的实际街区安排位置；已有地点id、所属地区及既定地址保持不变，不为这件事新建替代地点。为下列空坐标写入有限数值 x/y 与精度“地点”，不再仅保留片区或未知；这属于授权补全，不能以“不得猜测位置”跳过。
世界地图使用1000×700坐标，各地区详细图也使用1000×700局部坐标。先按街区选取局部点(u,v)，再写入世界坐标：x=世界范围.x+u/1000*世界范围.w，y=世界范围.y+v/700*世界范围.h。x/y必须落在所属世界范围内，保留至三位小数即可；不能直接把局部点或默认片区中心写入。与同一栋建筑共享地址时可沿用该建筑坐标，已有地点保持原归属；普通新建筑应位于对应街区。
本条仅授权更新清单中记录的地图位置，包含仅名称模式下的这项明确补全；不展开或修改其他字段，不改资料加载偏好。其他预置点、角色私宅和已确定坐标不改动。地址定位不表示玩家已经出行，也不授予进入受限区域的权限。坐标补齐后本条不再重复提供。
待定位地点：${JSON.stringify(requests.map(({ district, ...place }) => place))}
相关地区定位资料：${JSON.stringify(maps)}\n`;
}

export function validPlayerMapPosition(place: State['地点'][string] | undefined) {
  const district = geography.districts.find(row => row.id === place?.片区id);
  const position = place?.地图位置;
  if (!district || position?.精度 !== '地点' || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return false;
  const bounds = district.map.bounds;
  return position.x! >= bounds.x && position.x! <= bounds.x + bounds.w &&
    position.y! >= bounds.y && position.y! <= bounds.y + bounds.h;
}
