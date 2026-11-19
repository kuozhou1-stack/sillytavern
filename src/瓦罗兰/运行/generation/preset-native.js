// SPDX-License-Identifier: AGPL-3.0-or-later
// Adapted from SillyTavern/SillyTavern public/scripts/openai.js.
// Fixed source commit: 51ad27fb86d39a3daca3adaa970375c9670c12df (1.18.0).
// https://github.com/SillyTavern/SillyTavern/blob/51ad27fb86d39a3daca3adaa970375c9670c12df/public/scripts/openai.js
// Local changes: request-owned dependencies, fail-fast assembly, and no PromptManager UI writes.
// See SILLYTAVERN-LICENSE.txt for the upstream license.

export async function assemblePreset(environment, requestData) {
  const {
    MessageCollection,
    selected_group,
    oai_settings,
    substituteParams,
    substituteParamsExtended,
    Prompt,
    Message,
    promptManager,
    isImageInliningSupported,
    isVideoInliningSupported,
    isAudioInliningSupported,
    ToolManager,
    isReasoningSignatureSupported,
    interleaved_reasoning_providers,
    getEffectiveToolReasoningMode,
    tool_reasoning_modes,
    character_names_behavior,
    MEDIA_TYPE,
    MEDIA_DISPLAY,
    extension_prompt_types,
    extension_prompt_roles,
    INJECTION_POSITION,
    tokenHandler,
    chat_completion_sources,
    power_user,
    formatWorldInfo,
    persona_description_positions,
    getExtensionPrompt,
    getExtensionPromptMaxDepth,
    ChatCompletion,
  } = environment;
  async function populationInjectionPrompts(prompts, messages) {
    let totalInsertedMessages = 0;

    const roleTypes = {
      system: extension_prompt_roles.SYSTEM,
      user: extension_prompt_roles.USER,
      assistant: extension_prompt_roles.ASSISTANT,
    };

    const maxDepth = getExtensionPromptMaxDepth();
    for (let i = 0; i <= maxDepth; i++) {
      // Get prompts for current depth
      const depthPrompts = prompts.filter(prompt => prompt.injection_depth === i && prompt.content);

      const roleMessages = [];
      const separator = '\n';
      const wrap = false;

      // Group prompts by priority
      const extensionPromptsOrder = '100';
      const orderGroups = {
        [extensionPromptsOrder]: [],
      };
      for (const prompt of depthPrompts) {
        const order = prompt.injection_order ?? 100;
        if (!orderGroups[order]) {
          orderGroups[order] = [];
        }
        orderGroups[order].push(prompt);
      }

      // Process each order group in order (b - a = low to high ; a - b = high to low)
      const orders = Object.keys(orderGroups).sort((a, b) => +b - +a);
      for (const order of orders) {
        const orderPrompts = orderGroups[order];

        // Order of priority for roles (most important go lower)
        const roles = ['system', 'user', 'assistant'];
        for (const role of roles) {
          const rolePrompts = orderPrompts
            .filter(prompt => prompt.role === role)
            .map(x => x.content)
            .join(separator);

          // Get extension prompt
          const extensionPrompt =
            order === extensionPromptsOrder
              ? await getExtensionPrompt(extension_prompt_types.IN_CHAT, i, separator, roleTypes[role], wrap)
              : '';
          const jointPrompt = [rolePrompts, extensionPrompt]
            .filter(x => x)
            .map(x => x.trim())
            .join(separator);

          if (jointPrompt && jointPrompt.length) {
            roleMessages.push({ role: role, content: jointPrompt, injected: true });
          }
        }
      }

      if (roleMessages.length) {
        const injectIdx = i + totalInsertedMessages;
        messages.splice(injectIdx, 0, ...roleMessages);
        totalInsertedMessages += roleMessages.length;
      }
    }

    messages = messages.reverse();
    return messages;
  }

  async function populateChatHistory(messages, prompts, chatCompletion, type = null, cyclePrompt = null) {
    if (!prompts.has('chatHistory')) {
      if (messages.some(message => message.required)) {
        throw Error('预设未启用聊天历史，本轮必需输入无法发送');
      }
      return;
    }

    chatCompletion.add(new MessageCollection('chatHistory'), prompts.index('chatHistory'));

    // Reserve budget for new chat message
    const newChat = selected_group ? oai_settings.new_group_chat_prompt : oai_settings.new_chat_prompt;
    const newChatMessage = await Message.createAsync('system', substituteParams(newChat), 'newMainChat');
    chatCompletion.reserveBudget(newChatMessage);

    // Reserve budget for group nudge
    let groupNudgeMessage = null;
    const noGroupNudgeTypes = ['impersonate'];
    if (selected_group && prompts.has('groupNudge') && !noGroupNudgeTypes.includes(type)) {
      groupNudgeMessage = await Message.fromPromptAsync(prompts.get('groupNudge'));
      chatCompletion.reserveBudget(groupNudgeMessage);
    }

    // Reserve budget for continue nudge
    let continueMessageCollection = null;
    if (type === 'continue' && cyclePrompt && !oai_settings.continue_prefill) {
      const promptObject = {
        identifier: 'continueNudge',
        role: 'system',
        content: substituteParamsExtended(oai_settings.continue_nudge_prompt, {
          lastChatMessage: String(cyclePrompt).trim(),
        }),
        system_prompt: true,
      };
      continueMessageCollection = new MessageCollection('continueNudge');
      const continueMessageIndex = messages.findLastIndex(x => !x.injected);
      if (continueMessageIndex >= 0) {
        const continueMessage = messages.splice(continueMessageIndex, 1)[0];
        const prompt = new Prompt(continueMessage);
        const chatMessage = await Message.fromPromptAsync(promptManager.preparePrompt(prompt));
        continueMessageCollection.add(chatMessage);
      }
      const continueNudgePrompt = new Prompt(promptObject);
      const preparedNudgePrompt = promptManager.preparePrompt(continueNudgePrompt);
      const continueNudgeMessage = await Message.fromPromptAsync(preparedNudgePrompt);
      continueMessageCollection.add(continueNudgeMessage);
      chatCompletion.reserveBudget(continueMessageCollection);
    }

    const lastChatPrompt = messages[messages.length - 1];
    const message = await Message.createAsync('user', oai_settings.send_if_empty, 'emptyUserMessageReplacement');
    if (
      lastChatPrompt &&
      lastChatPrompt.role === 'assistant' &&
      oai_settings.send_if_empty &&
      chatCompletion.canAfford(message)
    ) {
      chatCompletion.insert(message, 'chatHistory');
    }

    const imageInlining = isImageInliningSupported();
    const videoInlining = isVideoInliningSupported();
    const audioInlining = isAudioInliningSupported();
    const canUseTools = ToolManager.isToolCallingSupported();
    const includeSignature = isReasoningSignatureSupported();
    const isToolReasoningProvider = interleaved_reasoning_providers.includes(oai_settings.chat_completion_source);
    const toolReasoningMode = isToolReasoningProvider ? getEffectiveToolReasoningMode() : tool_reasoning_modes.DISABLED;
    const includeToolReasoning = toolReasoningMode !== tool_reasoning_modes.DISABLED;
    const lastUserIdx = messages.findLastIndex(x => x.role === 'user');

    // Insert chat messages as long as there is budget available
    const chatPool = [...messages].reverse();
    for (let index = 0; index < chatPool.length; index++) {
      const chatPrompt = chatPool[index];

      // We do not want to mutate the prompt
      const prompt = new Prompt(chatPrompt);
      prompt.identifier = `chatHistory-${messages.length - index}`;
      const chatMessage = await Message.fromPromptAsync(promptManager.preparePrompt(prompt));

      if (promptManager.serviceSettings.names_behavior === character_names_behavior.COMPLETION && prompt.name) {
        const messageName = promptManager.isValidName(prompt.name)
          ? prompt.name
          : promptManager.sanitizeName(prompt.name);
        await chatMessage.setName(messageName);
      }

      /**
       * Inline a media attachment into the chat message.
       * @param {MediaAttachment} media - The media attachment to inline.
       */
      async function inlineMediaAttachment(media) {
        if (!media || !media.url) {
          return;
        }
        if (!media.type) {
          media.type = MEDIA_TYPE.IMAGE;
        }
        if (imageInlining && media.type === MEDIA_TYPE.IMAGE) {
          await chatMessage.addImage(media.url);
        }
        if (videoInlining && media.type === MEDIA_TYPE.VIDEO) {
          await chatMessage.addVideo(media.url);
        }
        if (audioInlining && media.type === MEDIA_TYPE.AUDIO) {
          await chatMessage.addAudio(media.url);
        }
      }

      if (Array.isArray(chatPrompt.media) && chatPrompt.media.length) {
        if (chatPrompt.mediaDisplay === MEDIA_DISPLAY.LIST) {
          for (const media of chatPrompt.media) {
            await inlineMediaAttachment(media);
          }
        }
        if (chatPrompt.mediaDisplay === MEDIA_DISPLAY.GALLERY) {
          const media = chatPrompt.media[chatPrompt.mediaIndex];
          await inlineMediaAttachment(media);
        }
      }

      if (canUseTools && Array.isArray(chatPrompt.invocations)) {
        const promptIdx = messages.indexOf(chatPrompt);
        const reasoningIsEligible = toolReasoningMode !== tool_reasoning_modes.DISABLED && promptIdx > lastUserIdx;
        let previousAssistantReasoning = '';
        if (reasoningIsEligible) {
          if (toolReasoningMode === tool_reasoning_modes.ACTIVE_CHAIN) {
            // Strict chain mode: skip tool/tool-call messages, then use only the first assistant text boundary.
            for (let idx = promptIdx - 1; idx > lastUserIdx; idx--) {
              const candidate = messages[idx];
              if (candidate?.role === 'tool') {
                continue;
              }
              if (candidate?.role === 'assistant' && Array.isArray(candidate.invocations)) {
                continue;
              }
              const hasAssistantText =
                candidate?.role === 'assistant' &&
                !Array.isArray(candidate.invocations) &&
                typeof candidate.content === 'string' &&
                candidate.content.trim().length > 0;
              if (hasAssistantText) {
                previousAssistantReasoning = String(candidate.reasoning ?? '');
              }
              break;
            }
          } else if (toolReasoningMode === tool_reasoning_modes.SINCE_LAST_USER) {
            // Broad mode: use the latest assistant text reasoning anywhere since the last user.
            for (let idx = promptIdx - 1; idx > lastUserIdx; idx--) {
              const candidate = messages[idx];
              const hasAssistantText =
                candidate?.role === 'assistant' &&
                !Array.isArray(candidate.invocations) &&
                typeof candidate.content === 'string' &&
                candidate.content.trim().length > 0;
              if (!hasAssistantText) {
                continue;
              }
              const candidateReasoning = String(candidate.reasoning ?? '');
              if (candidateReasoning) {
                previousAssistantReasoning = candidateReasoning;
                break;
              }
            }
          }
        }
        /** @type {import('./tool-calling.js').ToolInvocation[]} */
        const invocations = chatPrompt.invocations.map(invocation => {
          const clone = structuredClone(invocation);
          if (!reasoningIsEligible) {
            delete clone.reasoning;
          } else if (previousAssistantReasoning && !clone.reasoning) {
            // Fall back to adjacent assistant-text reasoning only when the invocation has none of its own.
            clone.reasoning = previousAssistantReasoning;
          }
          return clone;
        });
        const toolCallMessage = await Message.createAsync(
          chatMessage.role,
          undefined,
          'toolCall-' + chatMessage.identifier,
        );
        const toolResultMessages = await Promise.all(
          invocations
            .slice()
            .reverse()
            .map(invocation => Message.createAsync('tool', invocation.result || '[No content]', invocation.id)),
        );
        await toolCallMessage.setToolCalls(invocations, includeSignature, includeToolReasoning);
        if (chatCompletion.canAffordAll([toolCallMessage, ...toolResultMessages])) {
          for (const resultMessage of toolResultMessages) {
            chatCompletion.insertAtStart(resultMessage, 'chatHistory');
          }
          chatCompletion.insertAtStart(toolCallMessage, 'chatHistory');
        } else {
          if (chatPool.slice(index).some(message => message.required)) {
            throw Error('提示词预算不足，无法保留本轮输入；请增大上下文或缩减提示词');
          }
          break;
        }

        continue;
      }

      if (includeSignature && chatPrompt.signature) {
        chatMessage.signature = chatPrompt.signature;
      }

      if (chatCompletion.canAfford(chatMessage)) {
        chatCompletion.insertAtStart(chatMessage, 'chatHistory');
      } else {
        if (chatPool.slice(index).some(message => message.required)) {
          throw Error('提示词预算不足，无法保留本轮输入；请增大上下文或缩减提示词');
        }
        break;
      }
    }

    // Insert and free new chat
    chatCompletion.freeBudget(newChatMessage);
    chatCompletion.insertAtStart(newChatMessage, 'chatHistory');

    // Reserve budget for group nudge
    if (selected_group && groupNudgeMessage) {
      chatCompletion.freeBudget(groupNudgeMessage);
      chatCompletion.insertAtEnd(groupNudgeMessage, 'chatHistory');
    }

    // Insert and free continue nudge
    if (type === 'continue' && continueMessageCollection) {
      chatCompletion.freeBudget(continueMessageCollection);
      chatCompletion.add(continueMessageCollection, -1);
    }
  }

  async function populateDialogueExamples(prompts, chatCompletion, messageExamples) {
    if (!prompts.has('dialogueExamples')) {
      return;
    }

    chatCompletion.add(new MessageCollection('dialogueExamples'), prompts.index('dialogueExamples'));
    if (Array.isArray(messageExamples) && messageExamples.length) {
      const newExampleChat = await Message.createAsync(
        'system',
        substituteParams(oai_settings.new_example_chat_prompt),
        'newChat',
      );
      for (const dialogue of [...messageExamples]) {
        const dialogueIndex = messageExamples.indexOf(dialogue);
        const chatMessages = [];

        for (let promptIndex = 0; promptIndex < dialogue.length; promptIndex++) {
          const prompt = dialogue[promptIndex];
          const role = 'system';
          const content = prompt.content || '';
          const identifier = `dialogueExamples ${dialogueIndex}-${promptIndex}`;

          const chatMessage = await Message.createAsync(role, content, identifier);
          await chatMessage.setName(prompt.name);
          chatMessages.push(chatMessage);
        }

        if (!chatCompletion.canAffordAll([newExampleChat, ...chatMessages])) {
          break;
        }

        chatCompletion.insert(newExampleChat, 'dialogueExamples');
        for (const chatMessage of chatMessages) {
          chatCompletion.insert(chatMessage, 'dialogueExamples');
        }
      }
    }
  }

  function getPromptPosition(position) {
    if (position == extension_prompt_types.BEFORE_PROMPT) {
      return 'start';
    }

    if (position == extension_prompt_types.IN_PROMPT) {
      return 'end';
    }

    return false;
  }

  function getPromptRole(role) {
    switch (role) {
      case extension_prompt_roles.SYSTEM:
        return 'system';
      case extension_prompt_roles.USER:
        return 'user';
      case extension_prompt_roles.ASSISTANT:
        return 'assistant';
      default:
        return 'system';
    }
  }

  async function populateChatCompletion(
    prompts,
    chatCompletion,
    { bias, quietPrompt, quietImage, type, cyclePrompt, messages, messageExamples },
  ) {
    // Helper function for preparing a prompt, that already exists within the prompt collection, for completion
    const addToChatCompletion = async (source, target = null) => {
      // We need the prompts array to determine a position for the source.
      if (false === prompts.has(source)) return;

      if (promptManager.isPromptDisabledForActiveCharacter(source) && source !== 'main') {
        promptManager.log(`Skipping prompt ${source} because it is disabled`);
        return;
      }

      const prompt = prompts.get(source);

      if (prompt.injection_position === INJECTION_POSITION.ABSOLUTE) {
        promptManager.log(`Skipping prompt ${source} because it is an absolute prompt`);
        return;
      }

      const index = target ? prompts.index(target) : prompts.index(source);
      const collection = new MessageCollection(source);
      const message = await Message.fromPromptAsync(prompt);
      collection.add(message);
      chatCompletion.add(collection, index);
    };

    chatCompletion.reserveBudget(3); // every reply is primed with <|start|>assistant<|message|>
    // Character and world information
    await addToChatCompletion('worldInfoBefore');
    await addToChatCompletion('main');
    await addToChatCompletion('worldInfoAfter');
    await addToChatCompletion('charDescription');
    await addToChatCompletion('charPersonality');
    await addToChatCompletion('scenario');
    await addToChatCompletion('personaDescription');

    // Collection of control prompts that will always be positioned last
    chatCompletion.setOverriddenPrompts(prompts.overriddenPrompts);
    const controlPrompts = new MessageCollection('controlPrompts');

    const impersonateMessage = (await Message.fromPromptAsync(prompts.get('impersonate'))) ?? null;
    if (type === 'impersonate') controlPrompts.add(impersonateMessage);

    // Add quiet prompt to control prompts
    // This should always be last, even in control prompts. Add all further control prompts BEFORE this prompt
    const quietPromptMessage = (await Message.fromPromptAsync(prompts.get('quietPrompt'))) ?? null;
    if (quietPromptMessage && quietPromptMessage.content) {
      if (isImageInliningSupported() && quietImage) {
        await quietPromptMessage.addImage(quietImage);
      }

      controlPrompts.add(quietPromptMessage);
    }

    chatCompletion.reserveBudget(controlPrompts);

    // Add ordered system and user prompts
    const systemPrompts = ['nsfw', 'jailbreak'];
    const userRelativePrompts = prompts.collection
      .filter(prompt => false === prompt.system_prompt && prompt.injection_position !== INJECTION_POSITION.ABSOLUTE)
      .reduce((acc, prompt) => {
        acc.push(prompt.identifier);
        return acc;
      }, []);
    const absolutePrompts = prompts.collection
      .filter(prompt => prompt.injection_position === INJECTION_POSITION.ABSOLUTE)
      .reduce((acc, prompt) => {
        acc.push(prompt);
        return acc;
      }, []);

    for (const identifier of [...systemPrompts, ...userRelativePrompts]) {
      await addToChatCompletion(identifier);
    }

    // Add enhance definition instruction
    if (prompts.has('enhanceDefinitions')) await addToChatCompletion('enhanceDefinitions');

    // Bias
    if (bias && bias.trim().length) await addToChatCompletion('bias');

    const injectToMain = async (/** @type {Prompt} */ prompt, /** @type {string|number} */ position) => {
      if (chatCompletion.has('main')) {
        const message = await Message.fromPromptAsync(prompt);
        chatCompletion.insert(message, 'main', position);
      } else {
        // Convert the relative prompt to an injection and place it relative to main prompt
        // Keeping prompts in the same order bucket will squash them together during in-chat injection
        const indexOfMain = absolutePrompts.findIndex(p => p.identifier === 'main');
        if (indexOfMain >= 0) {
          const main = absolutePrompts[indexOfMain];
          const promptCopy = new Prompt(prompt);
          promptCopy.role = main.role;
          promptCopy.injection_position = main.injection_position;
          promptCopy.injection_depth = main.injection_depth;
          promptCopy.injection_order = main.injection_order;
          const newIndex = position === 'end' ? indexOfMain + 1 : indexOfMain;
          absolutePrompts.splice(newIndex, 0, promptCopy);
        }
      }
    };

    const knownPrompts = ['summary', 'authorsNote', 'vectorsMemory', 'vectorsDataBank', 'smartContext'];

    // Known relative extension prompts
    for (const key of knownPrompts) {
      if (prompts.has(key)) {
        const prompt = prompts.get(key);
        if (prompt.position) {
          await injectToMain(prompt, prompt.position);
        }
      }
    }

    // Other relative extension prompts
    for (const prompt of prompts.collection.filter(p => p.extension && p.position)) {
      await injectToMain(prompt, prompt.position);
    }

    // Pre-allocation of tokens for tool data
    if (ToolManager.canPerformToolCalls(type)) {
      const toolData = {};
      await ToolManager.registerFunctionToolsOpenAI(toolData);
      const toolMessage = [{ role: 'user', content: JSON.stringify(toolData) }];
      const toolTokens = await tokenHandler.countAsync(toolMessage);
      chatCompletion.reserveBudget(toolTokens);
    }

    // Displace the message to be continued from its original position before performing in-chat injections
    // In case if it is an assistant message, we want to prepend the users assistant prefill on the message
    if (type === 'continue' && oai_settings.continue_prefill && messages.length) {
      const chatMessage = messages.shift();
      const isAssistantRole = chatMessage.role === 'assistant';
      const supportsAssistantPrefill = oai_settings.chat_completion_source === chat_completion_sources.CLAUDE;
      const namesInCompletion = oai_settings.names_behavior === character_names_behavior.COMPLETION;
      const assistantPrefill =
        isAssistantRole && supportsAssistantPrefill ? substituteParams(oai_settings.assistant_prefill) : '';
      const messageContent = [assistantPrefill, chatMessage.content].filter(x => x).join('\n\n');
      const continueMessage = await Message.createAsync(chatMessage.role, messageContent, 'continuePrefill');
      chatMessage.name &&
        namesInCompletion &&
        (await continueMessage.setName(promptManager.sanitizeName(chatMessage.name)));
      controlPrompts.add(continueMessage);
      chatCompletion.reserveBudget(continueMessage);
    }

    // Add in-chat injections
    messages = await populationInjectionPrompts(absolutePrompts, messages);

    // Decide whether dialogue examples should always be added
    if (power_user.pin_examples) {
      await populateDialogueExamples(prompts, chatCompletion, messageExamples);
      await populateChatHistory(messages, prompts, chatCompletion, type, cyclePrompt);
    } else {
      await populateChatHistory(messages, prompts, chatCompletion, type, cyclePrompt);
      await populateDialogueExamples(prompts, chatCompletion, messageExamples);
    }

    chatCompletion.freeBudget(controlPrompts);
    if (controlPrompts.collection.length) chatCompletion.add(controlPrompts);
  }

  async function preparePromptsForChatCompletion({
    scenario,
    charPersonality,
    name2,
    worldInfoBefore,
    worldInfoAfter,
    charDescription,
    quietPrompt,
    bias,
    extensionPrompts,
    systemPromptOverride,
    jailbreakPromptOverride,
    type,
  }) {
    const scenarioText =
      scenario && oai_settings.scenario_format ? substituteParams(oai_settings.scenario_format) : scenario || '';
    const charPersonalityText =
      charPersonality && oai_settings.personality_format
        ? substituteParams(oai_settings.personality_format)
        : charPersonality || '';
    const groupNudge = substituteParams(oai_settings.group_nudge_prompt);
    const impersonationPrompt = oai_settings.impersonation_prompt
      ? substituteParams(oai_settings.impersonation_prompt)
      : '';

    // Create entries for system prompts
    const systemPrompts = [
      // Ordered prompts for which a marker should exist
      { role: 'system', content: formatWorldInfo(worldInfoBefore), identifier: 'worldInfoBefore' },
      { role: 'system', content: formatWorldInfo(worldInfoAfter), identifier: 'worldInfoAfter' },
      { role: 'system', content: charDescription, identifier: 'charDescription' },
      { role: 'system', content: charPersonalityText, identifier: 'charPersonality' },
      { role: 'system', content: scenarioText, identifier: 'scenario' },
      // Unordered prompts without marker
      { role: 'system', content: impersonationPrompt, identifier: 'impersonate' },
      { role: 'system', content: quietPrompt, identifier: 'quietPrompt' },
      { role: 'system', content: groupNudge, identifier: 'groupNudge' },
      { role: 'assistant', content: bias, identifier: 'bias' },
    ];

    // Tavern Extras - Summary
    const summary = extensionPrompts['1_memory'];
    if (summary && summary.value && getPromptPosition(summary.position) && (!summary.filter || await summary.filter()))
      systemPrompts.push({
        role: getPromptRole(summary.role),
        content: summary.value,
        identifier: 'summary',
        position: getPromptPosition(summary.position),
      });

    // Authors Note
    const authorsNote = extensionPrompts['2_floating_prompt'];
    if (authorsNote && authorsNote.value && getPromptPosition(authorsNote.position) && (!authorsNote.filter || await authorsNote.filter()))
      systemPrompts.push({
        role: getPromptRole(authorsNote.role),
        content: authorsNote.value,
        identifier: 'authorsNote',
        position: getPromptPosition(authorsNote.position),
      });

    // Vectors Memory
    const vectorsMemory = extensionPrompts['3_vectors'];
    if (vectorsMemory && vectorsMemory.value && getPromptPosition(vectorsMemory.position) && (!vectorsMemory.filter || await vectorsMemory.filter()))
      systemPrompts.push({
        role: 'system',
        content: vectorsMemory.value,
        identifier: 'vectorsMemory',
        position: getPromptPosition(vectorsMemory.position),
      });

    const vectorsDataBank = extensionPrompts['4_vectors_data_bank'];
    if (vectorsDataBank && vectorsDataBank.value && getPromptPosition(vectorsDataBank.position) && (!vectorsDataBank.filter || await vectorsDataBank.filter()))
      systemPrompts.push({
        role: getPromptRole(vectorsDataBank.role),
        content: vectorsDataBank.value,
        identifier: 'vectorsDataBank',
        position: getPromptPosition(vectorsDataBank.position),
      });

    // Smart Context (ChromaDB)
    const smartContext = extensionPrompts.chromadb;
    if (smartContext && smartContext.value && getPromptPosition(smartContext.position) && (!smartContext.filter || await smartContext.filter()))
      systemPrompts.push({
        role: 'system',
        content: smartContext.value,
        identifier: 'smartContext',
        position: getPromptPosition(smartContext.position),
      });

    // Persona Description
    if (
      power_user.persona_description &&
      power_user.persona_description_position === persona_description_positions.IN_PROMPT
    ) {
      systemPrompts.push({ role: 'system', content: power_user.persona_description, identifier: 'personaDescription' });
    }

    const knownExtensionPrompts = [
      '1_memory',
      '2_floating_prompt',
      '3_vectors',
      '4_vectors_data_bank',
      'chromadb',
      'PERSONA_DESCRIPTION',
      'QUIET_PROMPT',
      'DEPTH_PROMPT',
    ];

    // Anything that is not a known extension prompt
    for (const key in extensionPrompts) {
      if (Object.hasOwn(extensionPrompts, key)) {
        const prompt = extensionPrompts[key];
        if (knownExtensionPrompts.includes(key)) continue;
        if (!extensionPrompts[key].value) continue;
        if (![extension_prompt_types.BEFORE_PROMPT, extension_prompt_types.IN_PROMPT].includes(prompt.position))
          continue;

        const hasFilter = typeof prompt.filter === 'function';
        if (hasFilter && !(await prompt.filter())) continue;

        systemPrompts.push({
          identifier: key.replace(/\W/g, '_'),
          position: getPromptPosition(prompt.position),
          role: getPromptRole(prompt.role),
          content: prompt.value,
          extension: true,
        });
      }
    }

    // This is the prompt order defined by the user
    const prompts = promptManager.getPromptCollection(type);

    // Merge system prompts with prompt manager prompts
    systemPrompts.forEach(prompt => {
      const collectionPrompt = prompts.get(prompt.identifier);

      // Apply system prompt role/depth overrides if they set in the prompt manager
      if (collectionPrompt) {
        // In-Chat / Relative
        prompt.injection_position = collectionPrompt.injection_position ?? prompt.injection_position;
        // Depth for In-Chat
        prompt.injection_depth = collectionPrompt.injection_depth ?? prompt.injection_depth;
        // Priority for In-Chat
        prompt.injection_order = collectionPrompt.injection_order ?? prompt.injection_order;
        // Role (system, user, assistant)
        prompt.role = collectionPrompt.role ?? prompt.role;
      }

      const newPrompt = promptManager.preparePrompt(prompt);
      const markerIndex = prompts.index(prompt.identifier);

      if (-1 !== markerIndex) prompts.collection[markerIndex] = newPrompt;
      else prompts.add(newPrompt);
    });

    // Apply character-specific main prompt
    const systemPrompt = prompts.get('main') ?? null;
    const isSystemPromptDisabled = promptManager.isPromptDisabledForActiveCharacter('main');
    if (systemPromptOverride && systemPrompt && systemPrompt.forbid_overrides !== true && !isSystemPromptDisabled) {
      const mainOriginalContent = systemPrompt.content;
      systemPrompt.content = systemPromptOverride;
      const mainReplacement = promptManager.preparePrompt(systemPrompt, mainOriginalContent);
      prompts.override(mainReplacement, prompts.index('main'));
    }

    // Apply character-specific jailbreak
    const jailbreakPrompt = prompts.get('jailbreak') ?? null;
    const isJailbreakPromptDisabled = promptManager.isPromptDisabledForActiveCharacter('jailbreak');
    if (
      jailbreakPromptOverride &&
      jailbreakPrompt &&
      jailbreakPrompt.forbid_overrides !== true &&
      !isJailbreakPromptDisabled
    ) {
      const jbOriginalContent = jailbreakPrompt.content;
      jailbreakPrompt.content = jailbreakPromptOverride;
      const jbReplacement = promptManager.preparePrompt(jailbreakPrompt, jbOriginalContent);
      prompts.override(jbReplacement, prompts.index('jailbreak'));
    }

    return prompts;
  }

  const completion = new ChatCompletion();
  completion.setTokenBudget(oai_settings.openai_max_context, oai_settings.openai_max_tokens);
  const prompts = await preparePromptsForChatCompletion(requestData);
  await populateChatCompletion(prompts, completion, requestData);
  if (oai_settings.squash_system_messages) await completion.squashSystemMessages();
  return completion.getChat();
}
