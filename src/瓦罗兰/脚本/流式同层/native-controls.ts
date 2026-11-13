import { isCommittedCandidate } from '../../运行/committed-candidate';

type NativeRuntime = {
  send: (text: string, append?: boolean, intent?: undefined, onSent?: () => void) => Promise<void>;
  messageAction: (action: string, id: number, text?: string) => Promise<void>;
};

type NativeControls = {
  doc: Document;
  host: Window;
  chat: string;
  currentChat: () => string | null | undefined;
  runtime: () => NativeRuntime | undefined;
  ready: () => boolean;
  message: (id: number) =>
    | {
        message_id: number;
        role: string;
        swipe_id?: number;
        swipes?: string[];
        swipes_data?: { stat_data?: unknown }[];
      }
    | undefined;
  lastMessage: () => { message_id: number; role: string; swipe_id?: number; swipes?: string[] } | undefined;
  hasPending: () => boolean;
  error: (message: string) => void;
};

/** Capture only actions that can write a Chengwan chat. Existing native swipe candidates keep Tavern's handler. */
export function installNativeControls(options: NativeControls) {
  const { doc, host } = options;
  let disposed = false;
  let sending = false;
  const active = () => !disposed && options.currentChat() === options.chat;
  const block = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const recovery = () => {
    const old = doc.getElementById('cw-native-recovery');
    if (options.ready() || !active()) {
      old?.remove();
      return;
    }
    if (old) return;
    const anchor = doc.getElementById('send_textarea');
    if (!anchor) return;
    const banner = doc.createElement('div');
    banner.id = 'cw-native-recovery';
    banner.setAttribute('role', 'alert');
    banner.style.cssText = 'padding:8px;margin:5px 0;background:#493019;color:white;border-radius:6px';
    banner.append('瓦洛兰结算服务或 MVU 尚未就绪，消息未发送。稍候重试，或 ');
    const retry = doc.createElement('button');
    retry.type = 'button';
    retry.textContent = '重新加载酒馆';
    retry.addEventListener('click', () => host.location.reload());
    banner.append(retry);
    anchor.parentElement?.insertBefore(banner, anchor);
  };
  const fail = (error: unknown) => options.error(String(error));
  const invoke = (action: () => Promise<void>) => void action().catch(fail);
  const submit = () => {
    const input = doc.getElementById('send_textarea') as HTMLTextAreaElement | null;
    const runtime = options.runtime();
    if (!input || !runtime || sending) return;
    const original = input.value;
    const text = original;
    if (!text.trim()) return;
    sending = true;
    invoke(async () => {
      try {
        await runtime.send(text, true, undefined, () => {
          const currentInput = doc.getElementById('send_textarea') as HTMLTextAreaElement | null;
          if (currentInput?.isConnected && currentInput.value === original) {
            currentInput.value = '';
            currentInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
        });
      } finally {
        sending = false;
      }
    });
  };
  const click = (event: Event) => {
    if (!active()) return;
    const button = (event.target as Element | null)?.closest(
      '#send_but, #option_regenerate, #option_continue, #mes_continue, .swipe_right, .swipe_left, .mes_edit_done, .mes_edit_delete',
    );
    if (!button) return;
    if (button.matches('.swipe_left, .swipe_right')) {
      const floor = button.closest('.mes');
      const id = Number(floor?.getAttribute('mesid'));
      const message = Number.isInteger(id) ? options.message(id) : undefined;
      const size = message?.swipes?.length ?? 1;
      const next = button.matches('.swipe_right') && message && (message.swipe_id ?? 0) >= size - 1;
      const target = button.matches('.swipe_right')
        ? (message?.swipe_id ?? 0) + 1
        : ((message?.swipe_id ?? 0) - 1 + size) % size;
      const candidate = message?.swipes_data?.[target]?.stat_data;
      const committed = isCommittedCandidate(candidate, id, target);
      if (!options.ready() || options.hasPending() || next || !message || !committed) {
        block(event);
        options.error(
          !options.ready()
            ? '瓦洛兰服务未就绪，请使用下方恢复入口'
            : options.hasPending()
              ? '请先重试或取消待更新记录，再切换分支'
              : next
                ? '新候选请使用“重生成”，避免酒馆原生生成绕过变量结算'
                : '此旧候选没有已结算变量，不能作为当前分支',
        );
        recovery();
      }
      return;
    }
    if (button.matches('.mes_edit_done')) {
      const id = Number(button.closest('.mes')?.getAttribute('mesid'));
      const last = options.lastMessage();
      if (options.ready() && !options.hasPending() && Number.isInteger(id) && id === last?.message_id) return;
      block(event);
      options.error('请先处理待更新记录或删除后续楼层，再保存本楼编辑');
      recovery();
      return;
    }
    block(event);
    if (!options.ready()) {
      options.error('瓦洛兰结算服务或 MVU 尚未就绪，消息未发送；请使用输入框旁的恢复入口');
      recovery();
      return;
    }
    const runtime = options.runtime();
    if (!runtime) return;
    if (button.id === 'send_but') return submit();
    if (button.matches('.mes_edit_delete')) {
      const id = Number(button.closest('.mes')?.getAttribute('mesid'));
      if (Number.isInteger(id) && host.confirm('删除此楼及其后续楼层，并回到上一已结算状态？'))
        invoke(() => runtime.messageAction('delete', id));
      return;
    }
    const last = options.lastMessage();
    if (button.id === 'option_regenerate' && last?.role === 'user') {
      invoke(() => runtime.messageAction('player_send', last.message_id));
      return;
    }
    if (!last || last.role !== 'assistant' || last.message_id === 0) {
      options.error('请先完成一轮瓦洛兰剧情');
      return;
    }
    if (button.id === 'option_continue' || button.id === 'mes_continue')
      invoke(() => runtime.messageAction('continue', last.message_id));
    else invoke(() => runtime.messageAction('regenerate', last.message_id));
  };
  const keydown = (event: KeyboardEvent) => {
    if (
      !active() ||
      (event.target as Element | null)?.id !== 'send_textarea' ||
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.isComposing ||
      event.keyCode === 229
    )
      return;
    block(event);
    if (event.repeat) return;
    if (!options.ready()) {
      options.error('瓦洛兰结算服务或 MVU 尚未就绪，消息未发送；请使用输入框旁的恢复入口');
      recovery();
    } else submit();
  };
  doc.addEventListener('click', click, true);
  doc.addEventListener('keydown', keydown, true);
  const timer = host.setInterval(recovery, 500);
  recovery();
  return () => {
    disposed = true;
    host.clearInterval(timer);
    doc.removeEventListener('click', click, true);
    doc.removeEventListener('keydown', keydown, true);
    doc.getElementById('cw-native-recovery')?.remove();
  };
}
