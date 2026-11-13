<template>
  <div ref="container" class="cw-message-content mes_text" :data-cw-message-id="id >= 0 ? id : undefined" />
</template>
<script setup lang="ts">
import { inject, onMounted, onUnmounted, ref, watch } from 'vue';
import { RuntimeKey } from '../../../../运行/host';
import { randomUUID } from '../../../../运行/browser-crypto';
import { displayedMessage, displayedNarrative, isHtmlWidget } from '../../utils/message-display';
import { mountMessageFrame } from '../../utils/message-frame';
const props = defineProps<{ content: string; id: number; role?: 'user' | 'assistant'; incomplete?: boolean }>();
const runtime = inject(RuntimeKey, null),
  container = ref<HTMLElement>();
let previous: string | undefined;
let stopFrames: (() => void)[] = [];
const boundary = `cw-message-${randomUUID()}`;
let styleBoundary: HTMLElement | undefined;
function render() {
  if (!container.value) return;
  if (props.role === 'user' && /<(?:UpdateVariable|StatusPlaceHolderImpl)\b/i.test(props.content)) {
    stopFrames.forEach(stop => stop());
    stopFrames = [];
    previous = undefined;
    container.value.classList.add('cw-player-original');
    container.value.textContent = props.content;
    return;
  }
  container.value.classList.remove('cw-player-original');
  const doc = container.value.ownerDocument;
  // Keep the original chat message untouched for external scripts. Only the UI copy
  // omits a genuine terminal protocol block and treats malformed patches as text.
  const visible = props.role === 'user' ? props.content : displayedNarrative(props.content);
  let html: string;
  try {
    if (!runtime) throw Error('offline');
    if (/<UpdateVariable\b/i.test(visible)) throw Error('patch must be displayed as text');
    ({ html } = displayedMessage(visible, props.id));
  } catch (error) {
    if (runtime && !/<UpdateVariable\b/i.test(visible)) console.warn('[瓦洛兰正文] 酒馆格式化失败', props.id, error);
    const safe = doc.createElement('div');
    safe.textContent = visible;
    html = safe.innerHTML.replace(/\n/g, '<br>');
  }
  const signature = `${props.id}:${props.incomplete}:${html}`;
  if (previous === signature) return;
  previous = signature;
  stopFrames.forEach(stop => stop());
  stopFrames = [];
  const content = doc.createElement('div');
  content.innerHTML = html;
  // External Tavern extensions scan iframe documents with selectors/TreeWalker.
  // Keep narrative in ordinary DOM; only executable HTML widgets need an iframe.
  // Scope inline CSS from display regexes so it cannot hide the surrounding UI.
  // Keep Tavern's .mes > .mes_block > .mes_text hierarchy. Extensions use
  // mes_text.parentElement.parentElement to locate the saved message.
  // The CSS boundary belongs on its parent so formatter-prefixed .mes_text
  // selectors can still match the narrative root inside the scope.
  styleBoundary = container.value.parentElement ?? container.value;
  styleBoundary.setAttribute('data-cw-style-boundary', boundary);
  for (const style of content.querySelectorAll<HTMLStyleElement>('style')) {
    style.textContent = `@scope ([data-cw-style-boundary="${boundary}"]) {${style.textContent ?? ''}}`;
  }
  // Render widgets in the visible message, with a document boundary around their CSS.
  // Variable/protocol values are data and must never become executable widgets.
  if (!/<UpdateVariable\b/i.test(visible)) {
    for (const code of content.querySelectorAll<HTMLElement>('pre > code')) {
      if (
        code.closest('.cw-variable-status, .cw-variable-update, .rp-variable-update, [data-variable-disclosure]') ||
        !isHtmlWidget(code)
      )
        continue;
      if (props.incomplete) {
        const pending = doc.createElement('p');
        pending.textContent = '交互内容尚未生成完成…';
        code.parentElement!.replaceWith(pending);
        continue;
      }
      const frame = doc.createElement('iframe');
      stopFrames.push(mountMessageFrame(frame, code.textContent ?? '', props.id));
      code.parentElement!.replaceWith(frame);
    }
  }
  container.value.replaceChildren(...content.childNodes);
}
onMounted(render);
watch(
  () => [
    props.content,
    props.id,
    props.role,
    props.incomplete,
    runtime?.view.messages.at(-1)?.id,
    runtime?.view.data?._系统.数据版本,
  ],
  render,
);
onUnmounted(() => {
  stopFrames.forEach(stop => stop());
  if (styleBoundary?.getAttribute('data-cw-style-boundary') === boundary)
    styleBoundary.removeAttribute('data-cw-style-boundary');
});
</script>

<style>
.cw-message-content {
  display: block;
  min-width: 0;
  overflow-wrap: anywhere;
  white-space: normal;
}
.cw-message-content .cw-external-frame {
  display: block;
  width: 100%;
  border: 0;
  height: 100px;
}
:where(.cw-message-content).mes_text {
  color: var(--cw-text-primary);
  font: inherit;
  line-height: var(--cw-line-height-body);
  letter-spacing: var(--cw-letter-spacing-body);
  min-width: 0;
  overflow-wrap: anywhere;
  white-space: normal;
}
:where(.cw-message-content).mes_text.cw-player-original {
  white-space: pre-wrap;
}
:where(.cw-message-content).mes_text p {
  margin: 0 0 var(--cw-paragraph-margin);
}
:where(.cw-message-content).mes_text > :first-child {
  margin-top: 0;
}
:where(.cw-message-content).mes_text > :last-child {
  margin-bottom: 0;
}
:where(.cw-message-content).mes_text q {
  quotes: none;
}
:where(.cw-message-content).mes_text q::before,
:where(.cw-message-content).mes_text q::after {
  content: none;
}
:where(.cw-message-content).mes_text blockquote {
  margin: 1em 0;
  padding: 0.3em 1em;
  border-left: 3px solid var(--cw-accent);
  color: var(--cw-text-secondary);
}
:where(.cw-message-content).mes_text pre {
  max-width: 100%;
  overflow: auto;
  padding: 1em;
  border-radius: 8px;
  background: var(--cw-bg-card-subtle);
  white-space: pre-wrap;
}
:where(.cw-message-content).mes_text code {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.92em;
}
:where(.cw-message-content).mes_text table {
  display: block;
  max-width: 100%;
  overflow: auto;
  border-collapse: collapse;
}
:where(.cw-message-content).mes_text th,
:where(.cw-message-content).mes_text td {
  border: 1px solid var(--cw-border);
  padding: 0.4em 0.7em;
}
:where(.cw-message-content).mes_text img,
:where(.cw-message-content).mes_text video,
:where(.cw-message-content).mes_text svg {
  max-width: 100%;
}
:where(.cw-message-content).mes_text img,
:where(.cw-message-content).mes_text video {
  height: auto;
}
:where(.cw-message-content).mes_text details {
  margin: 0.8em 0;
}
:where(.cw-message-content).mes_text summary {
  cursor: pointer;
}
:where(.cw-message-content).mes_text a {
  color: var(--cw-accent);
}
:where(.cw-message-content).mes_text ul,
:where(.cw-message-content).mes_text ol {
  padding-left: 1.7em;
}
:where(.cw-message-content).mes_text button,
:where(.cw-message-content).mes_text input,
:where(.cw-message-content).mes_text textarea,
:where(.cw-message-content).mes_text select {
  font: inherit;
}
</style>
