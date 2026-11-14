import { reactive } from 'vue';
import type { Runtime } from './host';

/** Each iframe has its own Vue dependency tracker; mirror snapshots, never write them back. */
export function connectRuntime(remote: Runtime) {
  const initialSnapshot = remote.snapshot();
  const initial = JSON.parse(initialSnapshot);
  const view = reactive(initial.view),
    settings = reactive(initial.settings);
  let last = initialSnapshot;
  const sourceView = remote.view && typeof remote.view === 'object' ? (remote.view as Record<string, unknown>) : null;
  const sourceSettings =
    remote.settings && typeof remote.settings === 'object' ? (remote.settings as Record<string, unknown>) : null;
  const previousView = new Map(sourceView ? Object.entries(sourceView) : []);
  const previousSettings = new Map(sourceSettings ? Object.entries(sourceSettings) : []);
  let unavailable = false;
  const mirror = (source: Record<string, unknown>, target: Record<string, unknown>, previous: Map<string, unknown>) => {
    for (const [key, value] of Object.entries(source)) {
      if (!unavailable && Object.is(previous.get(key), value)) continue;
      previous.set(key, value);
      target[key] = value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
    }
  };
  const sync = (reconcileMessages = true) => {
    const service = (window.parent as any).__chengwanService;
    if (!service?.ready) {
      unavailable = true;
      view.readOnly = true;
      view.canResend = false;
      view.error = '后台脚本尚未就绪，请检查辅助API脚本是否启用';
      return;
    }
    if (service.runtime !== remote) {
      window.location.reload();
      return;
    }
    // Other extensions may write chat[mesid].mes directly without MESSAGE_UPDATED.
    // The existing frontend timer also reconciles those saved message edits.
    if (reconcileMessages) remote.refreshMessages?.();
    if (sourceView && sourceSettings) {
      mirror(sourceView, view, previousView);
      mirror(sourceSettings, settings, previousSettings);
      unavailable = false;
      return;
    }
    const next = remote.snapshot();
    if (next === last && !unavailable) return;
    last = next;
    unavailable = false;
    const value = JSON.parse(next);
    Object.assign(view, value.view);
    Object.assign(settings, value.settings);
  };
  const runtime = { ...remote, view, settings } as Runtime;
  const invoke = async <T>(command: () => Promise<T>) => {
    try {
      const pending = command();
      // Scheduling publishes pending work synchronously, before storage/network awaits.
      sync(false);
      return await pending;
    } finally {
      sync(false);
    }
  };
  // Commands remain bound to the one background writer; frontend snapshots are read-only projections.
  // Publish changes immediately instead of waiting for the background poll.
  if (remote.manageCharacters) {
    runtime.manageCharacters = command => invoke(() => remote.manageCharacters(command));
  }
  if (remote.manageInformation) {
    runtime.manageInformation = (kind, id, mode) => invoke(() => remote.manageInformation(kind, id, mode));
  }
  if (remote.novelAction) {
    runtime.novelAction = command => invoke(() => remote.novelAction(command));
  }
  if (remote.createProfile) {
    runtime.createProfile = payload => invoke(() => remote.createProfile(payload));
  }
  if (remote.novelRefresh) {
    runtime.novelRefresh = target => invoke(() => remote.novelRefresh(target));
  }
  if (remote.send) {
    runtime.send = (text, append = true, intent, onSent) =>
      invoke(() =>
        remote.send(text, append, intent, () => {
          sync(false);
          onSent?.();
        }),
      );
  }
  if (remote.messageAction) {
    runtime.messageAction = (action, id, text) => invoke(() => remote.messageAction(action, id, text));
  }
  if (remote.commit) {
    runtime.commit = async (mutate, id) => {
      try {
        return await remote.commit(mutate, id);
      } finally {
        sync(false);
      }
    };
  }
  if (remote.retry) {
    runtime.retry = () => invoke(() => remote.retry());
  }
  if (remote.reload) {
    runtime.reload = () => invoke(() => remote.reload());
  }
  if (remote.discardPending) {
    runtime.discardPending = () => invoke(() => remote.discardPending());
  }
  if (remote.phoneAction) {
    runtime.phoneAction = async (action, onRequest) => {
      try {
        return await remote.phoneAction(action, onRequest);
      } finally {
        sync(false);
      }
    };
  }
  if (remote.resumeQueued) {
    runtime.resumeQueued = async id => {
      try {
        return await remote.resumeQueued(id);
      } finally {
        sync(false);
      }
    };
  }
  if (remote.cancelQueued) {
    runtime.cancelQueued = async id => {
      try {
        return await remote.cancelQueued(id);
      } finally {
        sync(false);
      }
    };
  }
  const timer = setInterval(sync, 800);
  const onRuntimeChanged = () => sync(false);
  eventOn('chengwan:runtime_changed', onRuntimeChanged);
  return {
    runtime,
    disconnect: () => {
      clearInterval(timer);
      eventRemoveListener('chengwan:runtime_changed', onRuntimeChanged);
    },
  };
}
