// Only standalone advice is auxiliary. Never strip arbitrary story/protocol text.
const adviceBlock = /(?:^|(?:\r?\n){1,2})<advice>([\s\S]*?)<\/advice>(?=\r?\n|$)/;
const adviceWithSpacing = /(?:^|(?:\r?\n){1,2})<advice>[\s\S]*?<\/advice>(?:\r?\n){0,2}/g;
const withoutAdvice = (text: string) => text.replace(adviceWithSpacing, '\n\n').replace(/^(?:\r?\n){1,2}/, '').trimEnd();

function floorTextLayout(text: string, id: number) {
  const marker = `（第${id}楼）`;
  for (const eol of ['\r\n', '\n']) {
    if (text.startsWith(marker + eol)) return { head: marker + eol, body: text.slice(marker.length + eol.length), foot: '' };
    if (text.endsWith(eol + marker)) return { head: '', body: text.slice(0, -(eol.length + marker.length)), foot: eol + marker };
  }
  return { head: '', body: text, foot: '' };
}

// Izumi's formatter inserts this marker after the last balanced planning block.
// Recover possible pre-format texts even when it supplied a missing line break.
function* planningFloorTextVariants(text: string, marker: string): Generator<string> {
  if (!text.toLowerCase().includes('</konatan_planning')) return;
  let depth = 0, end = 0;
  for (const tag of text.matchAll(/<\/?konatan_planning(?:~[^<>]*|\s*)>/gi)) {
    if (tag[0][1] !== '/') depth++;
    else {
      if (!depth) return;
      if (--depth === 0) end = tag.index + tag[0].length;
    }
  }
  if (!end || depth || /<\/?konatan_planning(?:~[^<>]*|\s*)$/i.test(text)) return;
  const prefix = text.slice(0, end), tail = text.slice(end);
  const newline = /\r\n|\n|\r/;
  const eol = tail.match(/^(?:\r\n|\n|\r)/)?.[0];
  const separator = eol ?? text.match(newline)?.[0] ?? '\n';
  const floorLine = separator + marker;
  const line = new RegExp(`(?:^|\\r\\n|\\n|\\r)${marker}(?=\\r\\n|\\n|\\r|$)`);
  if (eol && (tail === floorLine || tail.startsWith(floorLine + separator))) {
    const body = tail.slice(floorLine.length + separator.length);
    if (line.test(prefix) || line.test(body)) return;
    if (!body && tail !== floorLine) return;
    yield prefix + separator + body;
    if (!/^[\r\n]/.test(body)) {
      const joined = prefix + body;
      if ((joined.match(newline)?.[0] ?? '\n') === separator) yield joined;
    }
  } else if (!line.test(text)) {
    const body = eol ? tail.slice(eol.length) : tail;
    yield prefix + floorLine + (body ? separator + body : '');
  }
}

// An observed footer may move to the head. Removing a footer alone has not
// been observed. Keep those two forms distinct when checking old reply hashes.
export function* assistantFloorTextVariants(text: string, id: number): Generator<string> {
  const marker = `（第${id}楼）`;
  yield* planningFloorTextVariants(text, marker);
  const { head, body, foot } = floorTextLayout(text, id);
  if (new RegExp(`^${marker}(?=\\r?$)`, 'm').test(body)) return;
  if (head) {
    yield body;
    yield body + head.slice(marker.length) + marker;
  } else if (foot) {
    yield marker + foot.slice(0, -marker.length) + body;
  } else {
    yield marker + '\n' + body;
    yield marker + '\r\n' + body;
  }
}

export function sameAssistantFloorText(before: string, after: string, id: number): boolean {
  if (before === after) return true;
  for (const variant of assistantFloorTextVariants(before, id)) {
    if (variant === after) return true;
  }
  return false;
}

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
export class MessageSourceError extends Error {}

function sourceDifference(before: MessageSource[number], after: MessageSource[number]): string {
  if (before.id !== after.id) return `原第${before.id}楼的位置变为第${after.id}楼`;
  const floor = `第${before.id}楼`;
  if (before.role !== after.role) return floor + '的发言身份已变化';
  if (before.swipe !== after.swipe) return `${floor}切换了候选（${before.swipe + 1} → ${after.swipe + 1}）`;
  const same = (a: string, b: string) => {
    if (a === b || before.role !== 'assistant') return a === b;
    if (sameAssistantFloorText(a, b, before.id)) return true;
    const hasAdvice = before.advice || after.advice || (adviceBlock.test(a) && adviceBlock.test(b));
    if (!hasAdvice || (!adviceBlock.test(a) && !adviceBlock.test(b))) return false;
    // Move the advice block in the complete archived text. Treating the first
    // blank line after a floor marker as leading whitespace changes paragraph breaks.
    const left = withoutAdvice(a);
    const right = withoutAdvice(b);
    if (sameAssistantFloorText(left, right, before.id)) return true;
    // Advice can be transferred before or after numbering. Check the same
    // standalone block after applying a permitted marker change to one archive.
    const matchesAt = (from: string, normalized: string) => {
      for (const variant of assistantFloorTextVariants(from, before.id)) {
        if (withoutAdvice(variant) === normalized) return true;
      }
      return false;
    };
    return matchesAt(a, right) || matchesAt(b, left);
  };
  if (!same(before.text, after.text)) return floor + '的原文已变化';
  // A stale candidate can synchronize to the archived message without replacing it.
  if (before.candidate !== undefined && after.candidate !== undefined &&
    !same(before.candidate, after.candidate) && !same(after.candidate, after.text)) return floor + '的选中候选文本已变化';
  return '';
}

export function assertMessageSource(source: MessageSource | undefined, replyFloor?: number, prefixOnly = false) {
  if (!source) throw new MessageSourceError('旧请求缺少源消息快照，请取消后重新发送');
  const actual = messageSource().filter(m => m.id !== replyFloor && (!prefixOnly || m.id <= (source.at(-1)?.id ?? -1)));
  const count = Math.min(source.length, actual.length);
  const countChange = actual.length > source.length ? '源楼层增加，' : actual.length < source.length ? '源楼层减少，' : '';
  for (let i = 0; i < count; i++) {
    const reason = sourceDifference(source[i], actual[i]);
    if (reason) throw new MessageSourceError('请求源消息已变化：' + countChange + reason);
  }
  if (count < source.length) throw new MessageSourceError(`请求源消息已变化：第${source[count].id}楼已缺失`);
  if (count < actual.length) throw new MessageSourceError(`请求源消息已变化：新增了第${actual[count].id}楼`);
}
