import { waitUntil } from 'async-wait-until';
import { activeContext, createRuntime, type Runtime } from '../../运行/host';
import { Schema } from '../../schema';
import { registerPromptMacros } from '../../运行/prompt-context';
import { watch, type WatchStopHandle } from 'vue';

$(() => {
  const host = window.parent as any;
  const chat = SillyTavern.getCurrentChatId();
  let stopped = false;
  let awaitingChatChange = false;
  let runtime: Runtime | undefined;
  const slot = { chat, runtime, ready: false };
  let unwatch: WatchStopHandle | undefined;
  const unregisterPrompts = registerPromptMacros(() => Schema.parse(
    getVariables({ type: 'message', message_id: activeContext().floor }).stat_data,
  ));
  const dispose = () => {
    if (stopped) return;
    stopped = true;
    slot.ready = false;
    unwatch?.();
    unregisterPrompts();
    void runtime?.dispose().catch(error => console.error('[瓦洛兰-辅助API] 卸载失败', error));
    if (host.__chengwanService === slot) {
      delete host.__chengwanService;
      if (host.__chengwanRuntime === runtime) delete host.__chengwanRuntime;
    }
    void eventEmit('chengwan:runtime_changed');
  };
  const onChatChanged = () => {
    if ((stopped && !awaitingChatChange) || (!awaitingChatChange && chat === SillyTavern.getCurrentChatId())) return;
    const owned = host.__chengwanService === slot || (awaitingChatChange && !host.__chengwanService);
    awaitingChatChange = false;
    dispose();
    eventRemoveListener(tavern_events.CHAT_CHANGED, onChatChanged);
    if (owned) window.location.reload();
  };
  const current = () => {
    if (!stopped && chat === SillyTavern.getCurrentChatId() && host.__chengwanService === slot) return true;
    // Tavern changes the filename before loading/announcing the target chat.
    // Stop old work now, but keep the reload listener until CHAT_CHANGED arrives.
    if (!stopped && chat !== SillyTavern.getCurrentChatId() && host.__chengwanService === slot) awaitingChatChange = true;
    dispose();
    if (!awaitingChatChange) eventRemoveListener(tavern_events.CHAT_CHANGED, onChatChanged);
    return false;
  };
  // The chat can change before MVU or Runtime.start has installed any listener.
  eventOn(tavern_events.CHAT_CHANGED, onChatChanged);
  $(window).one('pagehide.cwApi', () => {
    awaitingChatChange = false;
    dispose();
    eventRemoveListener(tavern_events.CHAT_CHANGED, onChatChanged);
  });
  void errorCatched(async () => {
    const old = host.__chengwanService;
    host.__chengwanService = slot;
    if (old?.runtime && host.__chengwanRuntime === old.runtime) delete host.__chengwanRuntime;
    if (old?.runtime) await old.runtime.dispose();
    if (!current()) return;
    await waitGlobalInitialized('Mvu');
    if (!current()) return;
    await waitUntil(
      () => stopped || chat !== SillyTavern.getCurrentChatId() ||
        (getLastMessageId() >= 0 && _.has(getVariables({ type: 'message', message_id: 0 }), 'stat_data')),
      { timeout: Infinity },
    );
    if (!current()) return;
    runtime = createRuntime();
    slot.runtime = runtime;
    await runtime.start();
    if (!current()) return;
    host.__chengwanRuntime = runtime;
    slot.ready = true;
    unwatch = watch(
      () => runtime!.revision(),
      () => {
        void eventEmit('chengwan:runtime_changed');
      },
      { deep: true },
    );
    void eventEmit('chengwan:runtime_changed');
    initializeGlobal('ChengwanRuntime', runtime);
    console.info('[瓦洛兰-辅助API] 活动上下文与统一提交服务已就绪');
  })().catch(e => {
    if (!current()) return;
    console.error('[瓦洛兰-辅助API] 启动失败', String(e));
    dispose();
    eventRemoveListener(tavern_events.CHAT_CHANGED, onChatChanged);
  });
});
