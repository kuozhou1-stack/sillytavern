import { copy, type State } from './core';

const roots = ['消息', '帖子', '评论'] as const;
const record = (value: unknown): value is Record<string, any> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Only creation payloads may echo these readonly facts; finalizePhone derives their actual values. */
export function normalizePhoneRecordPatches(before: State, commands: readonly any[]): any[] {
  const visit = (value: unknown, path: string[]) => {
    if (!record(value)) return;
    if (path.length === 4 && path[0] === '手机' && path[1] === '原文' &&
        roots.includes(path[2] as typeof roots[number]) &&
        !Object.hasOwn(before.手机.原文[path[2] as typeof roots[number]], path[3])) {
      delete value._顺序;
      if (path[2] === '消息') {
        delete value._发送状态;
        delete value._已投递账号id;
      }
      return;
    }
    // Ancestor replacements still pass the original history and private-field guards.
    if (path.length < 4)
      for (const [key, child] of Object.entries(value)) visit(child, [...path, key]);
  };
  return commands.map(command => {
    if (!record(command) || Object.hasOwn(command, 'from') ||
        !['add', 'replace', 'insert'].includes(command.op) || typeof command.path !== 'string') return command;
    const result = copy(command);
    const parts = result.path === '' ? [] : result.path.startsWith('/')
      ? result.path.slice(1).split('/').map((part: string) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
      : null;
    if (parts) visit(result.value, parts);
    return result;
  });
}
