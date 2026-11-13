import { createScriptIdIframe, teleportStyle } from '@util/script';
import type { App } from 'vue';

/** 正文流来自 Runtime；宿主分页时桌面也可以挂在聊天容器内。 */
export function mountDesktop(doc: Document, creator: () => App, active: () => boolean = () => true) {
  let stopped = false;
  let frame: HTMLIFrameElement | undefined;
  let wrapper: HTMLDivElement | undefined;
  let app: App | undefined;
  let styles: ReturnType<typeof teleportStyle> | undefined;

  const dispose = () => {
    if (frame) $(frame).off('load.cwDesktop');
    try {
      app?.unmount();
    } finally {
      styles?.destroy();
      wrapper?.remove();
      frame = undefined;
      wrapper = undefined;
      app = undefined;
      styles = undefined;
    }
  };

  return {
    render() {
      if (stopped || !active()) return;
      const chat = doc.getElementById('chat');
      const floor = chat?.querySelector(':scope > .mes[mesid="0"]');
      if (frame?.isConnected && (floor?.contains(frame) || wrapper?.parentElement === chat)) return;
      dispose();
      const text = floor?.querySelector('.mes_text');
      if (!chat || (!text && !chat.querySelector(':scope > .mes'))) return;
      wrapper = doc.createElement('div');
      wrapper.className = 'mes_streaming';
      const $frame = createScriptIdIframe().attr('id', 'cw-streaming-floor-0');
      const current = $frame[0];
      frame = current;
      $frame.one('load.cwDesktop', errorCatched(() => {
        if (stopped || frame !== current || !active()) return;
        styles = teleportStyle(current.contentDocument!.head);
        app = creator();
        app.mount(current.contentDocument!.body);
      }));
      wrapper.append(current);
      if (text) text.after(wrapper);
      else chat.prepend(wrapper);
    },
    unmount() {
      stopped = true;
      dispose();
    },
  };
}
