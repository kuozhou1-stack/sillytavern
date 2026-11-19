import { parseAndValidateCharacterJson, type CharacterImportResult } from './char_importer';

export type ImportRow = { name: string; result: CharacterImportResult; selected: boolean };

/** Each file remains independent; duplicate IDs in a batch require an explicit choice. */
export function parseCharacterBatch(
  files: { name: string; text?: string; error?: string }[],
  existingIds: string[],
): ImportRow[] {
  return files.map(file => {
    const result = file.error
      ? { success: false, error: file.error }
      : parseAndValidateCharacterJson(file.text ?? '', existingIds);
    return { name: file.name, result, selected: result.success };
  });
}

export function selectedCharacters(rows: ImportRow[]) {
  const ids = new Set<string>();
  return rows
    .filter(row => row.selected && row.result.success)
    .map(({ result }) => {
      const id = result.charId!;
      if (ids.has(id)) throw Error('同批选中了多个相同 ID：' + id + '。请只勾选希望保存的一份。');
      ids.add(id);
      return { ...result.mappedCharacter, id, __package: result.package, __imported: true };
    });
}
