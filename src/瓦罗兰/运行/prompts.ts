import type { State } from './core';
import { publicModelData, promptProjections, promptContextPrompts, promptVariableRules } from './model-history';
import { normalizeRuleName, variableRuleNames } from './settings';
import { worldUpdatePrompt } from './world';
import { modelState } from './character-activity';
import { novelPrompt } from './novel-system';
import { normalizeGeographicNames } from './地理名称';
import { playerMapLocationPrompt } from './player-map-location';

// Worker requests omit depth-inserted chat history; keep these shared meanings available there.
const workerDepthRuleNames = [
  '规则｜叙事与知情',
  '规则｜关系生态',
  '规则｜好感与信任',
  '规则｜时间与行动',
  '规则｜社交平台',
  '规则｜自主生活与记忆',
];

/** The active Tavern worldbook and chat history keep their normal activation rules. */
export function promptConfig(
  state: State,
  text: string,
  _targets?: string[],
  _scope?: { session?: string; post?: string; platform?: string },
): GenerateConfig {
  return {
    overrides: { persona_description: '玩家以本次建档为准：' + JSON.stringify(publicModelData(state.玩家, ['玩家'])) },
    injects: [],
    user_input: text,
  };
}

export async function livePromptConfig(
  state: State,
  text: string,
  mode: 'story' | 'worker',
  targets?: string[],
  scope?: { session?: string; post?: string; platform?: string },
) {
  state = normalizeGeographicNames(state);
  const chat = SillyTavern.getCurrentChatId();
  const name = getCharWorldbookNames('current').primary;
  if (!name) throw Error('角色卡未绑定世界书');
  const config = promptConfig(state, text, targets, scope);
  if (mode === 'worker') {
    // Active public state plus recent history/summaries; do not repeat the player as a persona.
    config.overrides!.persona_description = '';
    // The card description asks for an opening story; this channel only settles variables.
    config.overrides!.char_description = '';
    const data = modelState(state, scope);
    promptProjections.set(config, data);
    config.injects!.push({ role: 'user', position: 'in_chat', depth: 0, content: JSON.stringify(data) });
    const entries = await getWorldbook(name);
    if (chat !== SillyTavern.getCurrentChatId() || name !== getCharWorldbookNames('current').primary)
      throw Error('读取提示词时聊天或世界书已切换');
    const variableRules: NonNullable<GenerateConfig['injects']> = [];
    for (const rule of variableRuleNames) {
      const found = entries.filter(e => normalizeRuleName(e.name) === rule);
      if (found.length !== 1 || !found[0].content.trim()) throw Error('变量规则缺失、重复或为空：' + rule);
      const prompt = { role: 'system' as const, position: 'in_chat' as const, depth: 0, content: found[0].content };
      config.injects!.push(prompt);
      variableRules.push(prompt);
    }
    promptVariableRules.set(config, variableRules);
    const sharedRules: WorldbookEntry[] = [];
    for (const rule of workerDepthRuleNames) {
      const found = entries.filter(entry => entry.enabled && normalizeRuleName(entry.name) === rule);
      if (found.length > 1) throw Error('已启用常驻规则重复：' + rule);
      const entry = found[0];
      // Other positions already enter through world_info; do not force disabled or selective entries.
      if (!entry || entry.strategy.type !== 'constant' || entry.position.type !== 'at_depth') continue;
      if (!entry.content.trim()) throw Error('已启用常驻规则为空：' + rule);
      sharedRules.push(entry);
    }
    const included = new Set(config.injects!.map(prompt => prompt.content.trim()));
    const sharedPrompts: NonNullable<GenerateConfig['injects']> = [];
    // Native depth 4 precedes the depth 0 state/variable entries. Preserve that
    // relation in workers, whose chat_history deliberately excludes depth entries.
    for (const entry of sharedRules.sort((a, b) =>
      (b.position.type === 'at_depth' ? b.position.depth : 0) -
      (a.position.type === 'at_depth' ? a.position.depth : 0) || a.position.order - b.position.order)) {
      const content = entry.content.trim();
      if (included.has(content)) continue;
      included.add(content);
      sharedPrompts.push({ role: 'system', position: 'in_chat', depth: 0, content: entry.content });
    }
    config.injects!.unshift(...sharedPrompts);
    promptContextPrompts.set(config, config.injects!.filter(prompt => !variableRules.includes(prompt)));
    const mapLocation = playerMapLocationPrompt(state);
    if (mapLocation) config.injects!.push({ role: 'system', position: 'in_chat', depth: 0, content: mapLocation });
  }
  if (mode === 'worker') config.injects!.push({
    role: 'system',
    position: 'in_chat',
    depth: 0,
    content: worldUpdatePrompt(state),
  });
  // The request's final hook owns the disabled list; do not send an early copy.
  config.injects!.push({ role: 'system', position: 'in_chat', depth: 0, content: novelPrompt(state, mode === 'worker') });
  return config;
}
