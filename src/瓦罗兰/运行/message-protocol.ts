import { remark } from 'remark';
import { jsonrepair } from 'jsonrepair';

/** Remove selected update spans without consuming intervening story or literal examples. */
export function stripProtocol(text: string, preservePlaceholder = false, stripInvalidUpdate = false) {
  const withoutPlaceholder = preservePlaceholder
    ? text
    : (() => {
        let fence = '';
        return text.split(/(\r?\n)/).map(part => {
          if (/^\r?\n$/.test(part)) return part;
          const opening = part.match(/^\s*(`{3,}|~{3,})/);
          if (opening) {
            if (!fence) fence = opening[1][0];
            else if (fence === opening[1][0]) fence = '';
          }
          return !fence && /^\s*<StatusPlaceHolderImpl\s*\/>\s*$/i.test(part) ? '' : part;
        }).join('');
      })();
  const updates = updateSpans(withoutPlaceholder);
  let narrative = '', cursor = 0;
  for (const update of updates) {
    if (!stripInvalidUpdate) {
      if (!update.closed) continue;
      try { updateBlock(withoutPlaceholder.slice(update.start, update.end)); }
      catch { continue; } // Keep malformed text visible; the variable channel reports the parse error.
    }
    narrative = (narrative + withoutPlaceholder.slice(cursor, update.start)).trimEnd();
    cursor = update.end;
  }
  // Leading indentation can make a protocol example Markdown code on the next projection.
  const result = (narrative + withoutPlaceholder.slice(cursor)).replace(/^(?:[ \t]*\r?\n)+/, '').trimEnd();
  // A preset wrapping only a variable response does not create a narrative by itself.
  if (cursor) {
    let content = result, wrapper: RegExpMatchArray | null;
    while ((wrapper = content.match(/^<([\w:.-]+)(?:\s[^<>]*)?>\s*([\s\S]*?)\s*<\/\1\s*>$/)))
      content = wrapper[2].trim();
    if (!content) return '';
  }
  return result;
}
/** Persist the completed story without removing display markers used by Tavern regexes. */
export function storedNarrative(text: string, stripInvalidUpdate = false) {
  return stripProtocol(text, true, stripInvalidUpdate);
}
/** Preserve JSON values while keeping literal tags out of MVU's tagged transport. */
export const protocolJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

/** Locate complete thought spans; incomplete auxiliary markup is not an extra rejection rule. */
export function completeThoughtEnds(text: string, codeEnds = markdownCodeEnds(text)) {
  const tags: RegExpExecArray[] = [];
  const pattern = /<(\/?)(thinking|think|reasoning|analysis|JSONPatch|UpdateVariable)\b[^<>]*>/iy;
  const quoted = /"(?:\\[\s\S]|[^"\\])*"/y;
  let inPatch = false;
  for (let i = 0; i < text.length;) {
    if (!inPatch) {
      const end = codeEnds.get(i) ?? codeEnd(text, i) ?? quotedMarkupEnd(text, i);
      if (end !== undefined) { i = end; continue; }
      if (text[i] === '\\' && /[`\\]/.test(text[i + 1] ?? '')) { i += 2; continue; }
    } else if (text[i] === '"') {
      quoted.lastIndex = i;
      if (quoted.exec(text)) { i = quoted.lastIndex; continue; }
    }
    pattern.lastIndex = i;
    const tag = pattern.exec(text);
    if (tag) {
      const name = tag[2].toLowerCase();
      if (name === 'jsonpatch') inPatch = !tag[1];
      else if (name === 'updatevariable') { if (tag[1]) inPatch = false; }
      else tags.push(tag);
      i = pattern.lastIndex;
    }
    else i++;
  }
  const ends = new Map<number, number>(), nextClose = new Map<string, number>();
  // Preserve the old same-name closing interpretation, including literal nested examples.
  for (let i = tags.length - 1; i >= 0; i--) {
    const tag = tags[i], name = tag[2].toLowerCase();
    if (tag[1]) nextClose.set(name, tag.index + tag[0].length);
    else if (nextClose.has(name)) ends.set(tag.index, nextClose.get(name)!);
  }
  // Prefer the full balanced span when the producer emits actual nested thought blocks.
  const stack: { name: string; start: number }[] = [];
  for (const tag of tags) {
    const name = tag[2].toLowerCase();
    if (!tag[1]) stack.push({ name, start: tag.index });
    else {
      const opening = stack.pop();
      if (opening?.name === name) ends.set(opening.start, tag.index + tag[0].length);
      else stack.length = 0;
    }
  }
  return ends;
}

const unwrapJson = (text: string) => text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1');

/** Prose quotes end on the same line. JSON strings inside a quoted example belong to its patch. */
function quotedMarkupEnd(text: string, start: number): number | undefined {
  const opening = text[start];
  if (opening !== '"' && opening !== '“') return;
  if (opening === '"' && /\d/.test(text[start - 1] ?? '')) return;
  const closing = opening === '“' ? '”' : '"';
  const tokens = /<JSONPatch\b[^<>\r\n]*>[ \t]*(?=\[)(?:"(?:\\[^\r\n]|[^"\\\r\n])*"|[^"<\r\n])*<\/JSONPatch[ \t]*>|\\[^\r\n]|["”\r\n]/gi;
  tokens.lastIndex = start + 1;
  for (let token = tokens.exec(text); token; token = tokens.exec(text)) {
    if (token[0] === closing) return tokens.lastIndex;
    if (token[0] === '\r' || token[0] === '\n') return;
  }
  return;
}

/** Raw XML wrappers are HTML nodes in Markdown; scan their literal code boundaries too.
 * CommonMark fences close with the same marker and at least the opening length.
 * Code spans close with an exactly matching backtick run, including across lines.
 */
function codeEnd(text: string, start: number): number | undefined {
  if (start === 0 || text[start - 1] === '\n') {
    const quote = / {0,3}>[^\r\n]*/y;
    quote.lastIndex = start;
    if (quote.exec(text)) return quote.lastIndex;
    const fence = /^( {0,3})(`{3,}|~{3,})([^\r\n]*)(?:\r?\n|$)/.exec(text.slice(start));
    if (fence && (fence[2][0] !== '`' || !fence[3].includes('`'))) {
      const closing = new RegExp('^ {0,3}' + fence[2][0] + '{' + fence[2].length + ',}[ \t]*(?:\\r?\\n|$)', 'gm');
      closing.lastIndex = start + fence[0].length;
      const match = closing.exec(text);
      return match ? match.index + match[0].length : text.length;
    }
  }
  if (text[start] !== '`') return;
  const ticks = /^`+/.exec(text.slice(start))![0];
  const runs = /`+/g;
  runs.lastIndex = start + ticks.length;
  for (let next = runs.exec(text); next; next = runs.exec(text)) {
    if (next[0].length === ticks.length) return runs.lastIndex;
  }
  // An unmatched backtick run is literal text; consume the run as a unit.
  return start + ticks.length;
}

/** Markdown examples include entire block quotes, indented code and nested fences. */
function markdownCodeEnds(text: string) {
  const ends = new Map<number, number>();
  type MarkdownNode = { type: string; position?: { start: { offset?: number }; end: { offset?: number } }; children?: MarkdownNode[] };
  const visit = (node: MarkdownNode) => {
    if (node.type === 'code' || node.type === 'inlineCode' || node.type === 'blockquote') {
      const start = node.position?.start.offset, end = node.position?.end.offset;
      if (start !== undefined && end !== undefined) ends.set(start, end);
    } else node.children?.forEach(visit);
  };
  visit(remark().parse(text));
  return ends;
}

type ProtocolToken = { name: string; closing: boolean; start: number; end: number };
/** One lexical selection shared by narrative stripping and command extraction. */
function protocolTokens(text: string, skipThoughts = true): ProtocolToken[] {
  const codeEnds = markdownCodeEnds(text);
  const tokens: ProtocolToken[] = [], thoughtEnds = completeThoughtEnds(text, codeEnds);
  const tagPattern = /<(\/?)(UpdateVariable|JSONPatch|Analysis|thinking|think|reasoning)\b[^<>]*>/iy;
  const quoted = /"(?:\\[\s\S]|[^"\\])*"/y;
  let inPatch = false;
  for (let i = 0; i < text.length;) {
    if (!inPatch) {
      const end = codeEnds.get(i) ?? codeEnd(text, i) ?? quotedMarkupEnd(text, i);
      if (end !== undefined) { i = end; continue; }
      if (text[i] === '\\' && /[`\\]/.test(text[i + 1] ?? '')) { i += 2; continue; }
      if (skipThoughts && thoughtEnds.has(i)) { i = thoughtEnds.get(i)!; continue; }
    }
    // Quotes inside JSONPatch are opaque, even when their values look like tags or Markdown.
    if (inPatch && text[i] === '"') {
      quoted.lastIndex = i;
      if (quoted.exec(text)) { i = quoted.lastIndex; continue; }
    }
    tagPattern.lastIndex = i;
    const tag = tagPattern.exec(text);
    if (!tag) { i++; continue; }
    const name = tag[2].toLowerCase(), closing = !!tag[1], end = tagPattern.lastIndex;
    tokens.push({ name, closing, start: i, end });
    if (name === 'jsonpatch') inPatch = !closing;
    else if (name === 'updatevariable' && closing) inPatch = false;
    i = end;
  }
  return tokens;
}

function updateSpans(text: string) {
  const spans: { start: number; end: number; closed: boolean }[] = [];
  let start: number | undefined;
  for (const token of protocolTokens(text)) {
    if (token.name !== 'updatevariable') continue;
    if (!token.closing) {
      if (start !== undefined) spans.push({ start, end: token.start, closed: false });
      start = token.start;
    } else if (start !== undefined) {
      spans.push({ start, end: token.end, closed: true });
      start = undefined;
    }
  }
  if (start !== undefined) spans.push({ start, end: text.length, closed: false });
  return spans;
}

/** The dedicated variable channel also accepts bare JSON and preset thought wrappers. */
function readPatchCommands(text: string, skipThoughts = true, allowThoughtFallback = true): unknown[] {
  const sections: unknown[][] = [];
  let contentStart: number | undefined;
  const parse = (json: string) => {
    const source = unwrapJson(json);
    let commands: unknown;
    try {
      commands = JSON.parse(source);
    } catch (error) {
      let repaired: string;
      try { repaired = jsonrepair(source).trimEnd(); }
      catch { throw error; } // Keep the original JSON location for the existing edit/retry flow.
      const suffix = source.slice(repaired.length);
      // Accept removal of redundant closing brackets after a complete value.
      // Repairs within values or truncated output require the existing message editor.
      if (!source.startsWith(repaired) || !/^[\t\n\r ]*[}\]][}\]\t\n\r ]*$/.test(suffix)) throw error;
      commands = JSON.parse(repaired);
      console.info('[瓦洛兰变量解析] 已移除JSON末尾多余闭括号', { position: repaired.length, removed: suffix });
    }
    if (!Array.isArray(commands)) throw Error('变量更新需要JSONPatch数组');
    return commands;
  };
  let json = unwrapJson(text);
  let outer: RegExpMatchArray | null;
  while ((outer = json.match(/^<([\w:.-]+)\b[^>]*>\s*([\s\S]*?)\s*<\/\1\s*>$/i)) &&
         !/^(UpdateVariable|JSONPatch)$/i.test(outer[1])) json = outer[2].trim();
  // Bare JSON is data, including any protocol-looking text inside its string values.
  if (/^[{["]/.test(json)) return parse(json);
  for (const token of protocolTokens(text, skipThoughts)) {
    if (contentStart !== undefined &&
        ((token.name === 'jsonpatch' && !token.closing) || (token.name === 'updatevariable' && token.closing))) {
      if (text.slice(contentStart, token.start).trim()) throw Error('JSONPatch 变量补丁未结束，请补齐闭合标签后重试');
      contentStart = undefined;
    }
    if (token.name !== 'jsonpatch') continue;
    if (!token.closing) contentStart = token.end;
    else if (contentStart !== undefined) {
      const content = text.slice(contentStart, token.start);
      if (content.trim()) sections.push(parse(content));
      contentStart = undefined;
    }
  }
  if (contentStart !== undefined && text.slice(contentStart).trim())
    throw Error('JSONPatch 变量补丁未结束，请补齐闭合标签后重试');
  if (sections.length) return sections.flat();
  if (skipThoughts && allowThoughtFallback) return readPatchCommands(text, false);
  while ((outer = json.match(/^<([\w:.-]+)\b[^>]*>\s*([\s\S]*?)\s*<\/\1\s*>$/i))) {
    if (!allowThoughtFallback && /^(?:thinking|think|reasoning|analysis)$/i.test(outer[1]))
      throw Error('同次回复缺少正式 JSONPatch 变量数据，请编辑本楼补齐变量块后重试');
    json = outer[2].trim();
  }
  return parse(json);
}

export function updateBlock(text: string, fromStory = false) {
  let commands: unknown[];
  if (fromStory) {
    const spans = updateSpans(text);
    if (!spans.length)
      throw Error('同次回复缺少 UpdateVariable 变量块，请编辑本楼补齐变量块后重试，或重新生成本楼');
    if (spans.some(span => !span.closed))
      throw Error('同次回复的 UpdateVariable 变量块未结束，请编辑本楼补齐后重试，或重新生成本楼');
    commands = spans.flatMap(span => readPatchCommands(text.slice(span.start, span.end), true, false));
  } else {
    const payload = text.trim().replace(/^(`{3,}|~{3,})[^\r\n]*\r?\n([\s\S]*?)\r?\n\1\s*$/, '$2');
    commands = readPatchCommands(payload);
  }
  return { block: `<UpdateVariable><JSONPatch>${protocolJson(commands)}</JSONPatch></UpdateVariable>`, commands };
}
export function completedMessage(narrative: string, update: string) {
  return `${stripProtocol(narrative)}\n\n${updateBlock(update).block}`;
}
