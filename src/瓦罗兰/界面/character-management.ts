import type { Runtime } from '../运行/host';
import type { CharacterManagementContracts } from './桌面端/components/characters/category-types';

/** The runtime owns all writes. UI always re-reads its acknowledged projection. */
export function characterManagementContracts(runtime: Runtime): CharacterManagementContracts {
  // The bridge synchronizes the acknowledged view before commands resolve.
  // Copy only management metadata; do not refresh/serialize every full profile twice.
  const view = () => runtime.view.characterLibrary;
  return {
    getCategories: () => JSON.parse(JSON.stringify(view()?.categories ?? [])),
    getCharacterMetaMap: () => JSON.parse(JSON.stringify(view()?.meta ?? {})),
    createCategory: async name => (await runtime.manageCharacters({ kind: 'create', name })).created!,
    renameCategory: async (categoryId, name) => {
      await runtime.manageCharacters({ kind: 'rename', categoryId, name });
    },
    deleteCategory: async categoryId => {
      await runtime.manageCharacters({ kind: 'delete', categoryId });
    },
    reorderCategories: async ids => {
      await runtime.manageCharacters({ kind: 'categories', ids });
    },
    moveCharacterToCategory: async (id, categoryId, index) => {
      await runtime.manageCharacters({ kind: 'move', id, categoryId, index });
    },
    reorderCharactersInCategory: async (categoryId, ids) => {
      await runtime.manageCharacters({ kind: 'order', categoryId, ids });
    },
    toggleCharacterEnabled: async (id, enabled) => {
      const result = await runtime.manageCharacters({ kind: 'enabled', ids: [id], enabled });
      return result.results.length === 1 && result.results[0].enabled === enabled;
    },
    batchToggleCategoryEnabled: async (categoryId, enabled, ids) => {
      const result = await runtime.manageCharacters({ kind: 'enabled', ids, enabled, categoryId });
      if (result.results.length !== new Set(ids).size || result.results.some(r => r.enabled !== enabled))
        throw Error('批量操作未获得完整确认，请重新读取角色库');
    },
  };
}
