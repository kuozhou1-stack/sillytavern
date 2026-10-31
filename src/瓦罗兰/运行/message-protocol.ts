/** Only a complete update block at the end of a reply is protocol. Tags in narrative/code are content. */
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
    if (!/^<UpdateVariable\b[^>]*>[\s\S]*?<\/UpdateVariable\s*>\s*$/i.test(tail)) continue;
    if (!/<JSONPatch>[\s\S]*?<\/JSONPatch>/i.test(tail)) continue;
    const before = withoutPlaceholder.slice(0, opening.index);
    const line = before.slice(before.lastIndexOf('\n') + 1);
    // A quoted tag or fenced code sample stays in the story.
    if ((line.match(/(?<!\\)`/g) ?? []).length % 2) continue;
    const fences = before.match(/^\s*(`{3,}|~{3,})/gm) ?? [];
    if (fences.length % 2) continue;
    return before.trim();
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

export function updateBlock(text: string) {
  type Patch = { start: number; contentStart: number; end: number; content: string };
  type Block = {
    start: number; end: number; patches: Patch[]; lifeChecks: Patch[];
    patch?: Omit<Patch, 'end' | 'content'>; lifeCheck?: Omit<Patch, 'end' | 'content'>;
  };
  const blocks: Block[] = [], thoughtEnds = completeThoughtEnds(text);
  const tagPattern = /<(\/?)(UpdateVariable|JSONPatch|Analysis|LifeCheck|thinking|think|reasoning)\b[^<>]*>/iy;
  const quoted = /"(?:\\[\s\S]|[^"\\])*"/y;
  const uniqueError = () => Error('需要且只能包含一个完整 MVU 更新块，保留结果供重试');
  let current: Block | undefined;
  for (let i = 0; i < text.length;) {
    // JSON string tokens are opaque: escaped quotes/backslashes and XML-looking values stay data.
    if (current && (current.patch || current.lifeCheck) && text[i] === '"') {
      quoted.lastIndex = i;
      if (quoted.exec(text)) { i = quoted.lastIndex; continue; }
    }
    tagPattern.lastIndex = i;
    const tag = tagPattern.exec(text);
    if (!tag) { i++; continue; }
    const end = tagPattern.lastIndex, name = tag[2].toLowerCase(), closing = !!tag[1];
    const thought = ['thinking', 'think', 'reasoning'].includes(name);
    // Complete nested thought sections may sit inside a preset wrapper or after its prose.
    if (!current && thought && !closing && thoughtEnds.has(i)) { i = thoughtEnds.get(i)!; continue; }
    if (current && name === 'analysis' && !closing) {
      const close = /<\/Analysis\s*>/i.exec(text.slice(end));
      if (close) { i = end + close.index + close[0].length; continue; }
    }
    if (name === 'updatevariable') {
      if (!closing) {
        if (current) throw uniqueError();
        current = { start: i, end: 0, patches: [], lifeChecks: [] };
      } else {
        if (!current) { i = end; continue; }
        current.end = end;
        blocks.push(current);
        current = undefined;
      }
    } else if (current && name === 'jsonpatch') {
      // Keep the existing JSONPatch tag spelling contract; do not add alternate formats.
      if (!/^<\/?JSONPatch>$/i.test(tag[0])) { i = end; continue; }
      if (!closing) {
        if (current.patch) throw Error('MVU 更新块必须包含一个 JSONPatch');
        current.patch = { start: i, contentStart: end };
      } else {
        if (!current.patch) { i = end; continue; }
        current.patches.push({ ...current.patch, end, content: text.slice(current.patch.contentStart, i) });
        delete current.patch;
      }
    } else if (current && name === 'lifecheck') {
      if (!closing) {
        // A nested receipt is left raw for the existing sibling-section validation.
        current.lifeCheck = current.lifeCheck ? undefined : { start: i, contentStart: end };
      } else if (current.lifeCheck) {
        current.lifeChecks.push({ ...current.lifeCheck, end, content: text.slice(current.lifeCheck.contentStart, i) });
        delete current.lifeCheck;
      }
    }
    i = end;
  }
  // Unclosed/duplicate real update blocks still fail; peripheral markup adds no new gate.
  if (current || blocks.length !== 1) throw uniqueError();
  const block = blocks[0];
  if (block.patches.length !== 1) throw Error('MVU 更新块必须包含一个 JSONPatch');
  const patch = block.patches[0], commands: unknown = JSON.parse(patch.content);
  if (!Array.isArray(commands)) throw Error('JSONPatch 必须为数组');
  const replacements = [{ ...patch, content: `<JSONPatch>${protocolJson(commands)}</JSONPatch>` }];
  for (const receipt of block.lifeChecks) {
    let value: unknown;
    try { value = JSON.parse(receipt.content); }
    catch {
      // Preserve malformed optional receipts verbatim: readLifeChecks reports their failure,
      // while unrelated valid patches retain the existing task-maintenance behavior.
      continue;
    }
    replacements.push({ ...receipt, content: `<LifeCheck>${protocolJson(value)}</LifeCheck>` });
  }
  let transport = text.slice(block.start, block.end);
  for (const section of replacements.sort((a, b) => b.start - a.start))
    transport = transport.slice(0, section.start - block.start) + section.content + transport.slice(section.end - block.start);
  return { block: transport, commands };
}
export function completedMessage(narrative: string, update: string) {
  return `${stripProtocol(narrative)}\n\n${updateBlock(update).block}`;
}
