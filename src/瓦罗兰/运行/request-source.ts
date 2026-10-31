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
  // The helper clones variables/data with every full-message read. Observe only
  // native identity/text here, synchronously, preserving mes/swipe ownership.
  const receipts: any[] = [];
  const sources: MessageSource = SillyTavern.chat.map((message, id) => {
    const swipe = message.swipe_id ?? 0;
    const swipes = message.swipes ?? [message.mes];
    const extra = message.swipe_info ? message.swipe_info[swipe] : message.extra;
    receipts.push(extra?.izumi_advice ?? extra?.extra?.izumi_advice);
    return {
      // Match the helper's native role mapping, including its legacy narrator cast.
      id, role: (message.extra?.type === 'narrator' ? message.is_user ? 'unknown' : 'system'
        : message.is_user ? 'user' : 'assistant') as MessageSource[number]['role'],
      swipe, text: message.mes ?? '', archive: message.mes ?? '',
      candidate: swipe >= 0 && swipe < swipes.length ? swipes[swipe] ?? '' : undefined,
    };
  });
  for (let index = 0; index < sources.length; index++) {
    const source = sources[index], receipt = receipts[index];
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
