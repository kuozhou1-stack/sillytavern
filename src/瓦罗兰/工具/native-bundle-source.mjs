/** 原卡所有导出均沿用作者显式 UID，不以数组位置补号。 */
export function stableWorldbookEntries(entries) {
  const used = new Set();
  for (const entry of entries) {
    const name = entry.name ?? entry.名称 ?? '未命名条目';
    if (!Number.isSafeInteger(entry.uid) || entry.uid < 0)
      throw Error('世界书须显式保存有效的稳定UID：' + name);
    if (used.has(entry.uid)) throw Error('世界书UID重复：' + entry.uid + '（' + name + '）');
    used.add(entry.uid);
  }
  return entries;
}

export function nativeBundleSource(source, end, exports) {
  const original = 'worldbook.entries.map((entry, index) => [index, to_original_worldbook_entry(entry, index)])';
  const stable = 'stableWorldbookEntries(worldbook.entries).map(entry => [entry.uid, to_original_worldbook_entry(entry, entry.uid)])';
  const originalCard = 'character.entries.map((entry, index) => to_original_worldbook_entry(entry, index))';
  const stableCard = 'stableWorldbookEntries(character.entries).map(entry => to_original_worldbook_entry(entry, entry.uid))';
  const sliced = source.slice(0, end);
  if (sliced.split(original).length !== 2) throw Error('原生UID序列化入口已变化，停止打包以免重排条目');
  if (sliced.split(originalCard).length !== 2) throw Error('原生角色卡UID序列化入口已变化，停止打包以免重排条目');
  return sliced.replace(original, stable).replace(originalCard, stableCard) + `\n${stableWorldbookEntries.toString()}\nexport { ${exports} };\n`;
}
