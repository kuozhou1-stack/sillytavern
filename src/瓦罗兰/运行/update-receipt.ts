import { equal, type State } from './core';
export type UpdateReceipt = { taskId: string; commitId: string; floor: number; targets: string[]; changed: string[] };
/** Diagnostic paths, not a second state store and not model input. */
export function changedPublicPaths(before: any, after: any, base = ''): string[] {
  if (equal(before, after)) return [];
  if (
    !before ||
    !after ||
    typeof before !== 'object' ||
    typeof after !== 'object' ||
    Array.isArray(before) ||
    Array.isArray(after)
  )
    return [base];
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(k => !k.startsWith('_'))
    .flatMap(k => changedPublicPaths(before[k], after[k], base + '/' + k));
}
export function unknownPublicPaths(value: any, base = ''): string[] {
  if (value === null || value === '') return [base];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value)
    .filter(([key]) => !key.startsWith('_'))
    .flatMap(([key, child]) => unknownPublicPaths(child, base + '/' + key));
}
export function taskReceipt(before: State, after: State, taskId: string, floor: number): UpdateReceipt {
  const task = before._系统.任务[taskId];
  return {
    taskId,
    commitId: task.提交id!,
    floor,
    targets: [...task.目标id],
    changed: changedPublicPaths(before, after),
  };
}
