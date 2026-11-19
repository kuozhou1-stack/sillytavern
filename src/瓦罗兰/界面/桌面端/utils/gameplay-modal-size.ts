import type { CSSProperties } from 'vue';

/** Player, character library and encounters share the encounter panel's dimensions. */
export const gameplayModalSize: CSSProperties = {
  width: '940px',
  maxWidth: 'min(95%, calc(100% - 24px))',
  height: '82%',
  maxHeight: 'min(820px, calc(100% - 24px))',
  minWidth: '0',
  minHeight: '0',
};
