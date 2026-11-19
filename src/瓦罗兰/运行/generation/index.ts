import type { NativeModules } from './native';
import { prepareRequestData } from './data';
import { preparePreset } from './preset';
import { sendResponse } from './response';
import { randomUUID } from '../browser-crypto';
import type { PromptRequestContext } from '../prompt-context';

/** Generation state belongs to this card instance. No shared Helper once listeners or host patches are installed. */
export function createCardGeneration(native: NativeModules) {
  const controllers = new Map<string, AbortController>();
  const { eventSource, event_types } = native.script;

  function stop(id: string) {
    const controller = controllers.get(id);
    if (!controller) return false;
    controller.abort(new Error('生成已取消'));
    return true;
  }

  async function generate(config: GenerateConfig, context?: PromptRequestContext): Promise<string> {
    const request = { ...config, generation_id: config.generation_id ?? randomUUID() };
    const id = request.generation_id;
    if (controllers.has(id)) throw Error(`生成请求正在执行 ${id}`);
    const controller = new AbortController();
    controllers.set(id, controller);
    const onStopped = (stoppedId?: string) => {
      if (stoppedId === id || (stoppedId === undefined && !request.should_silence)) controller.abort(new Error('生成已取消'));
    };
    eventSource.on(event_types.GENERATION_STOPPED, onStopped);
    try {
      await eventSource.emit('js_generation_requested', id, 'generate', request);
      controller.signal.throwIfAborted();
      await eventSource.emit(event_types.GENERATION_AFTER_COMMANDS, 'normal', {}, false);
      controller.signal.throwIfAborted();
      const data = await prepareRequestData(native, request, context, controller.signal);
      controller.signal.throwIfAborted();
      const prompt = await preparePreset(native, data);
      controller.signal.throwIfAborted();
      const generated = { prompt };
      await eventSource.emit(event_types.GENERATE_AFTER_DATA, generated, false);
      controller.signal.throwIfAborted();
      await eventSource.emit('js_generation_started', id);
      const message = await sendResponse(native, generated.prompt, request, controller.signal, {
        settings: data.settings, tokenizerModel: data.tokenizerModel, scenario: data.scenario,
        stoppingStrings: data.stoppingStrings,
      });
      controller.signal.throwIfAborted();
      const completed = { message };
      await eventSource.emit('js_generation_before_end', completed, id);
      controller.signal.throwIfAborted();
      // Helper's public ended listeners own its temporary injections, without checking the id.
      // This request returns directly to the card runtime; it must not consume those listeners.
      return completed.message;
    } finally {
      eventSource.removeListener(event_types.GENERATION_STOPPED, onStopped);
      controllers.delete(id);
    }
  }

  return { generate, stop };
}
