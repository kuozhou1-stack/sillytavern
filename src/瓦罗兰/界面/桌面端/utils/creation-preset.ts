const storageKey = 'cw:creation:last-successful:v1';

export interface CreationPreset {
  version: 1;
  player: Record<string, any>;
  relations: Record<string, any>;
  fields: {
    startTime: string;
    weather: string;
    startLocation: string;
    accountName: string;
    balance: string | number;
    phoneName: string;
    startingItems: any[];
    initialCharacters: any[];
  };
}

export function readCreationPreset(): CreationPreset | null {
  const raw = window.parent.localStorage.getItem(storageKey);
  if (!raw) return null;
  const saved = JSON.parse(raw);
  if (
    saved?.version !== 1 ||
    !saved.player ||
    typeof saved.player !== 'object' ||
    !saved.relations ||
    typeof saved.relations !== 'object' ||
    !saved.fields ||
    !Array.isArray(saved.fields.startingItems) ||
    !Array.isArray(saved.fields.initialCharacters)
  )
    throw Error('上次建档记录格式不兼容');
  return saved as CreationPreset;
}

export function saveCreationPreset(preset: CreationPreset): void {
  window.parent.localStorage.setItem(storageKey, JSON.stringify(preset));
}
