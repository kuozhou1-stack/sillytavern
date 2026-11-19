import { reactive } from 'vue';
import type { Context } from '../../../运行/core';
import type { Runtime, PhoneActionResult, PhoneRequestIdentity } from '../../../运行/host';

type DraftScope = Pick<Context, 'chat' | 'floor' | 'swipe' | 'branch'>;
type Submission = { original: string; identity: PhoneRequestIdentity };
type DraftSession = {
  scope: DraftScope | null;
  replies: Record<string, string>;
  submitted: Record<string, Submission>;
  busy: boolean;
  sendingTarget: string | null;
};

// UI-only state survives phone/app unmounts. Runtime ownership prevents leakage to
// another card/chat, and candidate identity separates branches within that runtime.
const sessions = new WeakMap<Runtime, Map<string, DraftSession>>();

function currentScope(runtime: Runtime): DraftScope | null {
  if (runtime.view.readOnly) return null;
  try {
    const { chat, floor, swipe, branch } = runtime.service.host.context();
    return { chat, floor, swipe, branch };
  } catch {
    return null;
  }
}

function scopeKey(scope: DraftScope | null) {
  return JSON.stringify(scope);
}

function matchesScope(identity: PhoneRequestIdentity, scope: DraftScope) {
  return identity.chatId === scope.chat && identity.floor === scope.floor && identity.swipe === scope.swipe;
}

function sameRequest(a: PhoneRequestIdentity, b: PhoneRequestIdentity) {
  return a.id === b.id && a.kind === b.kind && a.targetId === b.targetId && a.platform === b.platform &&
    a.chatId === b.chatId && a.floor === b.floor && a.swipe === b.swipe;
}

function createSession(scope: DraftScope | null): DraftSession {
  return reactive({ scope, replies: {}, submitted: {}, busy: false, sendingTarget: null });
}

export function useLinxinDrafts(runtime: Runtime | null) {
  const offline = createSession(null);
  function session(): DraftSession {
    if (!runtime) return offline;
    // Runtime refreshes data on candidate changes; track this dependency for Vue.
    void runtime.view.data;
    const scope = currentScope(runtime);
    let cache = sessions.get(runtime);
    if (!cache) sessions.set(runtime, cache = new Map());
    const key = scopeKey(scope);
    let entry = cache.get(key);
    if (!entry) cache.set(key, entry = createSession(scope));
    return entry;
  }

  function confirm(entry: DraftSession, result: PhoneActionResult | void) {
    if (!runtime || !entry.scope || !result || result.type !== 'phone' || result.status !== 'confirmed' ||
        scopeKey(currentScope(runtime)) !== scopeKey(entry.scope) || !matchesScope(result, entry.scope)) return;
    const submitted = entry.submitted[result.id];
    if (!submitted || !sameRequest(submitted.identity, result)) return;
    const target = submitted.identity.targetId!;
    if (entry.replies[target] === submitted.original) entry.replies[target] = '';
    delete entry.submitted[result.id];
  }

  async function send(entry: DraftSession, target: string, original: string) {
    if (!runtime || !entry.scope) throw Error('离线展示或当前聊天不可写，已保留草稿');
    if (entry.busy) return;
    entry.busy = true;
    entry.sendingTarget = target;
    // Identity comes from this exact submission, never a sampled global status.
    // The callback and promise survive closing the phone without retaining its UI.
    let captured: PhoneRequestIdentity | null = null;
    const bindRequest = (request: PhoneRequestIdentity) => {
      if (!request || request.kind !== 'send' || request.targetId !== target || request.platform !== '邻信' ||
          !matchesScope(request, entry.scope!) || scopeKey(currentScope(runtime)) !== scopeKey(entry.scope)) return;
      if (captured && !sameRequest(captured, request)) return;
      captured ??= { ...request };
      entry.submitted[request.id] ??= { original, identity: { ...request } };
    };
    try {
      confirm(entry, await runtime.phoneAction({ kind: 'send', id: target, text: original.trim(), platform: '邻信' }, bindRequest));
    } finally {
      entry.busy = false;
      entry.sendingTarget = null;
    }
  }

  async function retry(entry: DraftSession) {
    if (!runtime || entry.busy) return;
    entry.busy = true;
    try {
      confirm(entry, await runtime.retry());
    } finally {
      entry.busy = false;
    }
  }

  async function discard(entry: DraftSession) {
    if (!runtime || entry.busy) return;
    const requestId = runtime.view.phoneRequest?.id;
    entry.busy = true;
    try {
      await runtime.discardPending();
      if (requestId) delete entry.submitted[requestId];
    } finally {
      entry.busy = false;
    }
  }

  return { session, send, retry, discard };
}
