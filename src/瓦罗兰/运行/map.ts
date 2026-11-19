/** Confirmed fictional city travel table; map coordinates are not distances. */
const districtIds = ['riverside', 'oldtown', 'university', 'residential', 'market', 'coast'];
const transit = [
  [0, 15, 25, 20, 40, 30],
  [15, 0, 20, 25, 30, 40],
  [25, 20, 0, 35, 45, 45],
  [20, 25, 35, 0, 25, 30],
  [40, 30, 45, 25, 0, 50],
  [30, 40, 45, 30, 50, 0],
];
export function estimateTravel(from: any, to: any, mode: string): number | null {
  const a = districtIds.indexOf(from?.片区id),
    b = districtIds.indexOf(to?.片区id);
  if (a < 0 || b < 0) return null;
  // 城际、悬空与维度路线须有实际接驳依据，不套用地面通勤表。
  if ([from, to].some(spot => /悬空|移动|维度|天界|封印/.test(spot?.类型 ?? ''))) return null;
  if (a === b) return mode === '步行' ? 15 : 10;
  return mode === '步行'
    ? transit[a][b] * 4
    : mode === '网约车'
      ? Math.ceil((transit[a][b] * 0.8) / 5) * 5
      : transit[a][b];
}
export function visibleLocations(state: any): Record<string, any> {
  if (!state) return {};
  const known = state.玩家?.已知信息?.已知地点 ?? {};
  return Object.fromEntries(Object.entries(state.地点 ?? {}).filter(([id]) => Object.hasOwn(known, id)));
}
export function wheelView(
  view: { x: number; y: number; width: number; ratio: number; maxWidth?: number },
  point: { x: number; y: number },
  delta: number,
  mode = 0,
) {
  const pixels = delta * (mode === 1 ? 16 : mode === 2 ? 400 : 1);
  const maxWidth = view.maxWidth ?? 1000;
  const width = Math.max(Math.min(280, maxWidth), Math.min(maxWidth, view.width * Math.exp(Math.max(-100, Math.min(100, pixels)) * 0.002)));
  const scale = width / view.width;
  return {
    width,
    center: {
      x: point.x - (point.x - view.x) * scale + width / 2,
      y: point.y - (point.y - view.y) * scale + (width * view.ratio) / 2,
    },
  };
}
