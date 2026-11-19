import remote from '../assets/maps/远程素材.json';
// 使用固定提交的图片链接，保持背景版本稳定并避免卡包内嵌图片。
const world = remote.files['world-overview.webp'].url;
const atlasA = remote.files['districts-a.webp'].url;
const atlasB = remote.files['districts-b.webp'].url;
const atlasC = remote.files['districts-c.webp'].url;
const atlasD = remote.files['districts-d.webp'].url;

export const worldMapBackground = world;
export type DistrictBackground = { src: string; col: number; row: number };
// 同一画册的四幅地图独立显示；SVG 裁切窗口不改动或复制原始画面。
export const districtBackgrounds: Record<string, DistrictBackground> = Object.fromEntries(
  [
    { src: atlasA, ids: ['riverside', 'oldtown', 'university', 'residential'] },
    { src: atlasB, ids: ['market', 'coast', 'demacia', 'noxus'] },
    { src: atlasC, ids: ['freljord', 'ionia', 'piltover_zaun', 'bilgewater'] },
    { src: atlasD, ids: ['shurima', 'targon', 'shadow_isles', 'bandle_city'] },
  ].flatMap(({ src, ids }) => ids.map((id, i) => [id, { src, col: i % 2, row: Math.floor(i / 2) }])),
);
