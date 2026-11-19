import type { NativeModules } from './native';
import type { PresetRequestData, PresetExtensionPrompt } from './preset';
import { scanWorldInfo } from './world-info';
import type { PromptRequestContext } from '../prompt-context';

function isTemporaryPrompt(key: string) {
  // Tavern uses underscores and Helper uses hyphens for the same depth/role slots.
  return key === 'TEMP_USER_MESSAGE' || /^customDepthWI(?:_\d+_\d+|-\d+-\d+)$/.test(key)
    || /^TH-CustomInjects-[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(key);
}

function exampleBlocks(text: string): string[] {
  if (!text || text === '<START>') return [];
  const source = text.startsWith('<START>') ? text : `<START>\n${text.trim()}`;
  return source.split(/<START>/gi).slice(1).map(block => `<START>\n${block.trim()}\n`);
}

/** Keep the host's field, history and regex processing, with temporary prompts owned by this request. */
export async function prepareRequestData(
  native: NativeModules, config: GenerateConfig, context?: PromptRequestContext, signal?: AbortSignal,
): Promise<PresetRequestData> {
  const { script, openai, regex, authorsNote, extensions, powerUser, worldInfo } = native;
  const settings = structuredClone(openai.oai_settings);
  const stoppingStrings = powerUser.getCustomStoppingStrings();
  const tokenizerModel = native.tokenizers.getTokenizerModel();
  const fields = script.getCharacterCardFields();
  const overrides = config.overrides ?? {};
  const history = overrides.chat_history;
  const name1 = script.name1, name2 = script.name2;
  const scenario = overrides.scenario ?? fields.scenario;
  const substitute = (text: string) => script.substituteParams(context && typeof text === 'string' ? context.expandPrompt(text) : text, {
    name1Override: name1, name2Override: name2, dynamicMacros: { scenario },
  });
  const userInput = regex.getRegexedString(substitute(config.user_input || settings.send_if_empty.trim()),
    regex.regex_placement.USER_INPUT, { isPrompt: true, depth: 0 });
  const extensionPrompts: Record<string, PresetExtensionPrompt> = Object.fromEntries(
    Object.entries(script.extension_prompts).filter(([key]) => !isTemporaryPrompt(key))
      .map(([key, value]) => [key, { ...(value as PresetExtensionPrompt) }]),
  );
  const promptTypes = script.extension_prompt_types;
  const setPrompt = (key: string, value: string, position: number, depth: number, scan = false, role = 0) => {
    extensionPrompts[key] = { value, position, depth, scan, role };
  };
  const character = script.characters[script.this_chid];
  const depthPrompt = character?.data?.extensions?.depth_prompt;
  const charDepthPrompt = substitute(depthPrompt?.prompt?.trim() ?? '');
  setPrompt('DEPTH_PROMPT', charDepthPrompt, promptTypes.IN_CHAT, depthPrompt?.depth ?? 4,
    extensions.extension_settings.note.allowWIScan, script.getExtensionPromptRoleByName(depthPrompt?.role ?? 'system'));

  const noteName = authorsNote.NOTE_MODULE_NAME, keys = authorsNote.metadata_keys;
  const shouldAddWorldInfoToNote = authorsNote.shouldWIAddPrompt;
  const metadata = script.chat_metadata;
  const note = history?.author_note ?? native.host.$('#extension_floating_prompt').val() ?? '';
  setPrompt(noteName, note, metadata[keys.position], metadata[keys.depth],
    extensions.extension_settings.note.allowWIScan, metadata[keys.role]);
  const power = powerUser.power_user, personaPositions = powerUser.persona_description_positions;
  const persona = overrides.persona_description ?? fields.persona;
  const presetPreferences = { persona_description_position: power.persona_description_position, pin_examples: power.pin_examples };
  const { promptBias } = script.getBiasStrings(userInput, 'normal');
  setPrompt('PERSONA_DESCRIPTION', '', promptTypes.IN_PROMPT, 0);
  if (persona && [personaPositions.BOTTOM_AN, personaPositions.TOP_AN].includes(power.persona_description_position)
    && shouldAddWorldInfoToNote) {
    extensionPrompts[noteName].value = power.persona_description_position === personaPositions.TOP_AN
      ? `${persona}\n${note}` : `${note}\n${persona}`;
  }
  if (persona && power.persona_description_position === personaPositions.AT_DEPTH) {
    setPrompt('PERSONA_DESCRIPTION', persona, promptTypes.IN_CHAT, power.persona_description_depth, true, power.persona_description_role);
  }
  for (const [index, prompt] of (config.injects ?? []).entries()) {
    setPrompt(`TH-CustomInjects-${config.generation_id}-${index}`, prompt.content, prompt.position === 'none' ? -1 : promptTypes.IN_CHAT,
      prompt.depth, prompt.should_scan, { system: 0, user: 1, assistant: 2 }[prompt.role]);
    extensionPrompts[`TH-CustomInjects-${config.generation_id}-${index}`].filter = prompt.filter;
  }

  // These two exported formatters are synchronous and return new arrays without writing host state.
  const coreChat = script.chat.filter((item: any) => !item.is_system);
  let messages: any[] = history?.prompts !== undefined ? structuredClone(history.prompts).reverse()
    : openai.setOpenAIMessages(coreChat.map((item: any, index: number) => ({ ...item,
      mes: regex.getRegexedString(item.mes, item.is_user ? regex.regex_placement.USER_INPUT : regex.regex_placement.AI_OUTPUT,
        { isPrompt: true, depth: coreChat.length - index - 1 }), index,
    })));
  if (typeof config.max_chat_history === 'number') messages = messages.slice(0, config.max_chat_history);
  // The story input may already be saved as the newest history message. Other card
  // channels pass their complete current facts as user_input instead.
  if (!config.user_input?.trim() && messages.length) messages[0].required = true;
  const chatLength = script.chat.length;
  const chatForScan = messages.filter(item => item.role !== 'system').map(item => worldInfo.world_info_include_names
    ? `${item.role === 'user' ? name1 : name2}: ${item.content}` : item.content);
  const examples = exampleBlocks(overrides.dialogue_examples ?? fields.mesExamples);
  const result = await scanWorldInfo(native, {
    chat: chatForScan, chatLength, userInput, scenario, extensionPrompts,
    updateWorldInfo: context?.updateWorldInfo ?? true, signal, expandPrompt: context?.expandPrompt,
    maxContext: script.getMaxContextSize(), isDryRun: false,
    globalScanData: {
      trigger: 'normal',
      personaDescription: persona,
      characterDescription: overrides.char_description ?? fields.description,
      characterPersonality: overrides.char_personality ?? fields.personality,
      characterDepthPrompt: charDepthPrompt,
      scenario,
      creatorNotes: substitute(character?.data?.creator_notes?.trim() ?? ''),
    },
  });
  if (shouldAddWorldInfoToNote) {
    const originalNote = extensionPrompts[noteName].value;
    extensionPrompts[noteName].value = `${result.anBefore.join('\n')}\n${originalNote}\n${result.anAfter.join('\n')}`
      .replace(/(^\n)|(\n$)/g, '');
  }
  if (history?.with_depth_entries !== false) {
    for (const entry of result.worldInfoDepth) {
      setPrompt(`customDepthWI-${entry.depth}-${entry.role}`, entry.entries.join('\n'), promptTypes.IN_CHAT, entry.depth, false, entry.role);
    }
  }
  if (overrides.dialogue_examples !== '') {
    for (const example of result.worldInfoExamples) {
      const blocks = exampleBlocks(substitute(example.content));
      if (example.position === worldInfo.wi_anchor_position.before) examples.unshift(...blocks);
      else examples.push(...blocks);
    }
  }
  return {
    name1, name2, settings, presetPreferences, tokenizerModel, stoppingStrings, scenario,
    expandPrompt: context?.expandPrompt,
    charDescription: overrides.char_description ?? fields.description,
    charPersonality: overrides.char_personality ?? fields.personality,
    personaDescription: persona,
    worldInfoBefore: overrides.world_info_before ?? result.worldInfoBefore,
    worldInfoAfter: overrides.world_info_after ?? result.worldInfoAfter,
    extensionPrompts, bias: promptBias, type: 'normal', quietPrompt: '', quietImage: null, cyclePrompt: '',
    systemPromptOverride: fields.system, jailbreakPromptOverride: fields.jailbreak,
    messages: [{ role: 'user', content: userInput, required: !!config.user_input?.trim() }, ...messages],
    messageExamples: openai.setOpenAIMessageExamples(examples),
  };
}
