import { Schema } from '../schema';
import type { $ZodType as ZodType } from 'zod/v4/core';

// Record keys are data IDs; underscore ownership applies to object fields.
// Resolve from the maintained schema so existing IDs need no renaming.
const unwrapped = new WeakMap<ZodType, ZodType>();
function shape(schema?: ZodType): ZodType | undefined {
  if (!schema) return;
  const cached = unwrapped.get(schema);
  if (cached) return cached;
  let result = schema;
  while (true) {
    if (result instanceof z.ZodOptional || result instanceof z.ZodNullable ||
      result instanceof z.ZodDefault || result instanceof z.ZodPrefault) result = result.unwrap();
    else if (result instanceof z.ZodPipe) result = result.in;
    else break;
  }
  unwrapped.set(schema, result);
  return result;
}
function child(schema: ZodType | undefined, key: string): ZodType | undefined {
  const node = shape(schema);
  if (node instanceof z.ZodRecord) return node.valueType;
  if (node instanceof z.ZodArray) return node.element;
  if (node instanceof z.ZodObject) return node.shape[key];
  if (node instanceof z.ZodIntersection) return child(node.def.left, key) ?? child(node.def.right, key);
  if (node instanceof z.ZodUnion) {
    for (const option of node.options) {
      const found = child(option, key);
      if (found) return found;
    }
  }
  return undefined;
}
const privateField = (schema: ZodType | undefined, key: string) =>
  key.startsWith('_') && !(shape(schema) instanceof z.ZodRecord);
const scopeAt = (path: readonly string[]) => path.reduce<ZodType | undefined>(child, Schema);
export const modelPathParts = (path: string) => path === '' ? [] :
  path.slice(1).split('/').map(key => key.replaceAll('~1', '/').replaceAll('~0', '~'));

export function isPrivateModelPath(path: readonly string[]) {
  let scope: ZodType | undefined = Schema;
  for (const key of path) {
    if (privateField(scope, key)) return true;
    scope = child(scope, key);
  }
  return false;
}
export function privateModelPaths(value: any, base = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const visit = (node: any, prefix: string, scope?: ZodType) => {
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      const path = `${prefix}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`;
      if (privateField(scope, key)) result[path] = value;
      else visit(value, path, child(scope, key));
    }
  };
  visit(value, base, scopeAt(modelPathParts(base)));
  return result;
}
export function publicModelFields(value: any, path: readonly string[] = [], keep?: ReadonlySet<string>): any {
  const visit = (node: any, scope?: ZodType): any => Array.isArray(node)
    ? node.map((value, index) => visit(value, child(scope, String(index))))
    : node && typeof node === 'object'
      ? Object.fromEntries(Object.entries(node).filter(([key]) => !privateField(scope, key) || keep?.has(key))
        .map(([key, value]) => [key, visit(value, child(scope, key))]))
      : node;
  return visit(value, scopeAt(path));
}
