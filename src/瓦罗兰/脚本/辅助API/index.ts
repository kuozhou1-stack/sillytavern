import { waitUntil } from 'async-wait-until';
import { createRuntime, type Runtime } from '../../运行/host';
import { watch, type WatchStopHandle } from 'vue';

$(() => {
  const host = window.parent as any;
  const chat = SillyTavern.getCurrentChatId();
  let stopped = false;
  let runtime: Runtime | undefined;
  const slot = { chat, runtime, ready: false };
  let unwatch: WatchStopHandle | undefined;
  $(window).one('pagehide.cwApi', () => {
    stopped = true;
    slot.ready = false;
    unwatch?.();
    void runtime?.dispose();
    void eventEmit('chengwan:runtime_changed');
    if (host.__chengwanService === slot) {
      delete host.__chengwanService;
      delete host.__chengwanRuntime;
    }
  });
  void errorCatched(async () => {
    const old = host.__chengwanService;
    if (old?.ready && old?.runtime) await old.runtime.dispose();
    if (stopped || chat !== SillyTavern.getCurrentChatId()) return;
    host.__chengwanService = slot;
    await waitGlobalInitialized('Mvu');
    await waitUntil(
      () => stopped || chat !== SillyTavern.getCurrentChatId() ||
        (getLastMessageId() >= 0 && _.has(getVariables({ type: 'message', message_id: 0 }), 'stat_data')),
      { timeout: Infinity },
    );
    if (stopped || chat !== SillyTavern.getCurrentChatId()) return;
    runtime = createRuntime();
    slot.runtime = runtime;
    await runtime.start();
    if (stopped) {
      await runtime.dispose();
      return;
    }
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
    console.error('[瓦洛兰-辅助API] 启动失败', String(e));
    void runtime?.dispose();
  });
});
