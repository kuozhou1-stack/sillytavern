import { protocolJson, updateBlock } from './message-protocol';

export type VariableReplyFormat = 'structured' | 'structured-v2';

const scalarTypes = [z.string(), z.number(), z.boolean(), z.null()] as const;
const token = z.union([...scalarTypes, z.strictObject({ container: z.enum(['object', 'array', 'end']) })]);
const value = z.union([...scalarTypes, z.array(token)]);
const path = z.string();
const operation = z.union([
  z.strictObject({ delta: path, value: z.number() }),
  z.strictObject({ replace: path, value }),
  z.strictObject({ insert: path, value }),
  z.strictObject({ add: path, value }),
  z.strictObject({ remove: path }),
  z.strictObject({ move: path, to: path }),
]);
const response = z.strictObject({ JSONPatch: z.array(operation) });

/** Transport constraint only; Tavern still assembles every preset message. */
export const variableResponseSchema: JsonSchema = {
  name: 'variable_update',
  description: 'Settle the supplied completed narrative and authorized tasks; return variable patches, never continue the story.',
  strict: true,
  value: {
    type: 'object',
    properties: {
      JSONPatch: {
        type: 'string',
        description: 'A JSON-serialized array of MVU patch operations based only on the supplied completed facts. No XML, story or explanation.',
      },
    },
    required: ['JSONPatch'],
    additionalProperties: false,
  },
};

type Scalar = string | number | boolean | null;
type JsonValue = Scalar | JsonValue[] | { [key: string]: JsonValue };
type Container = Exclude<JsonValue, Scalar>;

function decodeValue(input: z.infer<typeof value>, index: number): JsonValue {
  if (!Array.isArray(input)) return input;
  const invalid = (reason: string) => Error(`第 ${index + 1} 条补丁的复合值无效：${reason}`);
  const stack: { data: Container; key?: string }[] = [];
  let root: Container | undefined;
  for (const item of input) {
    const frame = stack.at(-1);
    const marker = item !== null && typeof item === 'object' ? item.container : undefined;
    if (marker === 'end') {
      if (!frame || frame.key !== undefined) throw invalid('容器结束位置错误或键缺少值');
      stack.pop();
      continue;
    }
    if (frame && !Array.isArray(frame.data) && frame.key === undefined) {
      if (typeof item !== 'string') throw invalid('对象成员缺少字符串键');
      if (Object.hasOwn(frame.data, item)) throw invalid('对象键重复');
      frame.key = item;
      continue;
    }
    let node: JsonValue;
    if (item !== null && typeof item === 'object') {
      // A null-prototype dictionary preserves literal keys such as "__proto__".
      node = item.container === 'array' ? [] : Object.create(null);
      stack.push({ data: node as Container });
    } else {
      if (!frame) throw invalid('根必须是一个对象或数组');
      node = item;
    }
    if (!frame) {
      if (root !== undefined) throw invalid('存在多个根容器');
      root = node as Container;
    } else if (Array.isArray(frame.data)) {
      frame.data.push(node);
    } else {
      frame.data[frame.key!] = node;
      delete frame.key;
    }
  }
  if (!root || stack.length) throw invalid('缺少根容器或结束标记');
  return root;
}

function decodeOperation(wire: z.infer<typeof operation>, index: number) {
  if ('move' in wire) return { op: 'move', from: wire.move, to: wire.to };
  if ('remove' in wire) return { op: 'remove', path: wire.remove };
  if ('delta' in wire) return { op: 'delta', path: wire.delta, value: wire.value };
  const decoded = decodeValue(wire.value, index);
  if ('insert' in wire) return { op: 'insert', path: wire.insert, value: decoded };
  if ('add' in wire) return { op: 'add', path: wire.add, value: decoded };
  return { op: 'replace', path: wire.replace, value: decoded };
}

export class PatchArraySyntaxError extends SyntaxError {
  readonly location?: { line: number; column: number };

  constructor(error: SyntaxError) {
    super(error.message, { cause: error });
    const location = /\(line (\d+) column (\d+)\)$/.exec(error.message);
    if (location) this.location = { line: Number(location[1]), column: Number(location[2]) };
  }
}

export function variableResponseBlock(text: string, format: VariableReplyFormat = 'structured') {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw Error('变量接口未返回约定的JSON补丁；原始回复已保留，变量未提交。请检查接口是否支持结构化输出。', { cause: error });
  }
  if (format === 'structured') {
    const legacy = z.strictObject({ JSONPatch: z.string() }).parse(data);
    let commands: unknown;
    try {
      commands = JSON.parse(legacy.JSONPatch);
    } catch (error) {
      if (error instanceof SyntaxError) throw new PatchArraySyntaxError(error);
      throw error;
    }
    return updateBlock(protocolJson(z.array(z.unknown()).parse(commands))).block;
  }
  if (format !== 'structured-v2') throw Error('未知的变量回复格式：' + format);
  const parsed = response.safeParse(data);
  if (!parsed.success) {
    const [, index] = parsed.error.issues[0].path;
    const message = typeof index === 'number'
      ? `第 ${index + 1} 条补丁的字段或类型不符合协议，请核对操作名、必填值和多余字段。`
      : '变量回复应为只含 JSONPatch 数组的 JSON 对象。';
    throw Error(message, { cause: parsed.error });
  }
  const commands = parsed.data.JSONPatch.map(decodeOperation);
  return updateBlock(protocolJson(commands)).block;
}
