import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { useChengwanStore } from '../store';
import App from './App.vue';
import { installDesktopSizing } from './utils/desktop-sizing';
import { RuntimeKey } from '../../运行/host';
import { connectRuntime } from '../../运行/bridge';
import { waitUntil } from 'async-wait-until';
import './styles/theme.scss';
import './styles/typography.scss';
import './styles/common.scss';

$(() => {
  let stopped = false;
  let failed = false;
  let connection: ReturnType<typeof connectRuntime> | undefined;
  let app: ReturnType<typeof createApp> | undefined;
  const recovery = eventOn('chengwan:runtime_changed', () => {
    const service = (window.parent as any).__chengwanService;
    if (failed && service?.ready && service.chat === SillyTavern.getCurrentChatId()) window.location.reload();
  });
  const root = document.getElementById('app')!;
  const stopSizing = installDesktopSizing(root, height => {
    $(window.parent.document)
      .find('#' + CSS.escape(getIframeName()))
      .css('height', height + 'px');
  });

  $(window).one('pagehide.cwDesktop', () => {
    stopped = true;
    recovery.stop();
    stopSizing();
    try {
      app?.unmount();
    } catch (e) {
      console.warn('[桌面端] app.unmount error ignored:', e);
    }
    connection?.disconnect();
    (window.parent as any).__chengwanFrontendReady = false;
    void eventEmit('chengwan:frontend_ready');
  });

  document.getElementById('app')!.textContent = '正在连接瓦洛兰存档…';
  void errorCatched(async () => {
    await waitGlobalInitialized('Mvu');
    await waitUntil(() => stopped || _.has(getVariables({ type: 'message', message_id: getCurrentMessageId() }), 'stat_data'), {
      timeout: Infinity,
    });
    if (stopped) return;
    if (getCurrentMessageId() !== 0) throw Error('瓦洛兰界面只允许安装在第 0 层');
    await waitUntil(
      () => {
        const service = (window.parent as any).__chengwanService;
        return stopped || (service?.ready && service.chat === SillyTavern.getCurrentChatId());
      },
      { timeout: Infinity },
    );
    if (stopped) return;
    connection = connectRuntime((window.parent as any).__chengwanService.runtime);
    const runtime = connection.runtime;
    if (!runtime.view.data) throw Error(runtime.view.error || '活动状态读取失败');
    document.documentElement.lang = 'zh-CN';
    const pinia = createPinia();
    useChengwanStore(pinia).bind(runtime);
    app = createApp(App).use(pinia).provide(RuntimeKey, runtime);
    app.mount('#app');
    (window.parent as any).__chengwanFrontendReady = true;
    void eventEmit('chengwan:frontend_ready');
    console.info('[瓦洛兰-电脑端] 前端界面挂载完成');
  })().catch((error: unknown) => {
    failed = true;
    document.getElementById('app')!.textContent = '加载失败：' + String(error);
  });
});
