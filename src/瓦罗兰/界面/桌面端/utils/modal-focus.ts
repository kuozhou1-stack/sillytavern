/** Keep keyboard navigation in the uppermost open dialog and restore its opener. */
export function installModalFocus(root: HTMLElement) {
  const doc = root.ownerDocument;
  const modalSelector = '.cw-modal-backdrop, .cw-drawer-backdrop';
  let active: HTMLElement | undefined;
  const openers = new WeakMap<HTMLElement, HTMLElement>();
  const visible = (el: HTMLElement) => el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const controls = (modal: HTMLElement) => [...modal.querySelectorAll<HTMLElement>(
    'button, input, textarea, select, a[href], [tabindex]',
  )].filter(el => visible(el) && !el.matches(':disabled') && el.tabIndex >= 0);
  const enter = (modal: HTMLElement) => (controls(modal)[0] ?? modal).focus({ preventScroll: true });
  function sync() {
    const next = [...root.querySelectorAll<HTMLElement>(modalSelector)]
      .filter(visible).sort((a, b) => (Number(getComputedStyle(a).zIndex) || 0) - (Number(getComputedStyle(b).zIndex) || 0)).at(-1);
    if (next === active) return;
    const previous = active;
    active = next;
    if (next) {
      if (!openers.has(next) && doc.activeElement instanceof HTMLElement) openers.set(next, doc.activeElement);
      next.setAttribute('role', 'dialog');
      next.setAttribute('aria-modal', 'true');
      next.tabIndex = -1;
    }
    const opener = previous && openers.get(previous);
    if (opener && visible(opener) && (!next || next.contains(opener))) opener.focus({ preventScroll: true });
    else if (next) enter(next);
  }
  function focusIn(event: FocusEvent) {
    if (active && !active.contains(event.target as Node)) enter(active);
  }
  function keydown(event: KeyboardEvent) {
    if (!active || event.key !== 'Tab') return;
    const items = controls(active);
    const index = items.indexOf(doc.activeElement as HTMLElement);
    if (!items.length || index === -1 || (event.shiftKey ? index === 0 : index === items.length - 1)) {
      event.preventDefault();
      (event.shiftKey ? items.at(-1) ?? active : items[0] ?? active).focus({ preventScroll: true });
    }
  }
  const containsModal = (node: Node) => node.nodeType === 1 &&
    ((node as Element).matches(modalSelector) || !!(node as Element).querySelector(modalSelector));
  const observer = new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(containsModal))) sync();
  });
  observer.observe(root, { childList: true, subtree: true });
  doc.addEventListener('focusin', focusIn);
  doc.addEventListener('keydown', keydown, true);
  sync();
  return () => {
    observer.disconnect();
    doc.removeEventListener('focusin', focusIn);
    doc.removeEventListener('keydown', keydown, true);
    active = undefined;
  };
}
