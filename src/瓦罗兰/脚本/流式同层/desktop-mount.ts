import { createScriptIdIframe, teleportStyle } from '@util/script';
import type { App } from 'vue';

/** 本卡只有零楼桌面：正文流来自 Runtime，不订阅或重发酒馆的消息渲染事件。 */
export function mountDesktop(doc: Document, creator: () => App) {
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
      if (stopped) return;
      const floor = doc.querySelector('#chat > .mes[mesid="0"]');
      // 同聊天重绘但宿主仍在时保留桌面；原生零楼被替换时才重新挂载。
      if (frame?.isConnected && floor?.contains(frame)) return;
      dispose();
      const text = floor?.querySelector('.mes_text');
      if (!text) return;
      wrapper = doc.createElement('div');
      wrapper.className = 'mes_streaming';
      const $frame = createScriptIdIframe().attr('id', 'cw-streaming-floor-0');
      const current = $frame[0];
      frame = current;
      $frame.one('load.cwDesktop', errorCatched(() => {
        if (stopped || frame !== current) return;
        styles = teleportStyle(current.contentDocument!.head);
        app = creator();
        app.mount(current.contentDocument!.body);
      }));
      wrapper.append(current);
      text.after(wrapper);
    },
    unmount() {
      stopped = true;
      dispose();
    },
  };
}
