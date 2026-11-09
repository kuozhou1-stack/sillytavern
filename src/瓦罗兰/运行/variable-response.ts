import { protocolJson, updateBlock } from './message-protocol';

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
        description: 'A JSON-serialized array of MVU patch operations based only on the supplied completed facts. No XML, story or explanation. Use "[]" when nothing changes.',
      },
    },
    required: ['JSONPatch'],
    additionalProperties: false,
  },
};

/** Decode the network envelope before the existing MVU parse/validate/commit. */
export function variableResponseBlock(text: string) {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw Error('变量接口未返回约定的JSON补丁；原始回复已保留，变量未提交。请检查接口是否支持结构化输出。', { cause: error });
  }
  const reply = z.object({ JSONPatch: z.string() }).strict().parse(data);
  const commands = z.array(z.unknown()).parse(JSON.parse(reply.JSONPatch));
  return updateBlock(protocolJson(commands)).block;
}
