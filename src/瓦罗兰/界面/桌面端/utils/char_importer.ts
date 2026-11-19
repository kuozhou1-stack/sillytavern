import { Schema } from '../../../schema';
import { randomUUID } from '../../../运行/browser-crypto';
import { assertCharacterMapped, normalizeCharacterImport, validateCharacterPackage } from '../../../运行/characters';
export interface CharacterImportResult {
  success: boolean;
  error?: string;
  charId?: string;
  charName?: string;
  charLayer?: '主要' | '次要';
  recognizedFields?: string[];
  unmappedFields?: string[];
  mappedCharacter?: any;
  replacing?: boolean;
  package?: any;
}
export function parseAndValidateCharacterJson(
  input: string | Record<string, any>,
  existingCharIds: string[] = [],
  defaultLayer: '主要' | '次要' = '主要',
): CharacterImportResult {
  try {
    const pack = typeof input === 'string' ? JSON.parse(input) : input;
    if (!pack || typeof pack !== 'object' || Array.isArray(pack)) throw Error('顶层必须为角色对象');
    if (pack.格式版本 && pack.格式版本 !== '澄湾角色包/1') throw Error('不支持的角色包版本');
    if (pack.格式版本) validateCharacterPackage(pack);
    const raw = normalizeCharacterImport(pack.格式版本 ? pack.角色 : pack);
    const id = pack.id ?? 'char_' + randomUUID();
    if (typeof id !== 'string' || !id.trim()) throw Error('id 必须为非空文字');
    delete raw.id;
    if (raw.name !== undefined && raw.姓名 === undefined) {
      raw.姓名 = raw.name;
      delete raw.name;
    }
    if (typeof raw.姓名 !== 'string' || !raw.姓名.trim()) throw Error('姓名不能为空');
    raw.层级 ??= defaultLayer;
    const result = Schema.safeParse({ 角色: { [id]: raw } });
    if (!result.success) throw Error(z.prettifyError(result.error));
    const character = result.data.角色[id];
    assertCharacterMapped(raw, character);
    return {
      success: true,
      charId: id,
      charName: character.姓名!,
      charLayer: character.层级,
      recognizedFields: Object.keys(raw),
      unmappedFields: [],
      mappedCharacter: character,
      replacing: existingCharIds.includes(id),
      package: pack.格式版本 ? pack : undefined,
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
