import { stripProtocol } from '../../../运行/message-protocol';
export { stripProtocol };
/** Hide formal update spans in the UI, including the unfinished streamed tail. */
export function displayedNarrative(source: string) {
  return stripProtocol(source, true, true);
}
export function displayedMessage(content: string, id: number, role: 'user' | 'assistant' = 'assistant') {
  return {
    // A streamed reply has no saved floor. Use the latest floor for depth zero,
    // and pass its generated role explicitly instead of inheriting the player's role.
    html: id < 0
      ? SillyTavern.messageFormatting(content, role === 'user' ? SillyTavern.name1 : SillyTavern.name2,
        false, role === 'user', getLastMessageId())
      : formatAsDisplayedMessage(content, { message_id: id }),
  };
}
export function isHtmlWidget(code: HTMLElement) {
  const text = code.textContent?.trim() ?? '';
  return (
    /^<(?:!doctype\s+html|html\b|head\b|body\b)/i.test(text) ||
    (/\b(?:language-html|custom-language-html)\b/.test(code.className) && /^</.test(text))
  );
}
