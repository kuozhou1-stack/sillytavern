import { nextTick, ref, watch, type Ref } from 'vue';

/** Preserve the visible row; chat messages grow at the bottom, social feeds at the top. */
export function useStableFeed(ids: () => string[], scope: () => string | null, latestEdge: 'top' | 'bottom' = 'top') {
  const viewport = ref<HTMLElement | null>(null);
  const pending = ref(0);
  let revision = 0;
  const scrollToLatest = (el: HTMLElement) => {
    el.scrollTop = latestEdge === 'bottom' ? el.scrollHeight : 0;
    pending.value = 0;
  };
  watch(viewport, async el => {
    const token = ++revision;
    if (!el || latestEdge !== 'bottom') return;
    await nextTick();
    if (token === revision && viewport.value === el) scrollToLatest(el);
  });
  watch(
    [ids, scope],
    async ([current, currentScope], [previous, previousScope]) => {
      const token = ++revision;
      const changedScope = currentScope !== previousScope;
      if (changedScope) pending.value = 0;
      const el = viewport.value;
      if (!el) return;
      if (changedScope || !previous?.length) {
        if (latestEdge === 'bottom') {
          await nextTick();
          if (token === revision && viewport.value === el) scrollToLatest(el);
        }
        return;
      }
      const old = new Set(previous);
      const added = current.filter(id => !old.has(id)).length;
      if (!added) return;
      const top = el.getBoundingClientRect().top;
      const anchor = [...el.querySelectorAll<HTMLElement>('[data-feed-id]')].find(
        row => row.getBoundingClientRect().bottom > top,
      );
      const offset = anchor ? anchor.getBoundingClientRect().top - top : 0;
      const atLatest = latestEdge === 'bottom'
        ? el.scrollHeight - el.scrollTop - el.clientHeight < 8
        : el.scrollTop < 8;
      await nextTick();
      if (token !== revision || viewport.value !== el) return;
      if (atLatest) scrollToLatest(el);
      else {
        const next = [...el.querySelectorAll<HTMLElement>('[data-feed-id]')].find(
          row => row.dataset.feedId === anchor?.dataset.feedId,
        );
        if (next) el.scrollTop += next.getBoundingClientRect().top - el.getBoundingClientRect().top - offset;
        pending.value += added;
      }
    },
    { flush: 'pre' },
  );
  const latest = () => {
    if (viewport.value) scrollToLatest(viewport.value);
    pending.value = 0;
  };
  return { viewport: viewport as Ref<HTMLElement | null>, pending, latest };
}
