import { worldDistricts, detailedMaps } from './city';
import geography from '../../../运行/world-geography.json';
import legacyPositions from '../../../运行/map-legacy-positions.json';
const fixedPositions: Record<string, number[]> = geography.positions;
const legacyMap: Record<string, { districtId: string; positions: number[][] }> = legacyPositions;

type Point = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };
export type MapView = Box & { scale: number; selected?: string | null };

// 瓦罗兰区域示意坐标不写回 MVU，也不用于推算跨文明旅行距离。
export const districtPositions: Record<string, Point & { labelY: number }> = Object.fromEntries(
  worldDistricts.map(d => [d.id, { x: d.x, y: d.y, labelY: d.labelY }]),
);

/** 世界总览只显示区域名称，移动标签避让，不改变地区或地点的正式坐标。 */
export function layoutDistrictLabels<T extends Point & { id: string; name: string }>(districts: T[], scale: number) {
  const boxes: Box[] = [];
  return districts.map(district => {
    const w = (district.name.length * 12 + 26) * scale;
    const h = 28 * scale;
    const candidates: Point[] = [{ x: district.x, y: district.y }];
    for (let radius = h + 8; radius <= 1000; radius += h + 8)
      for (let i = 0; i < 16; i++)
        candidates.push({
          x: district.x + Math.cos((i * Math.PI) / 8) * radius,
          y: district.y + Math.sin((i * Math.PI) / 8) * radius,
        });
    const position = candidates
      .map(point => ({
        x: Math.max(w / 2 + 4, Math.min(996 - w / 2, point.x)),
        y: Math.max(h / 2 + 4, Math.min(696 - h / 2, point.y)),
        w: w + 6,
        h: h + 6,
      }))
      .find(candidate => !boxes.some(box => overlaps(box, candidate)));
    if (!position) throw Error(`世界地图名称无法排布：${district.id}`);
    boxes.push(position);
    return { ...district, x: position.x, y: position.y };
  });
}

export function hasPrecisePosition(spot: any) {
  return spot?.地图位置?.精度 === '地点' && Number.isFinite(spot.地图位置.x) && Number.isFinite(spot.地图位置.y);
}

/** 保留存档中的实际世界坐标；详情只投影所属地区，不挪动地点或代填未知位置。 */
export function mapPositions(
  spots: Record<string, any>,
  _districts: Record<string, any>,
  districtId?: string,
): Record<string, Point> {
  const result: Record<string, Point> = {};
  const frame = districtId ? detailedMaps[districtId]?.bounds : undefined;
  if (districtId && !frame) return result;
  for (const [id, spot] of Object.entries(spots).sort(([a], [b]) => a.localeCompare(b))) {
    if (!hasPrecisePosition(spot) || (districtId && spot.片区id !== districtId)) continue;
    const point = { x: spot.地图位置.x, y: spot.地图位置.y };
    if (frame) {
      // 只校正曾经发布的预设坐标；玩家新增或剧情中改变的地址照常读取存档。
      const legacy = legacyMap[id];
      const fixed = fixedPositions[id];
      if (
        fixed &&
        legacy?.districtId === districtId &&
        legacy.positions.some(old => old[0] === point.x && old[1] === point.y)
      ) {
        point.x = fixed[0];
        point.y = fixed[1];
      }
      point.x = ((point.x - frame.x) / frame.w) * 1000;
      point.y = ((point.y - frame.y) / frame.h) * 700;
      if (point.x < 0 || point.x > 1000 || point.y < 0 || point.y > 700) continue;
    }
    result[id] = point;
  }
  return result;
}

/** 同一建筑保留一个精确点，内部场所仍能独立选择，避免制造相邻假楼宇。 */
export function groupMapPoints(spots: Record<string, any>, positions: Record<string, Point>, selected?: string | null) {
  const groups = new Map<string, string[]>();
  for (const id of Object.keys(positions)
    .filter(id => spots[id])
    .sort()) {
    const p = positions[id];
    const key = `${spots[id].片区id}:${p.x.toFixed(3)}:${p.y.toFixed(3)}`;
    groups.set(key, [...(groups.get(key) ?? []), id]);
  }
  return [...groups.values()].map(members => {
    const id =
      members.find(id => id === selected) ?? members.find(id => !members.includes(spots[id].上级地点id)) ?? members[0];
    return { id, spot: spots[id], members, ...positions[id] };
  });
}

function overlaps(a: Box, b: Box) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
}

/** 地区标签按实际屏幕像素避让其他标签及点位热区。 */
export function layoutMapLabels(spots: Record<string, any>, positions: Record<string, Point>, view: MapView) {
  const s = view.scale;
  const items = Object.entries(spots).filter(([id]) => {
    const p = positions[id];
    return p && p.x >= view.x && p.x <= view.x + view.w && p.y >= view.y && p.y <= view.y + view.h;
  });
  const boxes: Box[] = items.map(([id]) => ({ ...positions[id], w: 25 * s, h: 25 * s }));
  // 浮动罗盘及缩放按钮也占用标签空间。
  boxes.push({ x: view.x + 23 * s, y: view.y + 32 * s, w: 46 * s, h: 64 * s });
  boxes.push({ x: view.x + view.w - 24 * s, y: view.y + 58 * s, w: 48 * s, h: 116 * s });
  items.sort(([a], [b]) => Number(b === view.selected) - Number(a === view.selected) || a.localeCompare(b));
  return items
    .map(([id, spot]) => {
      const p = positions[id];
      const name = spot.名称 ?? '未命名地点';
      const label = name.length > 10 ? name.slice(0, 9) + '…' : name;
      const w = Math.max(54, label.length * 11 + 16),
        h = 23;
      let labelPoint = { x: p.x, y: p.y + 24 * s };
      let showLabel = false;
      const offsets: Point[] = [
        { x: 0, y: 25 },
        { x: 0, y: -25 },
        { x: w / 2 + 18, y: 0 },
        { x: -w / 2 - 18, y: 0 },
      ];
      const maxRadius = id === view.selected ? Math.hypot(view.w, view.h) / s : 115;
      for (let radius = 42; radius <= maxRadius; radius += 18) {
        for (let i = 0; i < 12; i++)
          offsets.push({ x: Math.cos((i * Math.PI) / 6) * radius, y: Math.sin((i * Math.PI) / 6) * radius });
      }
      for (const offset of offsets) {
        const candidate = { x: p.x + offset.x * s, y: p.y + offset.y * s, w: (w + 8) * s, h: (h + 6) * s };
        if (
          candidate.x - candidate.w / 2 < view.x + 5 * s ||
          candidate.x + candidate.w / 2 > view.x + view.w - 5 * s ||
          candidate.y - candidate.h / 2 < view.y + 5 * s ||
          candidate.y + candidate.h / 2 > view.y + view.h - 5 * s
        )
          continue;
        if (boxes.some(box => overlaps(box, candidate))) continue;
        labelPoint = candidate;
        boxes.push(candidate);
        showLabel = true;
        break;
      }
      return {
        id,
        spot,
        label,
        baseX: p.x,
        baseY: p.y,
        lx: labelPoint.x,
        ly: labelPoint.y,
        w,
        h,
        showLabel,
        hasLeader: showLabel,
        lineX1: p.x,
        lineY1: p.y,
        lineX2: labelPoint.x,
        lineY2: labelPoint.y,
      };
    })
    .sort((a, b) => Number(a.id === view.selected) - Number(b.id === view.selected));
}
