import type { State } from './core';
import { promptProjections } from './model-history';
import { worldUpdatePrompt } from './world';
import { disabledIdentityPrompt, modelState } from './character-activity';
import { informationPromptRule } from './knowledge-context';
import { novelPrompt } from './novel-system';
import { normalizeGeographicNames } from './地理名称';
import { playerMapLocationPrompt } from './player-map-location';
import { normalizeRuleName, variableRuleNames } from './settings';
import { variableRuleContent } from './prompt-context';

export function promptConfig(
  _state: State, text: string, _targets?: string[],
  _scope?: { session?: string; post?: string; platform?: string },
): GenerateConfig {
  return { user_input: text };
}

/** Prepare task facts as native user input; variable rules are read only by requestUpdate. */
export async function livePromptConfig(
  state: State, text: string, mode: 'story' | 'worker', targets?: string[],
  scope?: { session?: string; post?: string; platform?: string },
) {
  const config = promptConfig(state, text, targets, scope);
  if (mode === 'story') return config;
  state = normalizeGeographicNames(state);
  promptProjections.set(config, modelState(state, scope));
  config.overrides = {
    persona_description: '', char_description: '',
    // The task supplies its narrative/phone action. Native depth entries remain enabled.
    chat_history: { prompts: [], with_depth_entries: true },
  };
  config.injects = ['本次执行变量更新。职责和输出契约见本轮变量规则。', informationPromptRule, disabledIdentityPrompt(state),
    playerMapLocationPrompt(state), worldUpdatePrompt(state), novelPrompt(state, true)]
    .filter(Boolean).map(content => ({ role: 'user' as const, position: 'in_chat' as const, depth: 0, content }));
  return config;
}

/** Read disabled entries only for this variable request; never toggle the shared worldbook around a call. */
export async function variableRulePrompts(): Promise<Omit<InjectionPrompt, 'id'>[]> {
  const chat = SillyTavern.getCurrentChatId(), book = getCharWorldbookNames('current').primary;
  if (!book) throw Error('角色卡未绑定世界书');
  const entries = await getWorldbook(book);
  if (chat !== SillyTavern.getCurrentChatId() || book !== getCharWorldbookNames('current').primary)
    throw Error('读取提示词时聊天或世界书已切换');
  return variableRuleNames.map(name => {
    const found = entries.filter(entry => normalizeRuleName(entry.name) === name);
    if (found.length !== 1 || !variableRuleContent(found[0].content))
      throw Error('变量规则缺失、重复或为空：' + name);
    const entry = found[0];
    if (entry.position.type !== 'at_depth') throw Error('变量规则原生注入需要指定深度位置：' + name);
    return { role: entry.position.role, position: 'in_chat', depth: entry.position.depth,
      content: variableRuleContent(entry.content) };
  });
}

/** Prepare input before calling Tavern; no messages, roles or preset tail are rewritten. */
export function nativePromptConfig(config: GenerateConfig): GenerateConfig {
  const { injects, ...native } = config;
  const parts = [...(injects ?? []).map(prompt => prompt.content), config.user_input ?? ''].filter(text => text.trim());
  return { ...native, user_input: parts.join('\n\n') };
}
