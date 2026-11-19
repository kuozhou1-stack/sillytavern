import { type State } from './core';
import { type PhoneAction } from './phone';
/** Suggested response density only; neither API's variable permissions depend on this table. */
export function phoneBudget(state: State, action: PhoneAction, density = '标准') {
  const scale = density === '少量' ? 0.5 : density === '丰富' ? 2 : 1;
  let messages = 0,
    posts = 0,
    comments = 0,
    sessions = 0;
  if (action.kind === 'invite') {
    sessions = new Set(action.targets ?? []).size;
    messages = sessions * 3;
  } else if (action.id && state.手机.会话[action.id]) {
    messages = state.手机.会话[action.id].类型 === '群聊' ? 6 : 5;
    sessions = 1;
  } else if (action.kind === 'refresh' && action.platform !== '微澜' && action.text === 'chats') {
    messages = 5;
    sessions = 3;
  } else if (action.platform === '微澜') {
    posts = action.kind === 'refresh' ? 5 : 0;
    comments = 8;
  } else {
    posts = action.kind === 'refresh' ? 3 : 0;
    comments = 5;
  }
  return {
    messages: Math.ceil(messages * scale),
    posts: Math.ceil(posts * scale),
    comments: Math.ceil(comments * scale),
    sessions,
  };
}
