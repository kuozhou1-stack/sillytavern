import { assemblePreset } from './preset-native.js';

/** Native parent-realm modules. Their APIs are provided by the installed Tavern version. */
export type PresetNative = Record<string, any>;
export type PresetChatMessage = { role: string; content?: unknown; [key: string]: unknown };
export type PresetExtensionPrompt = {
  value: string;
  position: number;
  depth?: number;
  role?: number;
  filter?: () => boolean | Promise<boolean>;
  [key: string]: unknown;
};
export type PresetRequestData = {
  messages: PresetChatMessage[];
  messageExamples: unknown[][];
  extensionPrompts: Record<string, PresetExtensionPrompt>;
  scenario: string;
  charDescription?: string;
  charPersonality?: string;
  name1?: string;
  name2?: string;
  type?: string;
  settings?: Record<string, any>;
  presetPreferences?: { persona_description_position: number; pin_examples: boolean };
  dynamicMacros?: Record<string, unknown>;
  [key: string]: any;
};

export async function preparePreset(
  native: PresetNative,
  requestData: PresetRequestData,
): Promise<PresetChatMessage[]> {
  const { script, openai, promptManager: promptModule, powerUser, extensions, groupChats } = native;
  const settings = structuredClone(requestData.settings ?? openai.promptManager.serviceSettings);
  const preferences = requestData.presetPreferences ?? powerUser.power_user;
  const power = {
    persona_description: requestData.personaDescription ?? powerUser.power_user.persona_description,
    persona_description_position: preferences.persona_description_position,
    pin_examples: preferences.pin_examples,
  };
  const name1 = requestData.name1 ?? script.name1;
  const name2 = requestData.name2 ?? script.name2;
  const mediaSupport = {
    image: openai.isImageInliningSupported(),
    video: openai.isVideoInliningSupported(),
    audio: openai.isAudioInliningSupported(),
  };
  const tools = extensions.getContext().ToolManager;
  const request = {
    ...requestData,
    messages: structuredClone(requestData.messages),
    messageExamples: structuredClone(requestData.messageExamples),
  };
  const dynamicMacros = {
    ...requestData.dynamicMacros,
    scenario: request.scenario,
    description: request.charDescription ?? '',
    personality: request.charPersonality ?? '',
    persona: power.persona_description ?? '',
  };
  const substitute = (text: string, options: Record<string, unknown> = {}) =>
    script.substituteParams(requestData.expandPrompt && typeof text === 'string' ? requestData.expandPrompt(text) : text, {
      ...options,
      name1Override: name1,
      name2Override: name2,
      dynamicMacros: { ...dynamicMacros, ...(options.dynamicMacros as object) },
    });

  // The prototype supplies ordering/name helpers, while mutable settings and macro expansion belong to this request.
  const manager = Object.assign(Object.create(Object.getPrototypeOf(openai.promptManager)), openai.promptManager, {
    serviceSettings: settings,
    activeCharacter: structuredClone(openai.promptManager.activeCharacter),
    configuration: structuredClone(openai.promptManager.configuration),
    overriddenPrompts: [],
    preparePrompt(this: any, prompt: any, original: string | null = null) {
      const result = new promptModule.Prompt(prompt);
      const members = this.getActiveGroupCharacters();
      result.content = substitute(prompt.content, {
        ...(typeof original === 'string' ? { original } : {}),
        ...(members.length ? { groupOverride: members.join(', ') } : {}),
      });
      return result;
    },
  });
  const tokenHandler = new openai.TokenHandler(native.tokenizers.countTokensOpenAIAsync);
  manager.tokenHandler = tokenHandler;

  async function getExtensionPrompt(position: number, depth?: number, separator = '\n', role?: number, wrap = true) {
    const values: string[] = [];
    for (const key of Object.keys(request.extensionPrompts).sort()) {
      const prompt = request.extensionPrompts[key];
      if (prompt.position !== position || !prompt.value) continue;
      if (depth !== undefined && prompt.depth !== undefined && prompt.depth !== depth) continue;
      if (role !== undefined && prompt.role !== undefined && prompt.role !== role) continue;
      if (typeof prompt.filter === 'function' && !(await prompt.filter())) continue;
      values.push(prompt.value.trim());
    }
    let result = values.join(separator);
    if (wrap && result && !result.startsWith(separator)) result = separator + result;
    if (wrap && result && !result.endsWith(separator)) result += separator;
    return result ? substitute(result) : result;
  }

  const chat = await assemblePreset(
    {
      ...openai,
      ...promptModule,
      extension_prompt_types: script.extension_prompt_types,
      extension_prompt_roles: script.extension_prompt_roles,
      selected_group: groupChats.selected_group,
      oai_settings: settings,
      power_user: power,
      persona_description_positions: powerUser.persona_description_positions,
      promptManager: manager,
      tokenHandler,
      ToolManager: {
        isToolCallingSupported: () => tools.isToolCallingSupported(settings),
        canPerformToolCalls: (type: string) => tools.canPerformToolCalls(type, settings),
        registerFunctionToolsOpenAI: (data: object) => tools.registerFunctionToolsOpenAI(data),
      },
      isImageInliningSupported: () => mediaSupport.image,
      isVideoInliningSupported: () => mediaSupport.video,
      isAudioInliningSupported: () => mediaSupport.audio,
      substituteParams: substitute,
      substituteParamsExtended: (
        text: string,
        additionalMacro: Record<string, unknown> = {},
        postProcessFn?: (text: string) => string,
      ) => substitute(text, { dynamicMacros: additionalMacro, postProcessFn }),
      getExtensionPrompt,
      getExtensionPromptMaxDepth: script.getExtensionPromptMaxDepth,
      formatWorldInfo: (text: string) => openai.formatWorldInfo(text, { wiFormat: settings.wi_format }),
      isReasoningSignatureSupported: () => openai.isReasoningSignatureSupported(settings),
      getEffectiveToolReasoningMode: () =>
        settings.show_thoughts
          ? Object.values(openai.tool_reasoning_modes).includes(settings.tool_reasoning_mode)
            ? settings.tool_reasoning_mode
            : openai.tool_reasoning_modes.DISABLED
          : openai.tool_reasoning_modes.DISABLED,
      interleaved_reasoning_providers: [
        openai.chat_completion_sources.OPENROUTER,
        openai.chat_completion_sources.CUSTOM,
      ],
      character_names_behavior: { NONE: -1, DEFAULT: 0, COMPLETION: 1, CONTENT: 2 },
      MEDIA_TYPE: { IMAGE: 'image', VIDEO: 'video', AUDIO: 'audio' },
      MEDIA_DISPLAY: { LIST: 'list', GALLERY: 'gallery' },
    },
    request,
  );
  await script.eventSource.emit(script.event_types.CHAT_COMPLETION_PROMPT_READY, { chat, dryRun: false });
  return chat;
}
