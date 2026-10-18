// Only standalone advice is auxiliary. Never strip arbitrary story/protocol text.
const adviceBlock = /(?:^|(?:\r?\n){1,2})<advice>([\s\S]*?)<\/advice>(?=\r?\n|$)/;
const adviceWithSpacing = /(?:^|(?:\r?\n){1,2})<advice>[\s\S]*?<\/advice>(?:\r?\n){0,2}/g;
const withoutAdvice = (text: string) => text.replace(adviceWithSpacing, '\n\n').replace(/^(?:\r?\n){1,2}/, '').trimEnd();

export const MessageSourceSchema = z.array(z.object({
  id: z.number(), role: z.enum(['system', 'user', 'assistant']), swipe: z.number(), text: z.string(),
  // text owns the request input; archive/candidate retain the two saved observations.
  archive: z.string().optional(), candidate: z.string().optional(), advice: z.boolean().optional(),
}));
export type MessageSource = z.infer<typeof MessageSourceSchema>;

export function messageSource(): MessageSource {
  const range = `0-${getLastMessageId()}`;
  // No await between the reads: include_swipes omits message in the actual helper API.
  const messages = getChatMessages(range);
  const candidates = getChatMessages(range, { include_swipes: true });
  const sources: MessageSource = messages.map((m, index) => ({
    id: m.message_id, role: m.role, swipe: candidates[index].swipe_id,
    text: m.message, archive: m.message, candidate: candidates[index].swipes[candidates[index].swipe_id],
  }));
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index], source = sources[index];
    const receipt = message.extra?.izumi_advice ?? message.extra?.extra?.izumi_advice;
    const assistant = sources[index - 1];
    // A verified transfer receipt, its replacement and its adjacent assistant block
    // must agree. A preset name or the placeholder sentence alone proves nothing.
    if (source.role !== 'user' || !receipt || receipt.version !== 1 ||
      !Number.isInteger(receipt.revision) || receipt.revision < 1 ||
      typeof receipt.text !== 'string' || typeof receipt.replacementText !== 'string' ||
      source.archive !== receipt.replacementText || assistant?.role !== 'assistant' ||
      assistant.id !== receipt.assistantId ||
      ![...assistant.text.matchAll(new RegExp(adviceBlock.source, 'g'))].some(match => match[1] === receipt.text)) continue;
    source.text = receipt.text;
    if (source.candidate === receipt.replacementText) source.candidate = receipt.text;
    assistant.advice = true;
  }
  return sources;
}
export function assertMessageSource(source: MessageSource | undefined, replyFloor?: number, prefixOnly = false) {
  if (!source) throw Error('旧请求缺少源消息快照，请取消后重新发送');
  const actual = messageSource().filter(m => m.id !== replyFloor && (!prefixOnly || m.id <= (source.at(-1)?.id ?? -1)));
  if (
    source.length !== actual.length ||
    source.some((before, index) => {
      const after = actual[index];
      if (before.id !== after.id || before.role !== after.role || before.swipe !== after.swipe) return true;
      const same = (a: string, b: string) => a === b || (before.role === 'assistant' &&
        ((before.advice || after.advice) || (adviceBlock.test(a) && adviceBlock.test(b))) &&
        withoutAdvice(a) === withoutAdvice(b));
      if (!same(before.text, after.text)) return true;
      // An unchanged stale candidate does not replace message. Synchronization to
      // message is harmless; any other candidate edit invalidates the request.
      return before.candidate !== undefined && after.candidate !== undefined &&
        !same(before.candidate, after.candidate) && !same(after.candidate, after.text);
    })
  )
    throw Error('请求源消息已编辑、删除或增加，本次结果失效');
}
