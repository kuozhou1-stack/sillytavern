/**
 * Request-local transport using SillyTavern's public ChatCompletionService.
 * Parameter/response behavior follows SillyTavern openai.js (AGPL-3.0) and
 * Tavern Helper responseGenerator.ts (PolyForm Noncommercial 1.0.0).
 * Sources: SillyTavern commit 51ad27fb86d39a3daca3adaa970375c9670c12df,
 * JS-Slash-Runner commit b1566767a111348aaa007e0044e786835330f884.
 */
import YAML from 'yaml';

import type { NativeModules } from './native';
import { withApiProviderError } from './provider-error';
import { applyVertexGenerationOptions, vertexTransport, type VertexRequestProfile } from '../vertex';

export type ResponseOptions = {
  settings?: Record<string, any>; tokenizerModel?: string; scenario?: string; stoppingStrings?: string[];
};

const proxySources = ['claude', 'openai', 'mistralai', 'makersuite', 'vertexai', 'deepseek', 'xai', 'zai', 'moonshot'];
const biasSources = ['openai', 'azure_openai', 'openrouter', 'electronhub', 'chutes', 'custom'];

/** Apply the pinned native provider/model rules to the request's own stop snapshot. */
function applyStoppingStrings(payload: Record<string, any>, strings: string[]) {
  const source = payload.chat_completion_source, model = payload.model;
  const gptSource = ['openai', 'azure_openai', 'openrouter'].includes(source);
  const disabled = source === 'perplexity'
    || (gptSource && model.includes('gpt') && model.includes('vision'))
    || (gptSource && /gpt-5/.test(model) && !/gpt-5-chat-latest/.test(model))
    || (['openai', 'azure_openai'].includes(source) && /^(o1|o3|o4)/.test(model))
    || (source === 'openrouter' && /^openai\/(o1|o3|o4)/.test(model))
    || (source === 'xai' && (model.includes('grok-3-mini')
      || ((model.includes('grok-4') || model.includes('grok-code')) && !model.includes('grok-4-fast-non-reasoning'))));
  if (disabled) { delete payload.stop; return; }
  const limit = ['claude', 'mistralai', 'chutes'].includes(source) ? undefined
    : ['makersuite', 'vertexai', 'cohere'].includes(source) ? 5 : source === 'zai' ? 1 : 4;
  const selected = strings.slice(0, limit);
  const stops = ['makersuite', 'vertexai'].includes(source)
    ? selected.filter(text => text.length >= 1 && text.length <= 16) : selected;
  if (stops.length) payload.stop = stops;
  else delete payload.stop;
}

// The plugin numbers native runs from zero and uses -1 for slash commands.
let nextTemplateRunId = -2;

async function evaluatePromptTemplates(native: NativeModules, messages: any[], signal: AbortSignal) {
  const template = native.host.EjsTemplate;
  if (!template) return;
  const features = template.getFeatures();
  if (!features.enabled || !features.generate_enabled) return;
  const context = await template.prepareContext({ runID: nextTemplateRunId--, runType: 'generate', generateType: 'normal', generateData: messages,
    isDryRun: false, message_id: undefined, swipe_id: undefined, is_last: undefined,
    is_user: undefined, is_system: undefined, name: undefined });
  const evaluate = (text: string) => {
    signal.throwIfAborted();
    if (!text.includes('<%')) return text;
    // prepareContext and earlier messages can await extension callbacks. Respect the
    // current execution setting immediately before handing code to the public API.
    const current = template.getFeatures();
    if (!current.enabled || !current.generate_enabled) return text;
    if (current.sandbox) {
      throw Error('提示词模板已启用沙盒，当前插件的公开接口无法在沙盒中展开本次出站 EJS。请移除或预先展开对应模板后重试。');
    }
    return template.evalTemplate(text, context);
  };
  for (const message of messages) {
    signal.throwIfAborted();
    if (typeof message.content === 'string') message.content = await evaluate(message.content);
    else if (Array.isArray(message.content)) {
      for (const content of message.content) {
        if (content.type === 'text' && typeof content.text === 'string') content.text = await evaluate(content.text);
      }
    }
  }
}

function customConnection(native: NativeModules, config?: CustomApiConfig) {
  if (!config) return;
  const custom = structuredClone(config);
  if (!custom.proxy_preset) return custom;
  const preset = native.openai.proxies.find((item: { name: string }) => item.name === custom.proxy_preset!.trim());
  if (preset) return { ...custom, apiurl: preset.url, key: preset.password ?? '' };
  console.warn('[瓦洛兰生成] 代理预设未找到，沿用本次连接', custom.proxy_preset);
  return custom;
}

function applyConnection(payload: Record<string, any>, custom: CustomApiConfig) {
  if (custom.apiurl) {
    const url = custom.apiurl.trim().replace(/\/+$/, '');
    payload.reverse_proxy = url;
    payload.proxy_password = custom.key || '';
    if (payload.chat_completion_source === 'custom') {
      payload.custom_url = url;
      if (custom.key) {
        const headers = YAML.parse(payload.custom_include_headers || '{}') ?? {};
        for (const key of Object.keys(headers)) if (key.toLowerCase() === 'authorization') delete headers[key];
        headers.Authorization = `Bearer ${custom.key}`;
        payload.custom_include_headers = YAML.stringify(headers);
      }
    }
  }
  if (custom.model) payload.model = custom.model;
  const defaults = { max_tokens: null, temperature: 1, frequency_penalty: 0, presence_penalty: 0, top_p: 1, top_k: 0 };
  for (const [key, defaultValue] of Object.entries(defaults)) {
    const value = custom[key as keyof typeof defaults] ?? 'same_as_preset';
    if (value === 'unset' || value === defaultValue) delete payload[key];
    else if (value !== 'same_as_preset') payload[key] = value;
  }
  if (custom.source === 'custom') {
    for (const key of ['custom_include_body', 'custom_exclude_body', 'custom_include_headers'] as const) {
      if (custom[key]) payload[key] = YAML.stringify(custom[key]);
    }
  }
}

export async function sendResponse(
  native: NativeModules, messages: any[], config: GenerateConfig, signal: AbortSignal,
  options: ResponseOptions = {},
): Promise<string> {
  signal.throwIfAborted();
  const settings = structuredClone(options.settings ?? native.openai.oai_settings);
  const stoppingStrings = options.stoppingStrings ?? native.powerUser.getCustomStoppingStrings();
  const custom = customConnection(native, config.custom_api);
  const vertex = (custom as (CustomApiConfig & { vertex?: VertexRequestProfile }) | undefined)?.vertex;
  const source = custom?.source ?? (custom?.apiurl ? 'openai' : settings.chat_completion_source);
  settings.chat_completion_source = source;
  const assistantPrefill = source === 'claude' ? native.script.substituteParams(settings.assistant_prefill, {
    dynamicMacros: options.scenario === undefined ? {} : { scenario: options.scenario },
  }) : undefined;
  // The native builder expands this field using the active character's scenario.
  // Supply the request expansion after parameter construction instead.
  if (source === 'claude') settings.assistant_prefill = '';
  settings.stream_openai = config.should_stream ?? false;
  const schema = config.json_schema && structuredClone(config.json_schema);
  const tools = config.tools?.length ? structuredClone(config.tools) : undefined;
  const toolChoice = config.tool_choice;
  const id = config.generation_id;
  const biasPreset = settings.bias_presets?.[settings.bias_preset_selected];
  const bias = biasSources.includes(source) && Array.isArray(biasPreset) && biasPreset.length ? biasPreset : undefined;
  const model = custom?.model || native.openai.getChatCompletionModel(settings);
  const tokenizer = bias
    ? source === 'openai' ? model : (options.tokenizerModel ?? native.tokenizers.getTokenizerModel())
    : undefined;
  const reverseProxy = settings.reverse_proxy;
  const proxyPassword = settings.proxy_password;
  // Native bias calculation and proxy validation read module globals. Keep those
  // two inputs in this request instead of consulting a later UI configuration.
  settings.bias_preset_selected = '';
  settings.reverse_proxy = '';
  const { generate_data: payload } = await native.openai.createGenerationParameters(
    settings, model, 'normal', structuredClone(messages), { jsonSchema: schema },
  );
  signal.throwIfAborted();
  applyStoppingStrings(payload, stoppingStrings);
  if (source === 'claude') payload.assistant_prefill = assistantPrefill;
  if (!vertex && reverseProxy && proxySources.includes(source)) {
    new URL(reverseProxy);
    payload.reverse_proxy = reverseProxy;
    payload.proxy_password = proxyPassword;
  }
  if (bias && Object.hasOwn(payload, 'logit_bias')) {
    const response = await native.host.fetch(`/api/backends/chat-completions/bias?model=${encodeURIComponent(tokenizer)}`, {
      method: 'POST', headers: native.script.getRequestHeaders(), body: JSON.stringify(bias), signal,
    });
    if (!response.ok) throw Error(`词元偏置计算失败（HTTP ${response.status}）`);
    const calculated = await response.json();
    if (calculated.error) throw Error(String(calculated.error.message ?? calculated.error));
    payload.logit_bias = Object.keys(calculated).length ? calculated : undefined;
  }
  if (custom) applyConnection(payload, custom);
  if (tools) {
    payload.tools = tools;
    payload.tool_choice = toolChoice ?? 'auto';
  }
  payload.include_reasoning = true;
  await evaluatePromptTemplates(native, payload.messages, signal);
  signal.throwIfAborted();
  // Resolve the short-lived credential only after building the prompt and running its hooks.
  if (vertex && custom) {
    applyVertexGenerationOptions(payload, model, vertex.vertexThinkingLevel);
    const transport = await withApiProviderError(signal, () => vertexTransport(vertex, model, signal));
    custom.key = transport.key;
    payload.chat_completion_source = 'custom';
    payload.custom_url = transport.url;
    payload.model = transport.model;
    payload.custom_include_headers = JSON.stringify({ Authorization: 'Bearer ' + transport.key });
  }
  // This public transport accepts this payload directly. It does not consume
  // another Helper request's shared CHAT_COMPLETION_SETTINGS_READY once callback.
  const send = () => native.customRequest.ChatCompletionService.sendRequest(payload, false, signal);
  const response = custom ? await withApiProviderError(signal, send, custom.key) : await send();
  signal.throwIfAborted();
  if (!payload.stream) return native.script.extractMessageFromData(response, 'openai');
  let text = '', reasoning = '';
  for await (const chunk of response()) {
    signal.throwIfAborted();
    const increment = chunk.text.slice(text.length);
    const reasoningIncrement = (chunk.state?.reasoning ?? '').slice(reasoning.length);
    text = chunk.text;
    reasoning = chunk.state?.reasoning ?? '';
    await native.script.eventSource.emit('js_stream_token_received_fully', text, id);
    await native.script.eventSource.emit('js_stream_token_received_incrementally', increment, id);
    await native.script.eventSource.emit('js_reasoning_token_received_fully', reasoning, id);
    await native.script.eventSource.emit('js_reasoning_token_received_incrementally', reasoningIncrement, id);
  }
  signal.throwIfAborted();
  return native.script.cleanUpMessage({ getMessage: text, isImpersonate: false, isContinue: false });
}
