/** Remove a terminal update while preserving narrative markup and literal code examples. */
export function stripProtocol(text: string, preservePlaceholder = false) {
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
  const openings = [...withoutPlaceholder.matchAll(/<UpdateVariable\b[^>]*>/gi)];
  for (const opening of openings.reverse()) {
    const tail = withoutPlaceholder.slice(opening.index);
    const before = withoutPlaceholder.slice(0, opening.index);
    const line = before.slice(before.lastIndexOf('\n') + 1);
    // A quoted tag or fenced code sample stays in the story.
    if ((line.match(/(?<!\\)`/g) ?? []).length % 2) continue;
    const fences = before.match(/^\s*(`{3,}|~{3,})/gm) ?? [];
    if (fences.length % 2) continue;
    try {
      const terminal = tail.match(/^<UpdateVariable\b[^>]*>[\s\S]*<\/UpdateVariable\s*>/i);
      if (!terminal) continue;
      updateBlock(terminal[0]);
      // A preset may close its surrounding tags after the update block.
      const after = tail.slice(terminal[0].length);
      if (!/^(?:\s|<\/[\w:.-]+\s*>)*$/.test(after)) continue;
      const narrative = (before.trimEnd() + after).trim();
      const openings = [...before.trim().matchAll(/<([\w:.-]+)(?:\s[^<>]*)?>/g)];
      const closings = [...after.trim().matchAll(/<\/([\w:.-]+)\s*>/g)];
      if (openings.length && before.trim() === openings.map(tag => tag[0]).join('') &&
          openings.length === closings.length &&
          openings.every((tag, index) => tag[1].toLowerCase() === closings.at(-index - 1)![1].toLowerCase())) return '';
      return narrative;
    } catch {
      // Malformed updates remain visible text; the variable channel reports its actual parse error.
    }
  }
  return withoutPlaceholder.trim();
}
/** Persist the completed story without removing display markers used by Tavern regexes. */
export function storedNarrative(text: string) {
  return stripProtocol(text, true);
}
/** Preserve JSON values while keeping literal tags out of MVU's tagged transport. */
export const protocolJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

/** Locate complete thought spans; incomplete auxiliary markup is not an extra rejection rule. */
function completeThoughtEnds(text: string) {
  const tags = [...text.matchAll(/<(\/?)(thinking|think|reasoning)\b[^<>]*>/gi)];
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

/** Read the actual update data; preset wrappers and the number of sections are not admission rules. */
function readPatchCommands(text: string, skipThoughts = true): unknown[] {
  const sections: unknown[][] = [], thoughtEnds = completeThoughtEnds(text);
  const tagPattern = /<(\/?)(JSONPatch|Analysis|thinking|think|reasoning)\b[^<>]*>/iy;
  const quoted = /"(?:\\[\s\S]|[^"\\])*"/y;
  let contentStart: number | undefined;
  const parse = (json: string) => {
    const commands: unknown = JSON.parse(unwrapJson(json));
    if (!Array.isArray(commands)) throw Error('变量更新需要JSONPatch数组');
    return commands;
  };
  for (let i = 0; i < text.length;) {
    // JSON string tokens are opaque: escaped quotes/backslashes and XML-looking values stay data.
    if (text[i] === '"') {
      quoted.lastIndex = i;
      if (quoted.exec(text)) { i = quoted.lastIndex; continue; }
    }
    tagPattern.lastIndex = i;
    const tag = tagPattern.exec(text);
    if (!tag) { i++; continue; }
    const end = tagPattern.lastIndex, name = tag[2].toLowerCase(), closing = !!tag[1];
    const thought = ['thinking', 'think', 'reasoning'].includes(name);
    // Complete nested thought sections may sit inside a preset wrapper or after its prose.
    if (skipThoughts && contentStart === undefined && thought && !closing && thoughtEnds.has(i)) { i = thoughtEnds.get(i)!; continue; }
    if (skipThoughts && contentStart === undefined && name === 'analysis' && !closing) {
      const close = /<\/Analysis\s*>/i.exec(text.slice(end));
      if (close) { i = end + close.index + close[0].length; continue; }
    }
    if (name === 'jsonpatch') {
      if (!closing) contentStart = end;
      else if (contentStart !== undefined) {
        const content = text.slice(contentStart, i);
        if (content.trim()) sections.push(parse(content));
        contentStart = undefined;
      }
    }
    i = end;
  }
  if (sections.length) return sections.flat();
  // A preset can put the entire answer inside a thought wrapper. Prefer outside
  // data when present, otherwise read that answer instead of requiring a location.
  if (skipThoughts) return readPatchCommands(text, false);
  let json = unwrapJson(text);
  let outer: RegExpMatchArray | null;
  while ((outer = json.match(/^<([\w:.-]+)\b[^>]*>\s*([\s\S]*?)\s*<\/\1\s*>$/i))) json = outer[2].trim();
  return parse(json);
}

export function updateBlock(text: string) {
  const commands = readPatchCommands(text);
  return { block: `<UpdateVariable><JSONPatch>${protocolJson(commands)}</JSONPatch></UpdateVariable>`, commands };
}
export function completedMessage(narrative: string, update: string) {
  return `${stripProtocol(narrative)}\n\n${updateBlock(update).block}`;
}
