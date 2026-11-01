import { randomUUID } from '../../../运行/browser-crypto';

type WidgetWindow = Window & typeof globalThis & Record<string, any>;
type FrameHost = Window & { __cwMessageFrames?: Record<string, (child: WidgetWindow) => void> };

/** 为已启用的 HTML 正则提供独立文档和与所在楼层一致的酒馆助手接口。 */
export function mountMessageFrame(frame: HTMLIFrameElement, html: string, messageId: number): () => void {
  const id = `cw-regex-${messageId}-${randomUUID()}`;
  const owner = frame.ownerDocument;
  const host = owner.defaultView as FrameHost;
  const listeners: EventOnReturn[] = [];
  let observer: ResizeObserver | undefined;
  let active = true;
  let resizeRequest = 0;
  frame.id = id;
  frame.title = `第 ${messageId} 楼的交互内容`;
  frame.className = 'cw-external-frame';
  frame.setAttribute('allow', 'fullscreen');
  const resize = (height: number) => {
    if (active && Number.isFinite(height) && height > 0) frame.style.height = `${Math.ceil(height)}px`;
  };
  const scheduleResize = () => {
    cancelAnimationFrame(resizeRequest);
    resizeRequest = requestAnimationFrame(() => {
      const body = frame.contentDocument?.body;
      if (body) resize(body.getBoundingClientRect().height + 2);
    });
  };
  const onResizeMessage = (event: MessageEvent) => {
    if (event.source === frame.contentWindow && event.data?.type === 'resizeIframe') resize(Number(event.data.height));
  };
  host.__cwMessageFrames ??= {};
  host.__cwMessageFrames[id] = child => {
    if (!active || child !== frame.contentWindow) return;
    Object.assign(child, TavernHelper);
    child.TavernHelper = TavernHelper;
    child.SillyTavern = SillyTavern;
    for (const key of [
      '_',
      'Vue',
      'z',
      'YAML',
      'toastr',
      'Mvu',
      'tavern_events',
      'iframe_events',
      'waitGlobalInitialized',
      'initializeGlobal',
    ]) {
      child[key] = (window as unknown as Record<string, unknown>)[key];
    }
    child.getCurrentMessageId = () => messageId;
    child.getIframeName = () => id;
    child.getAllVariables = () =>
      _.merge(
        {},
        getVariables({ type: 'global' }),
        getVariables({ type: 'character' }),
        getVariables({ type: 'chat' }),
        ...getChatMessages(`0-${messageId}`).map(message => message.data),
      );
    child.eventOn = (...args: Parameters<typeof eventOn>) => {
      eventOn(...args);
      const listener = { stop: () => eventRemoveListener(...args) };
      listeners.push(listener);
      return listener;
    };
    for (const register of ['eventOnce', 'eventMakeFirst', 'eventMakeLast'] as const) {
      child[register] = (...args: Parameters<typeof eventOn>) => {
        (window as WidgetWindow)[register](...args);
        const listener = { stop: () => eventRemoveListener(...args) };
        listeners.push(listener);
        return listener;
      };
    }
    child.errorCatched = errorCatched;
    child.addEventListener('pagehide', () => listeners.forEach(listener => listener.stop()), { once: true });
  };
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const base = doc.createElement('base');
  base.href = document.baseURI;
  const bootstrap = doc.createElement('script');
  bootstrap.textContent = `window.parent.__cwMessageFrames[${JSON.stringify(id)}](window);`;
  const jquery = doc.createElement('script');
  jquery.src = 'https://testingcf.jsdelivr.net/npm/jquery/dist/jquery.min.js';
  const baseStyle = doc.createElement('style');
  baseStyle.textContent = 'html,body{margin:0;max-width:100%;}*{box-sizing:border-box;}q{quotes:none}q::before,q::after{content:none}';
  const sharedAssets = [
    ...owner.head.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src],link[rel="stylesheet"]'),
  ]
    .filter(node =>
      /jquery-ui|jquery-ui-touch-punch|fontawesome/i.test(
        node.tagName === 'SCRIPT' ? (node as HTMLScriptElement).src : (node as HTMLLinkElement).href,
      ),
    )
    .map(node => doc.importNode(node, true));
  doc.head.prepend(base, baseStyle, bootstrap, jquery, ...sharedAssets);
  const loaded = () => {
    observer?.disconnect();
    const body = frame.contentDocument?.body;
    if (!body) return;
    observer = new ResizeObserver(scheduleResize);
    observer.observe(body);
    scheduleResize();
  };
  frame.addEventListener('load', loaded);
  host.addEventListener('message', onResizeMessage);
  frame.srcdoc = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
  return () => {
    active = false;
    observer?.disconnect();
    cancelAnimationFrame(resizeRequest);
    listeners.forEach(listener => listener.stop());
    frame.removeEventListener('load', loaded);
    host.removeEventListener('message', onResizeMessage);
    delete host.__cwMessageFrames?.[id];
    if (host.__cwMessageFrames && !Object.keys(host.__cwMessageFrames).length) delete host.__cwMessageFrames;
  };
}
