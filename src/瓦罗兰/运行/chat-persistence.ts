import { copy, equal } from './core';
import { sameAssistantFloorText } from './request-source';

const cardExtra = (extra: any) => _.pickBy({ ...extra?.extra, ...extra }, (_value, key) => key.startsWith('cw_'));

/** Compare the card's saved text, candidates, MVU state and recovery records.
 * Other plugins' metadata does not participate in this acknowledgement.
 */
function chatSaveProjection(messages: any[], variables: Record<string, any>) {
  return {
    recovery: _.pickBy(variables, (_value, key) => key.startsWith('澄湾')),
    messages: messages.map(message => ({
      ...(message.mes === undefined ? {} : { text: message.mes }),
      user: !!message.is_user,
      narrator: message.extra?.type === 'narrator',
      hidden: !!message.is_system,
      swipe: message.swipe_id ?? 0,
      candidates: message.swipes ?? [message.mes ?? null],
      states: Object.fromEntries(Object.entries(message.variables ?? {})
        .filter(([, value]) => (value as any)?.stat_data !== undefined)
        .map(([index, value]) => [index, (value as any).stat_data])),
      extra: cardExtra(message.extra),
      candidateExtra: (message.swipe_info ?? []).map(cardExtra),
    })),
  };
}

export function chatSaveSnapshot(messages: any[], variables: Record<string, any>) {
  return copy(chatSaveProjection(messages, variables));
}

function savedMessagesMatch(
  expected: ReturnType<typeof chatSaveSnapshot>['messages'],
  actual: ReturnType<typeof chatSaveSnapshot>['messages'],
) {
  if (actual.length !== expected.length) return false;
  const current = SillyTavern.chat;
  return expected.every((before, id) => {
    const saved = actual[id];
    if (equal(before, saved)) return true;
    const live = current[id];
    if (before.user || before.narrator || !live || live.is_user || live.extra?.type === 'narrator' ||
      !equal(_.omit(before, 'text', 'candidates'), _.omit(saved, 'text', 'candidates'))) return false;
    // The preset writes the row and its candidates together. A readback made
    // of old and new slots need not represent either observed version of this row.
    const matches = (a: unknown, b: unknown) => a === b ||
      (typeof a === 'string' && typeof b === 'string' && sameAssistantFloorText(a, b, id));
    const liveCandidates = live.swipes ?? [live.mes];
    return saved.text === live.mes && equal(saved.candidates, liveCandidates) && matches(before.text, saved.text) &&
      Array.isArray(before.candidates) && Array.isArray(saved.candidates) &&
      before.candidates.length === saved.candidates.length &&
      before.candidates.every((value: string, swipe: number) => matches(value, saved.candidates[swipe]));
  });
}

/** Native saveChat can resolve after a failed HTTP save. Read the server's JSONL
 * once to acknowledge this save; do not replace the native writer or retry it.
 */
export async function persistChat() {
  const chat = SillyTavern.getCurrentChatId();
  const group = SillyTavern.groupId;
  const character = SillyTavern.characters[Number(SillyTavern.characterId)];
  const expected = chatSaveSnapshot(SillyTavern.chat, getVariables({ type: 'chat' }));
  const endpoint = group ? '/api/chats/group/get' : '/api/chats/get';
  const body = group ? { id: chat } : { ch_name: character.name, avatar_url: character.avatar, file_name: chat };
  await SillyTavern.saveChat();
  const response = await fetch(new URL(endpoint, window.parent.location.href), {
    method: 'POST', headers: SillyTavern.getRequestHeaders(), body: JSON.stringify(body), cache: 'no-store',
  }).catch(error => {
    throw Error('聊天保存未确认：无法读回服务端存档', { cause: error });
  });
  if (!response.ok) throw Error(`聊天保存未确认：服务端读回失败（HTTP ${response.status}）`);
  const saved = await response.json();
  if (chat !== SillyTavern.getCurrentChatId() || group !== SillyTavern.groupId ||
      (!group && body.avatar_url !== SillyTavern.characters[Number(SillyTavern.characterId)]?.avatar))
    throw Error('保存期间聊天已变化，未确认原提交');
  if (!Array.isArray(saved) || !saved[0]?.chat_metadata)
    throw Error('聊天保存未确认：服务端没有返回有效聊天存档');
  // response.json() already owns this data; only the pre-save expectation needs
  // a detached snapshot while native saveChat is awaiting other writes.
  const actual = chatSaveProjection(saved.slice(1), saved[0].chat_metadata.variables ?? {});
  // 手机入队/取消可发生在等待期间；还允许原生保存捕获到纯追加过程中的完整前缀。
  const queueKey = '澄湾排队操作';
  const beforeQueue = expected.recovery[queueKey], savedQueue = actual.recovery[queueKey];
  const currentQueue = getVariables({ type: 'chat' })[queueKey];
  const isPrefix = (before: unknown, after: unknown) => Array.isArray(before) && Array.isArray(after) &&
    before.length <= after.length && before.every((item, index) => equal(item, after[index]));
  const queueMatches = equal(actual.recovery[queueKey], expected.recovery[queueKey]) ||
    equal(savedQueue, currentQueue) || (isPrefix(beforeQueue ?? [], savedQueue) && isPrefix(savedQueue, currentQueue));
  if (!queueMatches || !savedMessagesMatch(expected.messages, actual.messages) ||
      !equal(_.omit(actual.recovery, queueKey), _.omit(expected.recovery, queueKey)))
    throw Error('聊天保存未确认：服务端的正文、变量或恢复记录与本次保存不一致，请重试保存');
}
