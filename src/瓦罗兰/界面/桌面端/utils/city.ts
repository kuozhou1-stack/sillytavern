import geography from '../../../运行/world-geography.json';

/** 城市与周边文明共用地理配置；源数据维护于世界书的地区 YAML。 */
export const worldDistricts = geography.districts;
export const cityDistricts = worldDistricts.filter(d => d.scope === '城市生活区');
export const cityDistrictNames: Record<string, string> = Object.fromEntries(worldDistricts.map(d => [d.id, d.name]));

export type DistrictMap = {
  bounds: { x: number; y: number; w: number; h: number };
  theme: string;
  zones: { name: string; kind: string; x: number; y: number; w: number; h: number }[];
};
export const detailedMaps: Record<string, DistrictMap> = Object.fromEntries(worldDistricts.map(d => [d.id, d.map]));
