import { createApp } from 'vue';
import { createPinia, disposePinia } from 'pinia';
import { waitUntil } from 'async-wait-until';
import { mountDesktop } from './desktop-mount';
import App from '../../界面/桌面端/App.vue';
import { useChengwanStore } from '../../界面/store';
import { RuntimeKey } from '../../运行/host';
import { connectRuntime } from '../../运行/bridge';
import { randomUUID } from '../../运行/browser-crypto';
import { installNativeControls } from './native-controls';
import { installDesktopSizing } from '../../界面/桌面端/utils/desktop-sizing';
import '../../界面/桌面端/styles/theme.scss';
import '../../界面/桌面端/styles/typography.scss';
import '../../界面/桌面端/styles/common.scss';

/** Keep one desktop in the active chat, including when the native history is paginated. */
$(() => {
  const host = window.parent as any,
    doc = host.document as Document;
  const token = randomUUID();
  const chat = SillyTavern.getCurrentChatId();
  let stopped = false;
  let mount: ReturnType<typeof mountDesktop> | undefined;
  let recovering = false;
  let lastRenderCheck = 0;
  let lastFrame: HTMLIFrameElement | null = null;
  const trace = (event: string) => {
    let entries: { at: number; event: string; floor0: boolean; frame: boolean }[] = [];
    try {
      entries = JSON.parse(doc.body.getAttribute('data-cw-frontend-trace') || '[]');
    } catch {
      /* ignore stale trace */
    }
    entries.push({
      at: Date.now(),
      event,
      floor0: !!doc.querySelector('#chat > .mes[mesid="0"]'),
      frame: !!doc.getElementById('cw-streaming-floor-0'),
    });
    doc.body.setAttribute('data-cw-frontend-trace', JSON.stringify(entries.slice(-12)));
  };
  const removeNativeControls = installNativeControls({
    doc,
    host,
    chat,
    currentChat: () => SillyTavern.getCurrentChatId(),
    runtime: () => host.__chengwanService?.runtime,
    ready: () => !!host.__chengwanService?.ready && host.__chengwanService.chat === chat && typeof Mvu !== 'undefined',
    message: id => getChatMessages(id, { include_swipes: true })[0],
    lastMessage: () => getChatMessages(-1, { include_swipes: true })[0],
    hasPending: () => {
      const saved = getVariables({ type: 'chat' });
      return !!(saved.澄湾待更新正文 || saved.澄湾待更新手机 || saved.澄湾失败请求 || saved.澄湾待确认提交);
    },
    error: message => toastr.error(message),
  });
  const style = $('<style>')
    .attr('data-chengwan-layer', token)
    .text(
      `
    body.cw-layer-ready #chat > .mes:not([mesid="0"]) { display:none !important; }
    body.cw-layer-ready #chat > .mes[mesid="0"] .mes_text:not(:has(textarea)) { display:none !important; }
    #chat .mes_streaming:has(#cw-streaming-floor-0) {padding:0 !important;width:100%;}
    #cw-streaming-floor-0 {display:block;width:100%;border:0;}
    #chat > .mes[mesid="0"]:has(.mes_text textarea) #cw-streaming-floor-0 {display:none;}
  `,
    )
    .appendTo(doc.head);
  const sync = async () => {
    if (stopped || chat !== SillyTavern.getCurrentChatId() ||
        (mount && host.__chengwanScriptFrontendActive !== token) || recovering) return;
    recovering = true;
    try {
      const now = Date.now();
      if (!mount) return;
      if (!doc.getElementById('cw-streaming-floor-0') || now - lastRenderCheck >= 3000) {
        mount.render();
        lastRenderCheck = now;
      }
      const frame = doc.getElementById('cw-streaming-floor-0') as HTMLIFrameElement | null;
      const ready = !!frame?.contentDocument?.querySelector('.cw-desktop-shell') && !!host.__chengwanService?.ready;
      if (ready && frame?.contentDocument && frame !== lastFrame) {
        frame.contentDocument.documentElement.lang = 'zh-CN';
        lastFrame = frame;
      }
      if (host.__chengwanFrontendReady !== ready) trace(`ready:${ready}`);
      host.__chengwanFrontendReady = ready;
      if (doc.body.classList.contains('cw-layer-ready') !== ready) $(doc.body).toggleClass('cw-layer-ready', ready);
    } finally {
      recovering = false;
    }
  };
  const timer = setInterval(() => void errorCatched(sync)(), 500);
  void errorCatched(async () => {
    await waitGlobalInitialized('Mvu');
    await waitUntil(
      () => stopped || chat !== SillyTavern.getCurrentChatId() || (
        _.has(getVariables({ type: 'message', message_id: 0 }), 'stat_data') &&
        host.__chengwanService?.ready &&
        host.__chengwanService.chat === chat),
      { timeout: Infinity },
    );
    if (stopped || chat !== SillyTavern.getCurrentChatId()) return;
    // Older refresh:none writes and deletes can leave missing or ghost native nodes.
    // Rebuild once when the DOM no longer represents the active chat data.
    const lastId = getLastMessageId();
    const nativeIds = [...doc.querySelectorAll('#chat > .mes')].map(element => Number(element.getAttribute('mesid')));
    if (
      nativeIds.some(id => !Number.isInteger(id) || id < 0 || id > lastId) ||
      new Set(nativeIds).size !== nativeIds.length ||
      (lastId > 0 && !nativeIds.includes(lastId))
    ) {
      await SillyTavern.reloadCurrentChat();
    }
    if (stopped || chat !== SillyTavern.getCurrentChatId()) return;
    host.__chengwanScriptFrontendActive = token;
    mount = mountDesktop(
      doc,
      () => {
        const connection = connectRuntime(host.__chengwanService.runtime);
        const pinia = createPinia();
        useChengwanStore(pinia).bind(connection.runtime);
        const app = createApp(App).use(pinia).provide(RuntimeKey, connection.runtime);
        const mountApp = app.mount.bind(app);
        let stopSizing: (() => void) | undefined;
        app.mount = (target, ...args) => {
          const body = target as HTMLElement;
          const root = body.ownerDocument.createElement('div');
          root.className = 'cw-frame-root';
          body.append(root);
          stopSizing = installDesktopSizing(root, height => {
            const frame = doc.getElementById('cw-streaming-floor-0') as HTMLIFrameElement | null;
            if (frame) frame.style.height = height + 'px';
          });
          return mountApp(root, ...args);
        };
        trace('mount');
        const unmount = app.unmount.bind(app);
        app.unmount = () => {
          trace('unmount');
          stopSizing?.();
          try {
            unmount();
          } catch (e) {
            console.warn('[流式同层] app.unmount error ignored:', e);
          }
          connection.disconnect();
          disposePinia(pinia);
        };
        return app;
      },
      () => !stopped && chat === SillyTavern.getCurrentChatId() &&
        host.__chengwanScriptFrontendActive === token && host.__chengwanService?.ready &&
        host.__chengwanService.chat === chat,
    );
    await sync();
    console.info('[瓦洛兰-流式同层] 桌面挂载完成，保留原布局，尺寸由容器宽度确定');
  })().catch(e => {
    console.error('[瓦洛兰-流式同层] 挂载失败', e);
    toastr.error('瓦洛兰前端挂载失败：' + String(e));
  });
  const onChatChanged = () => {
    if (!stopped && SillyTavern.getCurrentChatId() !== chat) {
      dispose();
      window.location.reload();
    }
  };
  eventOn(tavern_events.CHAT_CHANGED, onChatChanged);
  const dispose = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    eventRemoveListener(tavern_events.CHAT_CHANGED, onChatChanged);
    try {
      mount?.unmount();
    } catch (e) {
      console.warn('[流式同层] mount.unmount error ignored:', e);
    }
    if (host.__chengwanScriptFrontendActive === token) {
      delete host.__chengwanScriptFrontendActive;
      host.__chengwanFrontendReady = false;
      $(doc.body).removeClass('cw-layer-ready');
    }
    removeNativeControls();
    style.remove();
  };
  $(window).one('pagehide.cwLayer', dispose);
});
