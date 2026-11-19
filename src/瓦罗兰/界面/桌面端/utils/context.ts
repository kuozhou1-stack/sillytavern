import { inject, type Ref } from 'vue';
export const StateKey = Symbol('瓦洛兰正式只读状态');
export function useWorldState() {
  return inject<Ref<any>>(StateKey)!;
}
export function locationName(state: any, id: unknown) {
  return typeof id === 'string' ? (state?.地点?.[id]?.名称 ?? '未知地点') : '未知';
}
export function show(value: any) {
  return value === null || value === undefined || value === '' ? '未知' : String(value);
}
