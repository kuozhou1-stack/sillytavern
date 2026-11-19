<template>
  <Teleport v-if="scope" :to="scope">
    <div
      v-if="content"
      :id="tooltipId"
      ref="bubble"
      class="cw-follow-tooltip"
      role="tooltip"
      :style="{ left: position.x + 'px', top: position.y + 'px' }"
    >
      {{ content }}
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
const props = defineProps<{ scope: HTMLElement | null | undefined }>();
const tooltipId = useId();
const bubble = ref<HTMLElement | null>(null);
const content = ref('');
const position = ref({ x: 0, y: 0 });
let owner: HTMLElement | null = null;
let nativeTitle: string | null = null;
let previousDescription: string | null = null;
let pointer = { x: 0, y: 0 };
let touch = false;

function place() {
  const viewport = props.scope?.ownerDocument.defaultView;
  if (!viewport) return;
  const width = bubble.value?.offsetWidth ?? 240;
  const height = bubble.value?.offsetHeight ?? 56;
  const x = pointer.x + 14 + width <= viewport.innerWidth - 8 ? pointer.x + 14 : pointer.x - width - 14;
  const y = pointer.y + 16 + height <= viewport.innerHeight - 8 ? pointer.y + 16 : pointer.y - height - 12;
  position.value = {
    x: Math.max(8, Math.min(x, viewport.innerWidth - width - 8)),
    y: Math.max(8, Math.min(y, viewport.innerHeight - height - 8)),
  };
}
function hide() {
  if (owner) {
    if (nativeTitle !== null) owner.setAttribute('title', nativeTitle);
    if (previousDescription === null) owner.removeAttribute('aria-describedby');
    else owner.setAttribute('aria-describedby', previousDescription);
  }
  owner = null;
  nativeTitle = null;
  previousDescription = null;
  content.value = '';
}
function targetOf(target: EventTarget | null) {
  const element = target as Element | null;
  const el = element?.nodeType === 1 ? element.closest<HTMLElement>('[data-cw-tooltip], [title]') : null;
  return el && props.scope?.contains(el) && !el.closest('.cw-follow-tooltip') ? el : null;
}
function show(el: HTMLElement, x: number, y: number) {
  if (el !== owner) {
    hide();
    owner = el;
    nativeTitle = el.getAttribute('title');
    previousDescription = el.getAttribute('aria-describedby');
    el.removeAttribute('title');
    el.setAttribute('aria-describedby', [previousDescription, tooltipId].filter(Boolean).join(' '));
  }
  content.value = el.dataset.cwTooltip || nativeTitle || '';
  pointer = { x, y };
  place();
  void nextTick(place);
}
function move(event: PointerEvent) {
  if (event.pointerType === 'touch') return;
  touch = false;
  // Native titles are temporarily removed, so retain the active owner across its children.
  const candidate = targetOf(event.target);
  const withinOwner = owner?.contains(event.target as Node | null);
  const target = withinOwner && (!candidate || candidate.contains(owner)) ? owner : candidate;
  if (target) show(target, event.clientX, event.clientY);
  else hide();
}
function leave(event: PointerEvent) {
  if (touch || owner?.contains(event.relatedTarget as Node | null)) return;
  hide();
}
function focus(event: FocusEvent) {
  const el = targetOf(event.target);
  if (!el) return;
  const rect = el.getBoundingClientRect();
  show(el, rect.left + rect.width / 2, rect.bottom);
}
function tap(event: PointerEvent) {
  if (event.pointerType !== 'touch') return;
  const el = targetOf(event.target);
  hide();
  touch = true;
  if (el?.hasAttribute('data-cw-tooltip-touch')) show(el, event.clientX, event.clientY);
}
function key(event: KeyboardEvent) {
  if (event.key === 'Escape') hide();
}
watch(
  () => props.scope,
  (scope, _, cleanup) => {
    if (!scope) return;
    const viewport = scope.ownerDocument.defaultView!;
    scope.addEventListener('pointerover', move);
    scope.addEventListener('pointermove', move);
    scope.addEventListener('pointerout', leave);
    scope.addEventListener('pointerdown', tap);
    scope.addEventListener('focusin', focus);
    scope.addEventListener('focusout', hide);
    scope.addEventListener('scroll', hide, true);
    viewport.addEventListener('blur', hide);
    viewport.addEventListener('keydown', key);
    cleanup(() => {
      hide();
      scope.removeEventListener('pointerover', move);
      scope.removeEventListener('pointermove', move);
      scope.removeEventListener('pointerout', leave);
      scope.removeEventListener('pointerdown', tap);
      scope.removeEventListener('focusin', focus);
      scope.removeEventListener('focusout', hide);
      scope.removeEventListener('scroll', hide, true);
      viewport.removeEventListener('blur', hide);
      viewport.removeEventListener('keydown', key);
    });
  },
  { immediate: true },
);
onBeforeUnmount(hide);
</script>

<style scoped>
.cw-follow-tooltip {
  position: fixed;
  z-index: 10000;
  pointer-events: none;
  max-width: min(280px, calc(100% - 16px));
  box-sizing: border-box;
  padding: 8px 11px;
  border: 1px solid var(--cw-border);
  border-radius: 7px;
  background: var(--cw-bg-surface);
  color: var(--cw-text-primary);
  box-shadow: var(--cw-shadow-modal);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
</style>
