import { validateSettlement, validateUse, type UseIntent } from './settlement';
import { phoneBudget } from './phone-budget';
import { normalizePhoneRecordPatches } from './model-phone-patch';
import { phoneRequestIdentity, type PhoneRequestIdentity, type PhoneRequestState, type PhoneRequestStatus, type PhoneActionResult } from './phone-request';
import { finalizeWorld, normalizeWorldAnchorPatches, restoreWorldAnchors } from './world';
import { reactive } from 'vue';
import { sha256 } from './browser-crypto';
import { requestBrowserLock, type BrowserLock } from './browser-lock';
import { livePromptConfig } from './prompts';
import { normalizeGeographicNames } from './地理名称';
import { normalizeWorldInformation } from './世界资料';
import { normalizeMapLandmarks } from './地图地标';
import {
  prepareInformationCommand, informationSelectionPrompt, finalizeInformationPrompt, applyInformationSelection,
  needsInformationSelection, assertInformationPatch, type InformationKind, type InformationMode,
  ensureInformationContext, expandInformationForRetry, InformationNotLoadedError,
} from './knowledge-context';
import { mergeOpeningTasks, planOpeningCharacters, openingMessage, withOpeningStory } from './opening';
import { taskReceipt, type UpdateReceipt } from './update-receipt';
import { planTasks } from './tasks';
import { pendingUpdateTasks, withUpdateTasks, finalizeUpdateTasks } from './update-tasks';
import { phoneTimePrompt, validatePhoneTimeline } from './phone';
import { applyPhoneAction, assertPhoneActionNotRepeated, blockText, finalizePhone, type PhoneAction } from './phone';
import { Schema } from '../schema';
import { messageSource, assertMessageSource, MessageSourceSchema, type MessageSource } from './request-source';
import { RequestScheduler } from './scheduler';
import {
  CommitService,
  assertContext,
  copy,
  countRound,
  equal,
  uid,
  validateModel,
  assertModelPrivatePatches,
  type Context,
  type State,
} from './core';

import { SettingsSchema, createSettingsController, validateApi, apiConnection, informationApi, type ApiSettings, type ApiChannel } from './settings';
import { stripProtocol, storedNarrative, updateBlock } from './message-protocol';
import { finalizeWorkerPrompt } from './worker-task';
import { savedChanges, storyChangeStatus, type StorySettlement } from './variable-changes';
import { CandidateIdentityError, isCommittedCandidate } from './committed-candidate';
import { LIBRARY_KEY, libraryView, prepareLibraryCommand, exportManagedCharacter, type LibraryCommand, type LibraryView } from './character-library';
import { prepareCharacterRoster, prepareOpeningCharacterRoster } from './character-roster';
import { createProfile, initialConnectionIds } from './creation';
import { assertDisabledUnchanged, finalizeCharacterContext, taskHasActiveTargets } from './character-activity';
import { applyNovelAction, refreshNovelSystem, type NovelAction } from './novel-system';
import { applyNovelRefresh, novelRefreshPrompt, finalizeNovelRefreshPrompt, type NovelRefreshTarget } from './novel-refresh';
const normalizeRuntimeWorld = (state: State): State =>
  normalizeWorldInformation(normalizeMapLandmarks(normalizeGeographicNames(state)));

export { stripProtocol } from './message-protocol';
export { SettingsSchema } from './settings';
export type { PhoneRequestIdentity, PhoneRequestState, PhoneRequestStatus, PhoneActionResult } from './phone-request';
async function parseCandidate(text: string, envelope: Mvu.MvuData) {
  const { block, commands } = updateBlock(text);
  const base = copy(envelope);
  // 旧存档只在候选快照内补新分组，不改活动楼层，也不放宽只读字段校验。
  if (!Object.hasOwn(base.stat_data, '奇遇系统')) base.stat_data.奇遇系统 = Schema.parse({}).奇遇系统;
  if (!Object.hasOwn(base.stat_data._系统 ?? {}, '资料加载'))
    _.set(base.stat_data, '_系统.资料加载', Schema.parse({})._系统.资料加载);
  const before = Schema.parse(base.stat_data);
  const normalized = normalizePhoneRecordPatches(before, normalizeWorldAnchorPatches(before, commands));
  assertInformationPatch(before, normalized);
  assertModelPrivatePatches(before, normalized);
  const safeBlock = block.replace(/<JSONPatch>[\s\S]*?<\/JSONPatch>/i,
    () => `<JSONPatch>${JSON.stringify(normalized)}</JSONPatch>`);
  const parsed = await Mvu.parseMessage(safeBlock, base);
  if (!parsed && normalized.length) throw Error('MVU 未返回更新候选');
  const result = parsed ?? base;
  return { ...result, stat_data: restoreWorldAnchors(before, result.stat_data) };
}
function messageExtra(message: { extra?: Record<string, any> } | undefined): Record<string, any> {
  const outer = message?.extra ?? {};
  const nested = outer.extra && typeof outer.extra === 'object' ? outer.extra : {};
  const plain = { ...outer };
  delete plain.extra;
  return { ...nested, ...plain };
}
export function activeContext(): Context {
  const chat = SillyTavern.getCurrentChatId();
  if (!chat) throw Error('请先打开瓦洛兰聊天');
  const active = (() => {
    for (let end = getLastMessageId(); end >= 0; end -= 10) {
      const floors = getChatMessages(`${Math.max(0, end - 9)}-${end}`, { role: 'assistant', include_swipes: true });
      for (const f of floors.reverse()) {
        const data = f.swipes_data[f.swipe_id]?.stat_data;
        const extra = messageExtra(getChatMessages(f.message_id)[0]);
        if (extra.cw_incomplete || extra.cw_update_pending) continue;
        // MVU can copy the previous floor's data into an unfinished reply. Its floor id
        // still points at the previous committed floor, so it must not become the base.
        const committedFloor = data?._系统?.楼层id;
        const committed = isCommittedCandidate(data, f.message_id, f.swipe_id);
        if (committedFloor === f.message_id && !committed)
          throw new CandidateIdentityError('所选候选的变量属于其他候选，请返回已结算候选或重新生成');
        if (committed) return f;
      }
    }
    return undefined;
  })();
  if (!active) throw Error('尚未找到已初始化的助手状态楼层');
  const raw = Mvu.getMvuData({ type: 'message', message_id: active.message_id }).stat_data;
  const branch = `${chat}:${active.message_id}:${active.swipe_id}`;
  return {
    chat,
    floor: active.message_id,
    swipe: active.swipe_id,
    branch,
    version: raw._系统?.数据版本 ?? 0,
    fingerprint: JSON.stringify(raw),
  };
}
export function createRuntime() {
  const boundChat = SillyTavern.getCurrentChatId();
  const view = reactive({
    data: null as State | null,
    characterLibrary: null as LibraryView | null,
    managementPending: false,
    messages: [] as any[],
    busy: false,
    updating: false,
    error: '',
    settingsWarning: '',
    streaming: '',
    readOnly: false,
    operation: '',
    updates: [] as UpdateReceipt[],
    queued: [] as { id: string; label: string; kind: string }[],
    recoverable: [] as { id: string; label: string; kind: string; preview: string }[],
    phoneRequest: null as PhoneRequestState | null,
  });
  let errorSource: 'candidate' | 'operation' = 'operation';
  function setError(error: unknown) {
    errorSource = error instanceof CandidateIdentityError ? 'candidate' : 'operation';
    view.error = String(error);
  }
  const settings = reactive(SettingsSchema.parse(getVariables({ type: 'character' }).澄湾设置));
  const settingsController = createSettingsController(requireWriter);
  let disposed = false;
  let generationId: string | null = null;
  let cancelled = false;
  let epoch = 0;
  let requestSource: MessageSource | undefined;
  let staleSource = false;
  let releaseWriter: (() => void) | undefined;
  let writerLock: BrowserLock | undefined;
  let writerTask: Promise<void> | undefined;
  let chatWrites: Promise<unknown> = Promise.resolve();
  const IntentSchema = z.object({
    id: z.string(),
    chat: z.string(),
    label: z.string(),
    kind: z.enum(['story', 'phone', 'novel']),
    target: z.enum(['tasks', 'shop', 'initial']).optional(),
    text: z.string().optional(),
    append: z.boolean().optional(),
    opening: z.boolean().optional(),
    intent: z.object({ itemId: z.string(), amount: z.number() }).optional(),
    action: z
      .custom<PhoneAction>(
        v =>
          !!v &&
          typeof v === 'object' &&
          ['send', 'post', 'comment', 'like', 'repost', 'refresh', 'invite'].includes((v as PhoneAction).kind),
      )
      .optional(),
    source: MessageSourceSchema,
  });
  type Intent = z.infer<typeof IntentSchema>;
  const restored = z.array(IntentSchema).safeParse(getVariables({ type: 'chat' }).澄湾排队操作 ?? []);
  let intents: Intent[] = restored.success ? restored.data : [];
  if (!restored.success) setError('待发送操作记录损坏，请检查聊天备份；不会自动执行');
  const scheduled = new Set<string>();
  const submittedPhoneIdentities = new WeakMap<Intent, PhoneRequestIdentity>();
  const updateQueueView = () => {
    view.recoverable = intents
      .filter(i => !scheduled.has(i.id))
      .map(i => ({
        id: i.id,
        label: i.label,
        kind: i.kind,
        preview: i.text ?? i.action?.text ?? blockText(i.action?.blocks ?? []),
      }));
  };
  const scheduler = new RequestScheduler((active, waiting) => {
    view.operation = active?.kind ?? '';
    view.queued = waiting.filter(i => !i.background).map(i => ({ id: i.key, label: i.label, kind: i.kind }));
    updateQueueView();
  });
  updateQueueView();
  function requireWriter() {
    writerLock?.assertHeld();
    if (disposed || view.readOnly || SillyTavern.getCurrentChatId() !== boundChat)
      throw Error('当前页面已失效或不是活动写入界面，请重新打开');
  }
  // Recheck at the mutation itself, including error recovery after an awaited request.
  const createMessages = (...args: Parameters<typeof createChatMessages>) => {
    requireWriter();
    return createChatMessages(...args);
  };
  const setMessages = (...args: Parameters<typeof setChatMessages>) => {
    requireWriter();
    return setChatMessages(...args);
  };
  const deleteMessages = (...args: Parameters<typeof deleteChatMessages>) => {
    requireWriter();
    return deleteChatMessages(...args);
  };
  const saveChat = () => {
    requireWriter();
    return SillyTavern.saveChat();
  };
  function patchChat(patch: Record<string, unknown>) {
    const saved = copy(patch);
    const operation = chatWrites.then(async () => {
      requireWriter();
      await replaceVariables({ ...getVariables({ type: 'chat' }), ...saved }, { type: 'chat' });
      requireWriter();
      const readback = getVariables({ type: 'chat' });
      for (const key of Object.keys(saved))
        if (!equal(readback[key], saved[key])) throw Error('聊天恢复记录保存不一致：' + key);
      await saveChat();
    });
    chatWrites = operation.catch(() => {});
    return operation;
  }
  function persistIntents(remove: string[] = []) {
    requireWriter();
    if (remove.length) {
      intents = intents.filter(i => !remove.includes(i.id));
    }
    const currentVars = getVariables({ type: 'chat' });
    replaceVariables({ ...currentVars, 澄湾排队操作: intents }, { type: 'chat' });
    updateQueueView();
    return Promise.resolve();
  }
  const saveIntents = () => {
    requireWriter();
    const currentVars = getVariables({ type: 'chat' });
    replaceVariables({ ...currentVars, 澄湾排队操作: intents }, { type: 'chat' });
    updateQueueView();
    return Promise.resolve();
  };
  let pending: {
    context: Context;
    id: string;
    text: string;
    envelope: Mvu.MvuData;
    replyFloor?: number;
    replySwipe?: number;
    intent?: UseIntent;
    source: MessageSource;
    mode: 'main' | 'extra';
    openingTaskId?: string;
    prepared?: { envelope: Mvu.MvuData; settlement: StorySettlement };
  } | null = getVariables({ type: 'chat' }).澄湾待更新正文 ?? null;
  let failedSend: {
    context: Context;
    text: string;
    intent?: UseIntent;
    source: MessageSource;
    id?: string;
    opening?: boolean;
    continuation?: boolean;
    append?: boolean;
  } | null = getVariables({ type: 'chat' }).澄湾失败请求 ?? null;
  let pendingPhone: {
    context: Context;
    id: string;
    envelope: Mvu.MvuData;
    draft: State;
    action: PhoneAction;
    reply?: string;
    candidate?: State;
    source?: MessageSource;
  } | null = getVariables({ type: 'chat' }).澄湾待更新手机 ?? null;
  function setPhoneRequest(p: { id: string; action: PhoneAction; context: Context }, status: PhoneRequestStatus) {
    view.phoneRequest = { ...phoneRequestIdentity(p.id, p.action, p.context), status };
  }
  if (pendingPhone) setPhoneRequest(pendingPhone, 'failed');
  async function savePhone() {
    requireWriter();
    await patchChat({ 澄湾待更新手机: pendingPhone });
  }
  async function saveFailed() {
    requireWriter();
    await patchChat({ 澄湾失败请求: failedSend });
  }
  async function savePending() {
    requireWriter();
    await patchChat({ 澄湾待更新正文: pending });
  }
  async function narrativeRequest(p: NonNullable<typeof pending>) {
    return { id: p.id, context: p.context, source: p.source, intent: p.intent, openingTaskId: p.openingTaskId,
      narrativeHash: await sha256(new TextEncoder().encode(stripProtocol(p.text))) };
  }
  async function captureSavedNarrative(p: NonNullable<typeof pending>) {
    const saved = getChatMessages(p.replyFloor!)[0];
    // The completed create operation includes native/plugin receive processing.
    // Seal its readback once; retries must never adopt later edits this way.
    const generated = p.text;
    p.text = saved.message;
    if (stripProtocol(generated) === stripProtocol(p.text)) return;
    const extra = messageExtra(saved);
    extra.cw_story_request = await narrativeRequest(p);
    assertContext(p.context, activeContext());
    assertMessageSource(p.source, p.replyFloor);
    if (stripProtocol(getChatMessages(p.replyFloor!)[0].message) !== stripProtocol(p.text))
      throw Error('正文保存读回期间已被编辑，保留原请求供检查');
    await setMessages([{ message_id: p.replyFloor!, extra }], { refresh: 'affected' });
  }
  async function parseUpdate(text: string, envelope: Mvu.MvuData, channel: string, id: string) {
    try {
      return await parseCandidate(text, envelope);
    } catch (error) {
      // Keep the actual response and stack in the chat, outside stat_data/prompts.
      // A retry may request a new response, but must not erase the failed evidence.
      await patchChat({ 澄湾最近解析失败: {
        channel, id, at: new Date().toISOString(),
        error: String(error), stack: error instanceof Error ? error.stack : undefined,
        response: text,
        jsonPatch: text.match(/<JSONPatch>([\s\S]*?)<\/JSONPatch>/i)?.[1] ?? null,
      } });
      console.error('[瓦洛兰变量解析] 已保存原始回复与堆栈', { channel, id }, error);
      throw error;
    }
  }
  const service = new CommitService({
    context: () => {
      requireWriter();
      return activeContext();
    },
    read: floor => Mvu.getMvuData({ type: 'message', message_id: floor }),
    write: (data, floor) => {
      requireWriter();
      return Mvu.replaceMvuData(data, { type: 'message', message_id: floor });
    },
    persist: () => {
      requireWriter();
      return saveChat();
    },
    journal: async value => {
      requireWriter();
      await patchChat({ 澄湾待确认提交: value });
    },
  });
  function refreshMessages() {
    if (disposed || SillyTavern.getCurrentChatId() !== boundChat) return;
    const last = getLastMessageId();
    if (last < 1) {
      if (view.messages.length) view.messages = [];
      return;
    }
    const firstVisible = Math.max(1, last - 9);
    const selected = getChatMessages(`${firstVisible}-${last}`, { include_swipes: true });
    const plain = getChatMessages(`${firstVisible}-${last}`);
    const byId = new Map(selected.map(m => [m.message_id, m]));
    let previous: { floor: number; swipe: number; data: Record<string, unknown> } | undefined;
    for (let end = firstVisible - 1; end > 0 && !previous; end -= 10) {
      const prior = getChatMessages(`${Math.max(1, end - 9)}-${end}`, { role: 'assistant', include_swipes: true });
      for (const message of prior.reverse()) {
        const data = message.swipes_data[message.swipe_id]?.stat_data;
        if (!isCommittedCandidate(data, message.message_id, message.swipe_id)) continue;
        const extra = messageExtra(getChatMessages(message.message_id)[0]);
        const pendingSelected = pending?.replyFloor === message.message_id && pending?.replySwipe === message.swipe_id;
        if (extra.cw_incomplete || (extra.cw_update_pending && pendingSelected)) continue;
        previous = { floor: message.message_id, swipe: message.swipe_id, data };
        break;
      }
    }
    if (!previous) {
      const first = getChatMessages(0, { include_swipes: true })[0];
      const firstData = first?.swipes_data[first.swipe_id]?.stat_data;
      if (firstData) previous = { floor: 0, swipe: first.swipe_id, data: firstData };
    }
    const messages = plain
      .filter(m => m.message_id > 0 && m.role !== 'system')
      .map(m => {
        const extra = messageExtra(m);
        const swipe = byId.get(m.message_id)?.swipe_id ?? 0;
        const data = byId.get(m.message_id)?.swipes_data[swipe]?.stat_data;
        const history = extra.cw_story_settlements;
        const settlement = history && typeof history === 'object' ? history[String(swipe)] as StorySettlement : undefined;
        const committedSelected = isCommittedCandidate(data, m.message_id, swipe);
        const pendingSelected = pending?.replyFloor === m.message_id && pending?.replySwipe === swipe;
        const isUpdatePending = !!extra.cw_update_pending && (pendingSelected || !committedSelected);
        const variableUpdate = m.role === 'assistant' ? storyChangeStatus({
          floor: m.message_id,
          swipe,
          data,
          previous,
          settlement,
          pending: isUpdatePending,
          failed: pendingSelected && !view.updating && !!view.error,
          receiving: !!extra.cw_incomplete,
        }) : undefined;
        if (m.role === 'assistant' && !extra.cw_incomplete && !isUpdatePending && committedSelected)
          previous = { floor: m.message_id, swipe, data };
        return {
          id: m.message_id,
          role: m.role,
          content: m.message,
          isIncomplete: !!extra.cw_incomplete,
          isUpdatePending,
          variableUpdate,
        };
      });
    if (
      messages.length !== view.messages.length ||
      messages.some((message, index) =>
        Object.entries(message).some(([key, value]) =>
          key === 'variableUpdate' ? JSON.stringify(value) !== JSON.stringify(view.messages[index]?.[key]) :
            value !== view.messages[index]?.[key]),
      )
    )
      view.messages = messages;
  }
  function refresh() {
    if (disposed) return;
    if (!pendingPhone && !view.busy) view.phoneRequest = null;
    try {
      const c = activeContext();
      const chatVariables = getVariables({ type: 'chat' });
      view.data = normalizeRuntimeWorld(Schema.parse(service.host.read(c.floor).stat_data));
      view.characterLibrary = libraryView(view.data, chatVariables[LIBRARY_KEY]);
      view.managementPending = !!chatVariables.澄湾待确认提交?.rollbackOnFailure;
      const updates = chatVariables.澄湾更新回执;
      view.updates = Array.isArray(updates)
        ? updates.filter(
            r => r && Array.isArray(r.changed) && Array.isArray(r.targets) && view.data?._系统.提交记录[r.commitId],
          )
        : [];
      refreshMessages();
      if (errorSource === 'candidate') setError('');
    } catch (e) {
      setError(e);
    }
  }
  async function saveSettings(input: unknown = copy(settings), channel?: ApiChannel) {
    requireWriter();
    if (view.busy || view.updating) throw Error('请等待当前请求完成或停止后保存设置');
    const { value, warning } = await settingsController.save(input, channel);
    requireWriter();
    // Independent forms may finish in either order; only adopt the saved channel.
    if (channel === 'information') settings.information = value.information;
    else if (channel) settings[channel] = value[channel];
    else Object.assign(settings, value);
    if (channel) await settingsController.syncRules(settings);
    view.settingsWarning = warning;
    return warning;
  }
  async function reloadSettings(channel?: ApiChannel) {
    requireWriter();
    if (view.busy || view.updating) throw Error('请等待当前请求完成或停止后同步设置');
    const { value, warning } = await settingsController.load(channel, copy(settings));
    requireWriter();
    if (channel === 'information') settings.information = value.information;
    else if (channel) settings[channel] = value[channel];
    else Object.assign(settings, value);
    await settingsController.syncRules(settings);
    view.settingsWarning = warning;
    return warning;
  }
  function readAlertMemory(): Record<string, boolean> {
    return getVariables({ type: 'chat' }).澄湾告警 ?? {};
  }
  async function saveAlertMemory(value: Record<string, boolean>) {
    if (equal(readAlertMemory(), value)) return;
    const chat = SillyTavern.getCurrentChatId();
    await patchChat({ 澄湾告警: copy(value) });
    if (chat !== SillyTavern.getCurrentChatId()) return;
    await saveChat();
  }
  async function commit(mutate: (s: State) => void | State, id = uid('commit')) {
    requireWriter();
    if (view.busy || view.updating || pending || pendingPhone || view.managementPending) throw Error('请等待当前任务完成或恢复未确认提交后重试');
    view.updating = true;
    try {
      await service.commit(activeContext(), id, s => planTasks(refreshNovelSystem(mutate(s) || s)));
      setError('');
      refresh();
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      view.updating = false;
    }
  }
  function requireManagementIdle(operation = '管理角色') {
    requireWriter();
    if (view.busy || view.updating || pending || pendingPhone || failedSend || scheduler.active || scheduler.waiting ||
        intents.length || firstUnsettledNarrative() || getVariables({ type: 'chat' }).澄湾待确认提交)
      throw Error('当前正在生成、结算或有待恢复操作；请完成或取消后再' + operation);
  }
  function novelAction(input: NovelAction) {
    requireManagementIdle('操作奇遇系统');
    const action = copy(input), expected = activeContext();
    return foreground('local', async () => {
      assertContext(expected, activeContext());
      await commit(s => applyNovelAction(s, action), `novel:${action.operationId}`);
    }, `novel:${action.operationId}`);
  }
  function manageInformation(kind: InformationKind, id: string, mode: InformationMode) {
    requireManagementIdle('管理地点与组织资料');
    const expected = activeContext();
    return foreground('local', async () => {
      assertContext(expected, activeContext());
      await commit(state => prepareInformationCommand(normalizeRuntimeWorld(state), kind, id, mode), uid('information_management'));
    }, uid('information_management'));
  }
  function manageCharacters(input: LibraryCommand) {
    // Check before scheduling so a click during generation does not silently execute later.
    requireManagementIdle();
    const command = copy(input), expected = activeContext();
    return foreground('local', async () => {
      assertContext(expected, activeContext());
      view.updating = true;
      try {
        const before = Schema.parse(service.host.read(expected.floor).stat_data);
        const prepared = prepareLibraryCommand(before, getVariables({ type: 'chat' })[LIBRARY_KEY], command);
        // Snapshot and revision persistence must be acknowledged before removing any active record.
        await patchChat({ [LIBRARY_KEY]: prepared.library });
        assertContext(expected, activeContext());
        await service.commit(expected, uid('character_management'), () => prepared.state, true);
        epoch++;
        setError('');
        refresh();
        return { created: prepared.created, results: prepared.results };
      } catch (error) {
        setError(error);
        refresh();
        throw error;
      } finally { view.updating = false; }
    });
  }
  async function saveCreatedProfile(payload: Parameters<typeof createProfile>[1] & { submissionId?: string }) {
    requireWriter();
    if (view.busy || view.updating || pending || pendingPhone || view.managementPending)
      throw Error('请等待当前任务完成后建档');
    view.updating = true;
    try {
      const expected = activeContext(), before = Schema.parse(service.host.read(expected.floor).stat_data);
      const submissionId = payload.submissionId ?? uid('creation');
      if (!before._系统.提交记录[submissionId]) {
        const created = createProfile(before, payload);
        const prepared = prepareOpeningCharacterRoster(created, getVariables({ type: 'chat' })[LIBRARY_KEY],
          settings.characterRoster, initialConnectionIds(payload));
        if (prepared) await patchChat({ [LIBRARY_KEY]: prepared.library });
        assertContext(expected, activeContext());
        await service.commit(expected, submissionId, () => planTasks(refreshNovelSystem(prepared?.state ?? created)), true);
      }
      refresh();
      return { active: Object.keys(view.data!.角色).length, waiting: Object.keys(view.data!._系统.角色停用标识).length };
    } catch (error) {
      setError(error);
      refresh();
      throw error;
    } finally { view.updating = false; }
  }
  async function scheduleOpeningCharacters() {
    const expected = activeContext(), before = Schema.parse(service.host.read(expected.floor).stat_data);
    const prepared = prepareOpeningCharacterRoster(before, getVariables({ type: 'chat' })[LIBRARY_KEY], settings.characterRoster);
    if (!prepared) return;
    await patchChat({ [LIBRARY_KEY]: prepared.library });
    assertContext(expected, activeContext());
    await service.commit(expected, uid('opening_roster'), () => prepared.state, true);
    refresh();
  }
  async function scheduleCharacters(input = '', action?: PhoneAction) {
    if (!settings.characterAuto) return;
    const expected = activeContext();
    const before = Schema.parse(service.host.read(expected.floor).stat_data);
    const prepared = prepareCharacterRoster(before, getVariables({ type: 'chat' })[LIBRARY_KEY], input, action, settings.characterRoster);
    if (!prepared) return;
    // Persist snapshots first; an interrupted write can only leave an unused immutable revision.
    await patchChat({ [LIBRARY_KEY]: prepared.library });
    assertContext(expected, activeContext());
    await service.commit(expected, uid('character_roster'), () => planTasks(prepared.state), true);
    refresh();
    console.info('[瓦洛兰角色调度] 已更新活动名单', {
      major: Object.values(prepared.state.角色).filter(p => p.层级 === '主要').length,
      minor: Object.values(prepared.state.角色).filter(p => p.层级 === '次要').length,
      rotation: Object.keys(prepared.revision.automatic!.rotation),
    });
  }
  async function prepareWorldInformation() {
    const expected = activeContext(), before = Schema.parse(service.host.read(expected.floor).stat_data);
    const normalized = normalizeRuntimeWorld(before);
    if (equal(before, normalized)) return;
    await service.commit(expected, uid('world_information_migration'), () => normalized);
    refresh();
  }
  function informationRetryHint(id: string) {
    const failed = getVariables({ type: 'chat' }).澄湾最近解析失败;
    return failed?.id === id && String(failed.error).includes('请先展开资料')
      ? '\n上一份结算请求需要先展开已有资料：' + String(failed.error).split('：').at(-1) : '';
  }
  async function selectInformation(before: State, input: string, key: string, retain = false) {
    if (!settings.informationAuto) return before;
    if (before._系统.资料加载.选择依据 === key ||
        (!Object.keys(before.地点).length && !Object.keys(before.组织).length)) return ensureInformationContext(before, input);
    const api = informationApi(settings);
    validateApi(api, '资料选择');
    const expected = activeContext(), source = messageSource();
    const config = informationSelectionPrompt(before, input, source.filter(item => item.role !== 'system'));
    const reply = await request({ ...config, custom_api: apiConnection(api) },
      true, api.retries, false, 'knowledge');
    assertContext(expected, activeContext());
    assertMessageSource(source);
    return ensureInformationContext(applyInformationSelection(before, reply, key, retain), input);
  }
  async function scheduleInformation(input: string, key: string) {
    const expected = activeContext(), before = Schema.parse(service.host.read(expected.floor).stat_data);
    const selected = await selectInformation(before, input, key);
    if (selected === before) return;
    assertContext(expected, activeContext());
    await service.commit(expected, uid('information_selection'), () => selected);
    refresh();
  }
  async function requestOnce(config: GenerateConfig, extra = false, sendPreset = false, purpose: 'variables' | 'novel' | 'knowledge' = 'variables') {
    generationId = uid('generation');
    const marker = `[chengwan-${purpose === 'knowledge' ? 'knowledge' : extra ? purpose === 'novel' ? 'novel' : 'worker' : 'story'}:${generationId}]`;
    const requestState = normalizeRuntimeWorld(Schema.parse(service.host.read(activeContext().floor).stat_data));
    const taskGuard = eventOn(tavern_events.CHAT_COMPLETION_SETTINGS_READY, data => {
      if (!data.messages.some((m: any) => typeof m.content === 'string' && m.content.includes(marker))) return;
      if (purpose === 'knowledge') {
        finalizeInformationPrompt(data.messages, marker, config);
        return;
      }
      if (purpose === 'novel') {
        finalizeNovelRefreshPrompt(data.messages, marker, config);
        return;
      }
      finalizeCharacterContext(data.messages, requestState, extra);
      if (extra) finalizeWorkerPrompt(data.messages, marker);
      else for (const message of data.messages)
        if (typeof message.content === 'string') message.content = message.content.replaceAll(marker, '').trim();
    });
    config = { ...config, user_input: `${config.user_input ?? ''}\n${marker}` };
    const startedEpoch = epoch;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (generationId) stopGenerationById(generationId);
    }, 90000);
    try {
      const workerPrompts: RolePrompt[] = extra
        ? (config.injects ?? []).map(({ role, content }) => ({ role, content }))
        : [];
      requireWriter();
      const result = extra
        ? sendPreset
          ? await generate({
              ...config,
              injects: [],
              overrides: {
                ...config.overrides,
                chat_history: { with_depth_entries: false, prompts: workerPrompts },
              },
              generation_id: generationId,
              should_stream: false,
            })
          : await generateRaw({
              ...config,
              injects: [],
              ordered_prompts: [
                ...(['novel', 'knowledge'].includes(purpose) ? [] : [
                  'world_info_before', 'char_description', 'char_personality', 'scenario', 'world_info_after',
                ] as BuiltinPrompt[]),
                ...workerPrompts,
                'user_input',
              ],
              generation_id: generationId,
              should_stream: false,
            })
        : await generate({ ...config, generation_id: generationId, should_stream: true });
      requireWriter();
      if (typeof result !== 'string' || !result.trim()) throw Error('生成未返回有效正文');
      if (!extra && !stripProtocol(result)) throw Error('主模型没有返回剧情正文；请重试正文生成');
      if (cancelled || disposed || startedEpoch !== epoch) throw Error('生成已取消或上下文已变化');
      if (timedOut) throw Error('生成已超过 90 秒，请重试');
      return result;
    } finally {
      taskGuard?.stop();
      clearTimeout(timer);
      generationId = null;
    }
  }
  async function request(config: GenerateConfig, extra = false, attempts = 0, sendPreset = false, purpose: 'variables' | 'novel' | 'knowledge' = 'variables') {
    let error: unknown;
    for (let index = 0; index <= attempts; index++) {
      if (cancelled || disposed) throw Error('生成已取消');
      try {
        return await requestOnce(config, extra, sendPreset, purpose);
      } catch (e) {
        error = e;
        if (cancelled || disposed) throw e;
        if (index < attempts) await new Promise(r => setTimeout(r, 2000));
      }
    }
    throw error;
  }
  async function requestUpdate(config: GenerateConfig, api: ApiSettings, name: string) {
    validateApi(api, name);
    await settingsController.syncRules(settings);
    console.info('[瓦洛兰变量更新] 开始请求', name);
    return request({ ...config, custom_api: apiConnection(api) }, true, api.retries, api.sendPreset);
  }
  async function requestScopedUpdate(
    before: State, envelope: Mvu.MvuData, makeConfig: (state: State) => Promise<GenerateConfig>,
    api: ApiSettings, name: string, id: string, saveContext: (state: State) => Promise<void>, cachedReply?: string,
    receiveReply?: (text: string) => Promise<void>, rejectReply?: () => void,
  ) {
    // Retry the variable handoff once with the missing records. Never regenerate the story or apply the rejected patch.
    for (let attempt = 0; attempt < 2; attempt++) {
      const text = attempt === 0 && cachedReply !== undefined ? cachedReply : await requestUpdate(await makeConfig(before), api, name);
      await receiveReply?.(text);
      try {
        const parsed = await parseUpdate(text, { ...envelope, stat_data: before }, name, id);
        return { before, text, parsed };
      } catch (error) {
        rejectReply?.();
        if (!(error instanceof InformationNotLoadedError) || !settings.informationAuto || attempt !== 0) throw error;
        const expanded = expandInformationForRetry(before, updateBlock(text).commands);
        if (expanded === before) throw error;
        before = expanded;
        await saveContext(before);
        console.info('[瓦洛兰资料加载] 已补齐结算所需资料，重新请求变量更新');
      }
    }
    throw Error('变量结算未完成，请重试');
  }
  function pendingAlreadyCommitted(p: NonNullable<typeof pending>, current = activeContext()) {
    if (p.replyFloor === undefined || current.chat !== p.context.chat ||
        current.floor !== p.replyFloor || current.swipe !== (p.replySwipe ?? 0)) return false;
    const data = service.host.read(p.replyFloor)?.stat_data;
    return isCommittedCandidate(data, p.replyFloor, current.swipe) && !!data._系统?.提交记录?.[p.id];
  }
  async function clearSavedPending() {
    // Retain the in-memory recovery object until the saved acknowledgement succeeds.
    await patchChat({ 澄湾待更新正文: null, 澄湾待确认提交: null });
    pending = null;
  }
  async function finishPending() {
    requireWriter();
    if (!pending) throw Error('没有待重试结果');
    const p = pending;
    assertMessageSource(p.source, p.replyFloor);
    const replySwipe = p.replyFloor === undefined ? 0 : (p.replySwipe ?? 0);
    if (
      p.replyFloor !== undefined &&
      getChatMessages(p.replyFloor, { include_swipes: true })[0]?.swipe_id !== replySwipe
    )
      throw Error('待结算正文已切换候选，请返回原候选后重试');
    if (
      p.replyFloor !== undefined &&
      stripProtocol(getChatMessages(p.replyFloor)[0]?.message ?? '') !== stripProtocol(p.text)
    )
      throw Error('待更新正文已被编辑，请取消后重新生成');
    if (pendingAlreadyCommitted(p)) {
      await saveChat();
      requireWriter();
      assertMessageSource(p.source, p.replyFloor);
      if (!pendingAlreadyCommitted(p)) throw Error('保存期间候选变化，保留待恢复记录');
      await clearSavedPending();
      setError('');
      refresh();
      return;
    }
    assertContext(p.context, activeContext());
    if (cancelled || disposed) throw Error('更新已取消');
    view.updating = true;
    const startedEpoch = epoch;
    if (p.prepared) {
      await savePreparedNarrative(p, p.prepared, startedEpoch);
      return;
    }
    let before = Schema.parse(p.envelope.stat_data);
    const taskIds = [...new Set([...pendingUpdateTasks(before), ...(p.openingTaskId ? [p.openingTaskId] : [])])];
    const userText = [...p.source].reverse().find(m => m.role === 'user' &&
      (p.replyFloor === undefined || m.id < p.replyFloor))?.text ?? '';
    // Use the player's prompt regexes for the handoff too. Stored/displayed text
    // remains intact; hidden model thinking must not become settlement facts.
    const narrative = stripProtocol(formatAsTavernRegexedString(p.text, 'ai_output', 'prompt', { depth: 0 }));
    if (!narrative) throw Error('主模型回复没有可交接的正文；已保留原始回复，变量 API 未调用');
    const instruction = `正文已经完整输出。结算已完成正文及本次授权的后台生活、维护任务；未实现的玩家意图不算已发生，不续写面向玩家的正文。\n玩家本轮输入：\n${userText}\n已完成正文：\n${narrative}`;
    const retryHint = informationRetryHint(p.id);
    if (needsInformationSelection(before, instruction + retryHint)) {
      before = await selectInformation(before, instruction + retryHint, 'settlement:' + p.id + retryHint, true);
      p.envelope = { ...p.envelope, stat_data: before };
      await savePending();
    }
    if (settings.informationAuto) {
      const expanded = ensureInformationContext(before, instruction + retryHint);
      if (expanded !== before) {
        before = expanded;
        p.envelope = { ...p.envelope, stat_data: before };
        await savePending();
      }
    }
    const makeUpdateConfig = async (state: State) => {
      const updateConfig = withUpdateTasks(await livePromptConfig(state, instruction, 'worker'), state, taskIds);
      updateConfig.user_input =
        '依据本次正文事实、已有状态和授权的后台生活待办更新变量；返回一个完整 UpdateVariable 块，不续写正文。';
      updateConfig.injects = [
        ...(updateConfig.injects ?? []),
        {
          role: 'system',
          position: 'in_chat',
          depth: 0,
          content: `本轮玩家输入（未在正文实现的行动不算已发生）：\n${userText}`,
        },
        {
          role: 'system',
          position: 'in_chat',
          depth: 0,
          content: `本轮已完成正文（事实资料）：\n${narrative}`,
        },
      ];
      return updateConfig;
    };
    console.info('[瓦洛兰正文变量] 交接正文', { floor: p.replyFloor, characters: narrative.length });
    const settled = await requestScopedUpdate(before, p.envelope, makeUpdateConfig, settings.variable, '正文变量', p.id,
      async state => { p.envelope = { ...p.envelope, stat_data: state }; await savePending(); });
    before = settled.before;
    const { text: updateText, parsed } = settled;
    if (!parsed) throw Error('MVU 未返回解析结果，保留正文以重试');
    let candidate = finalizePhone(before, validateSettlement(before, validateModel(before, parsed.stat_data)));
    candidate = validateUse(before, candidate, p.intent);
    candidate = finalizeUpdateTasks(before, candidate, taskIds, updateText);
    candidate = finalizeWorld(before, candidate);
    candidate = refreshNovelSystem(candidate);
    assertContext(p.context, activeContext());
    assertMessageSource(p.source, p.replyFloor);
    if (cancelled || disposed) throw Error('更新已停止，结果保留待重试');
    countRound(candidate, p.id);
    candidate = planTasks(candidate);
    // The completed text is stored before update; retry replaces this same floor, never appends twice.
    const floor = p.replyFloor ?? getLastMessageId() + 1;
    candidate._系统.楼层id = floor;
    candidate._系统.数据版本 = p.context.version + 1;
    candidate._系统.候选回复id = String(replySwipe);
    candidate._系统.分支id = `${p.context.chat}:${floor}:${replySwipe}`;
    candidate._系统.提交记录[p.id] = {
      任务id: p.openingTaskId ?? null,
      事件id: [],
      数据版本: candidate._系统.数据版本,
      状态: '已写入',
      恢复候选JSON: null,
    };
    if (p.openingTaskId)
      candidate._系统.提交记录[before._系统.任务[p.openingTaskId].提交id!] = copy(candidate._系统.提交记录[p.id]);
    const envelope = { ...parsed, stat_data: Schema.parse(candidate) };
    const settlement: StorySettlement = {
      floor,
      swipe: replySwipe,
      commitId: p.id,
      version: candidate._系统.数据版本,
      baseFloor: p.context.floor,
      baseSwipe: p.context.swipe,
      baseVersion: p.context.version,
      changes: savedChanges(before, envelope.stat_data),
    };
    // The MVU result is already parsed and written as floor data. Keeping the command in
    // the message would let MVU or another script apply the same patch again on a rerender.
    p.prepared = { envelope, settlement };
    await savePending();
    await savePreparedNarrative(p, p.prepared, startedEpoch);
  }
  async function savePreparedNarrative(
    p: NonNullable<typeof pending>, prepared: NonNullable<NonNullable<typeof pending>['prepared']>, startedEpoch: number,
  ) {
    const { envelope, settlement } = prepared;
    const candidate = envelope.stat_data as State, floor = settlement.floor, replySwipe = settlement.swipe;
    const before = Schema.parse(p.envelope.stat_data);
    const message = storedNarrative(p.text);
    assertContext(p.context, activeContext());
    assertMessageSource(p.source, p.replyFloor);
    if (cancelled || disposed || epoch !== startedEpoch) throw Error('更新已停止，结果保留待重试');
    await service.host.journal({
      context: p.context,
      commitId: p.id,
      candidate: envelope.stat_data,
      replyFloor: floor,
    });
    assertContext(p.context, activeContext());
    assertMessageSource(p.source, p.replyFloor);
    if (cancelled || disposed || epoch !== startedEpoch) throw Error('更新已停止，结果保留待重试');
    if (p.replyFloor === undefined) {
      await createMessages([{ role: 'assistant', message, data: envelope,
        extra: { cw_story_settlements: { [String(replySwipe)]: settlement } } }], {
        refresh: 'affected',
      });
      p.replyFloor = floor;
      p.replySwipe = 0;
    } else {
      const extra = messageExtra(getChatMessages(floor)[0]);
      delete extra.cw_update_pending;
      delete extra.cw_story_request;
      delete extra.cw_incomplete;
      extra.cw_story_settlements = {
        ...(extra.cw_story_settlements && typeof extra.cw_story_settlements === 'object' ? extra.cw_story_settlements : {}),
        [String(replySwipe)]: settlement,
      };
      await setMessages([{ message_id: floor, message, data: envelope, extra }], {
        refresh: 'affected',
      });
    }
    if (
      getChatMessages(floor)[0]?.message !== message ||
      !equal(Schema.parse(service.host.read(floor).stat_data), envelope.stat_data)
    )
      throw Error('回复楼层状态读回不一致');
    await saveChat();
    requireWriter();
    if (activeContext().floor !== floor || activeContext().swipe !== replySwipe)
      throw Error('保存期间候选变化，保留待恢复记录');
    if (p.openingTaskId) {
      const receipt = taskReceipt(before, candidate, p.openingTaskId, floor);
      const old = getVariables({ type: 'chat' }).澄湾更新回执;
      await patchChat({
        澄湾更新回执: [...(Array.isArray(old) ? old : []).filter(r => r.commitId !== receipt.commitId), receipt],
      });
    }
    await clearSavedPending();
    setError('');
    refresh();
  }
  async function send(
    text: string,
    append = true,
    intent?: UseIntent,
    submissionId = uid('round'),
    opening = false,
    onSent?: () => void,
    continuation = false,
  ) {
    requireWriter();
    if (!view.busy && !view.updating) await restoreOrphanedNarrative();
    if (!pending && firstUnsettledNarrative()) throw Error(view.error || '待结算正文尚未恢复，请先处理该楼层');
    if (!text.trim() || view.busy || view.updating || pending || pendingPhone || view.managementPending) throw Error('输入为空或仍有待处理更新');
    if (!opening) validateApi(settings.variable, '正文变量');
    view.busy = true;
    cancelled = false;
    view.streaming = '';
    setError('');
    staleSource = false;
    requestSource = undefined;
    let context = activeContext();
    let envelope = copy(service.host.read(context.floor));
    let openingTaskId: string | undefined;
    let inputSaved = !append;
    try {
      if (opening) {
        await scheduleOpeningCharacters();
        context = activeContext();
        envelope = copy(service.host.read(context.floor));
        let state = Schema.parse(envelope.stat_data);
        openingTaskId = Object.keys(state._系统.任务).find(
          id => state._系统.任务[id].类别 === '建档' && ['排队', '失败'].includes(state._系统.任务[id].状态),
        );
        if (!openingTaskId) {
          await service.commit(context, uid('opening_batch'), s => planOpeningCharacters(s, [], true));
          context = activeContext();
          envelope = copy(service.host.read(context.floor));
          state = Schema.parse(envelope.stat_data);
          openingTaskId = Object.keys(state._系统.任务).find(
            id => state._系统.任务[id].类别 === '建档' && ['排队', '失败'].includes(state._系统.任务[id].状态),
          );
        }
        if (openingTaskId) {
          const retries = new Set(
            Object.keys(state._系统.任务).filter(
              id => state._系统.任务[id].类别 === '建档' && state._系统.任务[id].状态 === '失败',
            ),
          );
          await service.commit(context, uid('opening_batch'), s => mergeOpeningTasks(s, openingTaskId!, retries));
          context = activeContext();
          envelope = copy(service.host.read(context.floor));
        }
      }
      assertContext(context, activeContext());
      requestSource = messageSource();
      if (append) {
        const inputFloor = getLastMessageId() + 1;
        await createMessages([{ role: 'user', message: text, extra: intent ? { cw_use_intent: intent } : {} }], {
          refresh: 'affected',
        });
        requestSource = [...requestSource, { id: inputFloor, role: 'user', swipe: 0,
          text, archive: text, candidate: text }];
        assertMessageSource(requestSource);
        inputSaved = true;
        // Publish the saved floor before acknowledging input; disk/model work may take longer.
        refreshMessages();
        onSent?.();
        await saveChat();
      }
      // The player's saved floor must appear before worldbook I/O and roster commits.
      // Preparation still finishes before constructing prompts or calling the model.
      await settingsController.syncRules(settings);
      await prepareWorldInformation();
      context = activeContext();
      envelope = copy(service.host.read(context.floor));
      if (!opening) {
        await scheduleCharacters(text);
        context = activeContext();
        envelope = copy(service.host.read(context.floor));
      }
      assertMessageSource(requestSource);
      await scheduleInformation(text, 'story:' + submissionId);
      context = activeContext();
      envelope = copy(service.host.read(context.floor));
      if (cancelled || disposed) throw Error('生成已停止');
      assertMessageSource(requestSource);
      refresh();
      const storyState = Schema.parse(envelope.stat_data);
      const storyConfig = await livePromptConfig(
          storyState,
          text,
          'story',
          opening ? Object.keys(envelope.stat_data.角色) : undefined,
        );
      const reply = await request({
        ...(opening ? withOpeningStory(storyConfig, storyState, openingTaskId) : storyConfig),
        user_input: continuation ? text : '',
      });
      assertContext(context, activeContext());
      assertMessageSource(requestSource);
      pending = {
        context,
        envelope,
        text: reply,
        id: submissionId,
        intent,
        source: requestSource,
        mode: 'extra',
        openingTaskId,
      };
      await savePending();
      failedSend = null;
      await saveFailed();
      const origin = await narrativeRequest(pending);
      assertContext(context, activeContext());
      assertMessageSource(requestSource);
      if (cancelled || disposed) throw Error('生成已停止');
      // Publish completed narrative before the independent variable request; retry updates this same floor.
      const floor = getLastMessageId() + 1;
      await createMessages(
        [{ role: 'assistant', message: storedNarrative(reply), extra: { cw_update_pending: true, cw_story_request: origin } }],
        { refresh: 'affected' },
      );
      pending.replyFloor = floor;
      pending.replySwipe = 0;
      await captureSavedNarrative(pending);
      await savePending();
      await saveChat();
      view.streaming = '';
      refresh();
      view.busy = false;
      await finishPending();
    } catch (e) {
      if (requestSource) {
        try {
          assertMessageSource(requestSource, pending?.replyFloor);
        } catch {
          staleSource = true;
        }
      }
      if (staleSource) {
        pending = null;
        failedSend = null;
        if (!disposed && SillyTavern.getCurrentChatId() === context.chat) {
          await savePending();
          await saveFailed();
          await service.host.journal(null);
        }
        setError('源消息已变化，旧结果已丢弃，请重新发送');
        throw Error(view.error, { cause: e });
      }
      setError(cancelled
        ? pending
          ? '正文已保存，变量尚未结算；请点击重试'
          : '生成已停止；已发送的玩家消息可用“重试”继续'
        : e);
      if (!pending && SillyTavern.getCurrentChatId() === context.chat) {
        failedSend = {
          context,
          text,
          intent,
          source: requestSource ?? messageSource(),
          id: submissionId,
          opening,
          continuation,
          append: append && !inputSaved,
        };
        await saveFailed();
      }
      if (pending && pending.replyFloor === undefined && SillyTavern.getCurrentChatId() === context.chat) {
        const floor = getLastMessageId() + 1;
        const origin = await narrativeRequest(pending);
        assertContext(pending.context, activeContext());
        assertMessageSource(pending.source);
        await createMessages(
          [{ role: 'assistant', message: storedNarrative(pending.text), extra: { cw_update_pending: true, cw_story_request: origin } }],
          { refresh: 'affected' },
        );
        pending.replyFloor = floor;
        pending.replySwipe = 0;
        await captureSavedNarrative(pending);
        await savePending();
        await saveChat();
      }
      throw cancelled ? Error('生成已停止；请检查已保存消息后继续。') : e;
    } finally {
      requestSource = undefined;
      view.streaming = '';
      view.busy = false;
      view.updating = false;
      refresh();
    }
  }
  async function retry(): Promise<PhoneActionResult | void> {
    requireWriter();
    if (view.busy || view.updating) throw Error('当前操作仍在执行，请等待或停止');
    cancelled = false;
    try {
      const rosterJournal = getVariables({ type: 'chat' }).澄湾待确认提交;
      if (rosterJournal?.rollbackOnFailure && ['character_roster_', 'opening_roster_'].some(prefix =>
        String(rosterJournal.commitId).startsWith(prefix))) {
        const resumeStory = failedSend && equal(failedSend.context, rosterJournal.context);
        if (failedSend && !resumeStory) throw Error('自动名单恢复与原请求上下文不一致，请检查当前候选');
        libraryView(Schema.parse(rosterJournal.candidate), getVariables({ type: 'chat' })[LIBRARY_KEY]);
        await service.commit(rosterJournal.context, rosterJournal.commitId, () => Schema.parse(rosterJournal.candidate), true);
        await service.host.journal(null);
        refresh();
        if (resumeStory) {
          failedSend!.context = activeContext();
          await saveFailed();
        } else {
          const original = intents.find(item => item.kind === 'phone' && item.action);
          if (original?.action) {
            assertMessageSource(original.source, undefined, true);
            return await phoneAction(original.action, original.id);
          }
        }
      }
      if (pending?.replyFloor !== undefined) await discardStaleRecovery();
      await restoreOrphanedNarrative();
      if (!pending && firstUnsettledNarrative()) throw Error(view.error || '待结算正文尚未恢复，请先处理该楼层');
      if (pending) {
        // Old chats may contain several saved replies with no settlement. Each
        // reply receives its own previous-floor baseline and one atomic commit.
        do {
          await finishPending();
          await restoreOrphanedNarrative();
        } while (pending && !cancelled && !disposed);
      }
      else if (pendingPhone) return await phoneAction(pendingPhone.action);
      else if (failedSend) {
        assertContext(failedSend.context, activeContext());
        assertMessageSource(failedSend.source);
        await send(
          failedSend.text,
          failedSend.append ?? false,
          failedSend.intent,
          failedSend.id,
          failedSend.opening,
          undefined,
          failedSend.continuation,
        );
      } else {
        const journal = getVariables({ type: 'chat' }).澄湾待确认提交;
        if (journal) {
          if (journal.rollbackOnFailure) libraryView(Schema.parse(journal.candidate), getVariables({ type: 'chat' })[LIBRARY_KEY]);
          await service.commit(journal.context, journal.commitId, () => Schema.parse(journal.candidate), !!journal.rollbackOnFailure);
          await service.host.journal(null);
          setError('');
        } else {
          const item = intents.find(intent => intent.kind === 'novel');
          if (!item?.target) throw Error('没有待恢复提交，请重新执行原操作');
          assertMessageSource(item.source, undefined, true);
          await refreshNovelContent(item.target, item.id);
        }
      }
    } catch (error) {
      setError(error);
      console.error('[瓦洛兰重试] 未完成，保留待处理记录', error);
      throw error;
    } finally {
      view.updating = false;
      refresh();
    }
  }
  function stop() {
    cancelled = true;
    epoch++;
    if (view.phoneRequest && view.busy) view.phoneRequest.status = 'stopping';
    scheduler.cancelWaiting('已停止；尚未发送的操作保留供手动恢复');
    if (generationId) stopGenerationById(generationId);
  }
  async function discardPending() {
    requireWriter();
    if (view.busy || view.updating) {
      stop();
      return;
    }
    await restoreOrphanedNarrative();
    if (pending && pendingAlreadyCommitted(pending)) {
      await finishPending();
      return;
    }
    if (pendingPhone && phoneAlreadyCommitted(pendingPhone)) {
      await phoneAction(pendingPhone.action);
      return;
    }
    if (pending?.replyFloor !== undefined) {
      setError('正文已保存，不能跳过变量结算。请重试；如需放弃，请从消息菜单删除这段正文及后续楼层。');
      refresh();
      return;
    }
    const ids = [pending?.id, pendingPhone?.id, failedSend?.id, ...intents.filter(item => item.kind === 'novel').map(item => item.id)];
    await persistIntents(ids.filter((id): id is string => !!id));
    pending = null;
    pendingPhone = null;
    failedSend = null;
    await savePending();
    await savePhone();
    await saveFailed();
    await service.host.journal(null);
    setError('');
    refresh();
  }
  async function messageAction(action: string, id: number, text?: string) {
    requireWriter();
    if (view.busy || view.updating) throw Error('请先停止当前生成');
    if (action === 'continue') {
      if (pending || pendingPhone || failedSend) throw Error('请先重试或取消待处理请求');
      if (getChatMessages(-1)[0]?.message_id !== id || activeContext().floor !== id)
        throw Error('只能从当前已结算的最新助手楼层继续');
      await send('接续上一段剧情，不重复已写内容。', false, undefined, uid('continue'), false, undefined, true);
      return;
    }
    if (!['edit', 'delete'].includes(action)) validateApi(settings.variable, '正文变量');
    if (failedSend) {
      failedSend = null;
      await saveFailed();
    }
    if (action === 'edit') {
      const old = getChatMessages(id)[0];
      let message = text ?? '';
      if (old?.role === 'assistant') message = storedNarrative(message);
      await setMessages([{ message_id: id, message }], { refresh: 'affected' });
    } else {
      if (id === 0) throw Error('第 0 层为界面容器，请在新聊天中重新建档');
      epoch++;
      scheduler.cancelWaiting('楼层已删除，旧排队操作失效');
      const hadPending = !!pending || !!pendingPhone;
      const hadIntents = intents.length > 0;
      pending = null;
      pendingPhone = null;
      intents = [];
      updateQueueView();
      if (hadPending || hadIntents) {
        await patchChat({
          澄湾待更新正文: null,
          澄湾待更新手机: null,
          澄湾排队操作: [],
        });
      }
      const start = action === 'player_send' ? id + 1 : id;
      const remove = Array.from({ length: Math.max(0, getLastMessageId() - start + 1) }, (_, offset) => start + offset);
      await deleteMessages(remove, { refresh: 'affected' });
      setError('');
      if (action !== 'delete') {
        refresh();
        await saveChat();
        const latest = getChatMessages(-1)[0];
        if (latest?.role === 'assistant')
          await send('接续上一段剧情，不重复已写内容。', false, undefined, uid('continue'), false, undefined, true);
        else await send(latest?.message ?? '', false, messageExtra(latest).cw_use_intent);
        return;
      }
    }
    refresh();
    await saveChat();
  }
  function phoneAlreadyCommitted(p: NonNullable<typeof pendingPhone>) {
    const current = activeContext();
    return current.chat === p.context.chat && current.floor === p.context.floor &&
      current.swipe === p.context.swipe && current.branch === p.context.branch &&
      !!service.host.read(p.context.floor).stat_data._系统.提交记录[p.id];
  }
  function assertPhoneResultCurrent(result: PhoneActionResult, startedEpoch: number) {
    requireWriter();
    if (cancelled || epoch !== startedEpoch) throw Error('手机结果已取消或上下文已变化');
    const context = activeContext();
    if (context.chat !== result.chatId || context.floor !== result.floor || context.swipe !== result.swipe ||
        !service.host.read(context.floor).stat_data._系统.提交记录[result.id])
      throw Error('手机结果不属于当前聊天、楼层或候选');
  }
  function confirmedPhoneResult(p: { id: string; action: PhoneAction; context: Context }, startedEpoch: number): PhoneActionResult {
    const result: PhoneActionResult = { ...phoneRequestIdentity(p.id, p.action, p.context), type: 'phone', status: 'confirmed' };
    assertPhoneResultCurrent(result, startedEpoch);
    return result;
  }
  function isPhoneResult(result: unknown): result is PhoneActionResult {
    return !!result && typeof result === 'object' && 'type' in result && result.type === 'phone' &&
      'status' in result && result.status === 'confirmed';
  }
  async function clearSavedPhone(p: NonNullable<typeof pendingPhone>) {
    const journal = getVariables({ type: 'chat' }).澄湾待确认提交;
    await patchChat({ 澄湾待更新手机: null, ...(journal?.commitId === p.id ? { 澄湾待确认提交: null } : {}) });
    if (pendingPhone === p) pendingPhone = null;
    view.phoneRequest = null;
  }
  async function phoneAction(action: PhoneAction, submissionId = uid('phone_round')): Promise<PhoneActionResult> {
    requireWriter();
    if (view.busy || view.updating || pending || view.managementPending) throw Error('请等待当前任务完成或恢复未确认角色管理操作');
    if (pendingPhone && !equal(pendingPhone.action, action)) throw Error('有待重试手机操作，请先重试或取消');
    view.busy = true;
    cancelled = false;
    const startedEpoch = epoch;
    const assertPhoneWritable = () => {
      requireWriter();
      if (cancelled || epoch !== startedEpoch) throw Error('手机任务已取消或上下文已变化');
    };
    setError('');
    let rejectedReply = false;
    let operation: NonNullable<typeof pendingPhone> | undefined;
    try {
      setPhoneRequest(pendingPhone ?? { id: submissionId, action, context: activeContext() },
        pendingPhone?.candidate ? 'saving' : pendingPhone?.reply ? 'settling' : 'sending');
      if (!pendingPhone) {
        const alreadyCommitted = !!service.host.read(activeContext().floor).stat_data?._系统?.提交记录?.[submissionId];
        if (!alreadyCommitted) {
          validateApi(settings.phone, '手机');
          await prepareWorldInformation();
          await scheduleCharacters('', action);
        }
        assertPhoneWritable();
        const context = activeContext(),
          envelope = copy(service.host.read(context.floor));
        pendingPhone = operation = {
          context,
          id: submissionId,
          envelope,
          // A retained queue entry can outlive its pending record. Rebuild only its
          // acknowledgement context; never apply the already-committed action again.
          draft: alreadyCommitted ? Schema.parse(envelope.stat_data) : applyPhoneAction(Schema.parse(envelope.stat_data), action),
          action: copy(action),
          source: messageSource(),
        };
        await savePhone();
      }
      const p = operation = pendingPhone;
      const { context, id, envelope } = p;
      assertPhoneWritable();
      assertMessageSource(p.source);
      setPhoneRequest(p, p.candidate ? 'saving' : p.reply ? 'settling' : 'sending');
      if (phoneAlreadyCommitted(p)) {
        setPhoneRequest(p, 'saving');
        await service.host.persist();
        assertPhoneWritable();
        assertMessageSource(p.source);
        if (!phoneAlreadyCommitted(p)) throw Error('保存期间候选变化，保留手机恢复记录');
        await clearSavedPhone(p);
        setError('');
        refresh();
        return confirmedPhoneResult(p, startedEpoch);
      }
      assertContext(context, activeContext());
      if (!p.candidate && !p.reply) {
        const selected = await selectInformation(p.draft,
          '玩家手机操作与待结算状态：' + JSON.stringify(action) + informationRetryHint(p.id),
          'phone:' + p.id + informationRetryHint(p.id), !!informationRetryHint(p.id));
        assertPhoneWritable();
        if (selected !== p.draft) {
          p.draft = selected;
          await savePhone();
        }
      }
      if (!p.candidate) {
        let draft = p.draft;
        const config = settings.phone;
        validateApi(config, '手机');
        const taskIds = pendingUpdateTasks(draft);
        const budget = phoneBudget(draft, action, view.data?._系统.生成密度);
        const instruction =
          '玩家手机操作：' +
          JSON.stringify(action) +
          '\n手机新内容数量参考（不限制变量更新权限）：' +
          JSON.stringify(budget) +
          '。私聊通常0–3条，仅必要时才达上限。根据已有权限、知情和实际活动处理回应，允许没有回应。玩家本次操作已写入候选快照，不重复发送。根据同一份变量更新规则，一并更新世界时间、天气、玩家状态、所有人物、关系、约定、资金、物品、地点、组织、事件及手机等需要变化的变量；不受当前会话或手机字段限制。时间按实际过程与规则判断，不使用现实API耗时。仅输出一个完整的变量更新块；所有下划线字段禁止更改。' +
          phoneTimePrompt(draft);
        const settled = await requestScopedUpdate(
          draft,
          envelope,
          async state =>
            withUpdateTasks(
              await livePromptConfig(state, instruction, 'worker', undefined, {
                session: action.kind === 'send' ? action.id : undefined,
                post: ['comment', 'like', 'repost'].includes(action.kind) ? action.id : undefined,
                platform: action.platform,
              }),
              state,
              taskIds,
            ),
          config,
          '手机',
          id,
          async state => {
            assertPhoneWritable();
            p.draft = state;
            delete p.reply;
            await savePhone();
          },
          p.reply,
          async text => {
            assertPhoneWritable();
            rejectedReply = false;
            p.reply = text;
            setPhoneRequest(p, 'settling');
            await savePhone();
          },
          () => {
            rejectedReply = true;
          },
        );
        assertPhoneWritable();
        draft = settled.before;
        const { text: reply, parsed } = settled;
        try {
          if (!/<JSONPatch>[\s\S]*?<\/JSONPatch>/i.test(reply)) throw Error('手机候选缺少完整 MVU 更新块');
          if (!parsed) throw Error('手机更新解析失败');
          let candidate = validateSettlement(draft, validateModel(draft, parsed.stat_data));
          assertPhoneActionNotRepeated(Schema.parse(envelope.stat_data), draft, candidate);
          candidate = finalizePhone(draft, candidate);
          validatePhoneTimeline(draft, candidate);
          candidate = finalizeUpdateTasks(draft, candidate, taskIds, reply);
          candidate = finalizeWorld(draft, candidate);
          candidate = refreshNovelSystem(candidate);
          assertPhoneWritable();
          assertMessageSource(p.source);
          if (action.kind !== 'refresh' || !equal(draft.手机.原文, candidate.手机.原文)) countRound(candidate, id);
          p.candidate = planTasks(candidate);
        } catch (error) {
          rejectedReply = true;
          throw error;
        }
        // Persist the exact derived result before journal/write I/O; retries do not regenerate or assign new delivery IDs.
        await savePhone();
      }
      assertPhoneWritable();
      setPhoneRequest(p, 'saving');
      view.updating = true;
      await service.commit(context, id, () => copy(p.candidate!), false, () => {
        assertPhoneWritable();
        assertMessageSource(p.source);
      });
      assertPhoneWritable();
      await clearSavedPhone(p);
      setError('');
      refresh();
      return confirmedPhoneResult(p, startedEpoch);
    } catch (e) {
      const invalidated = cancelled || startedEpoch !== epoch;
      if (pendingPhone && rejectedReply && !pendingPhone.candidate) delete pendingPhone.reply;
      if (invalidated) view.phoneRequest = null;
      else if (pendingPhone) setPhoneRequest(pendingPhone, 'failed');
      setError(invalidated ? '' : e);
      try {
        if (!disposed && SillyTavern.getCurrentChatId() === boundChat) {
          if (invalidated && operation && pendingPhone === operation) {
            if (phoneAlreadyCommitted(operation)) {
              // Stop cannot undo an issued write. Keep its identity so retry only confirms that same submission.
              setPhoneRequest(operation, 'failed');
              setError('手机提交已写入，保存确认尚未完成，请重试确认');
              await savePhone();
            } else await clearSavedPhone(operation);
          } else await savePhone();
        }
      } catch (saveError) {
        if (pendingPhone) setPhoneRequest(pendingPhone, 'failed');
        setError('手机恢复记录保存未确认：' + String(saveError));
        throw Error(view.error, { cause: e });
      }
      throw e;
    } finally {
      view.busy = false;
      view.updating = false;
      refresh();
    }
  }
  async function refreshNovelContent(target: NovelRefreshTarget, id: string) {
    requireWriter();
    const context = activeContext(), journal = getVariables({ type: 'chat' }).澄湾待确认提交;
    view.busy = true;
    try {
      if (cancelled || disposed) throw Error('奇遇刷新已取消');
      if (service.host.read(context.floor).stat_data?._系统?.提交记录?.[id]) {
        await service.host.persist();
        if (journal?.commitId === id) await service.host.journal(null);
      } else if (journal?.commitId === id) {
        await service.commit(journal.context, id, () => Schema.parse(journal.candidate));
        await service.host.journal(null);
      } else {
        validateApi(settings.phone, '手机与奇遇');
        const state = Schema.parse(service.host.read(context.floor).stat_data);
        const config = novelRefreshPrompt(state, target);
        console.info('[瓦洛兰奇遇] 开始刷新', target);
        const text = await request({ ...config, custom_api: apiConnection(settings.phone) }, true, settings.phone.retries, false, 'novel');
        if (cancelled || disposed) throw Error('奇遇刷新已取消');
        const item = intents.find(intent => intent.id === id);
        if (item) assertMessageSource(item.source, undefined, true);
        view.updating = true;
        await service.commit(context, id, candidate => applyNovelRefresh(candidate, target, text, id));
      }
      setError('');
      console.info('[瓦洛兰奇遇] 刷新已保存', target);
    } catch (error) {
      if (cancelled) await persistIntents([id]);
      setError(cancelled ? '' : error);
      throw error;
    } finally {
      view.busy = false;
      view.updating = false;
      refresh();
    }
  }
  function novelRefresh(target: NovelRefreshTarget) {
    requireManagementIdle('刷新奇遇内容');
    if (!['tasks', 'shop', 'initial'].includes(target)) throw Error('未知的奇遇刷新目标');
    if (!view.data?.奇遇系统._启用) throw Error('请先开启奇遇系统');
    validateApi(settings.phone, '手机与奇遇');
    novelRefreshPrompt(view.data, target);
    cancelled = false;
    return submit('novel', { target });
  }
  // Manual maintenance only queues work for the next authorized interaction.
  function runBackground(retryFailed = false): Promise<void> {
    if (!retryFailed) return Promise.resolve();
    return commit(s => {
      for (const task of Object.values(s._系统.任务))
        if (task.状态 === '失败' && taskHasActiveTargets(s, task)) {
          task.状态 = '排队';
          task.错误 = null;
          task.重试次数 += 1;
        }
    });
  }
  function foreground<T>(kind: string, action: () => Promise<T>, key = uid('operation')): Promise<T> {
    requireWriter();
    const expectedEpoch = epoch;
    return scheduler.run(
      { key, label: kind === 'recovery' ? '恢复未完成操作' : '保存操作', kind, background: false },
      async () => {
        requireWriter();
        if (epoch !== expectedEpoch) throw Error('排队期间上下文已变化，请重新执行');
        const result = await action();
        const committed = view.data?._系统.提交记录 ?? {};
        const completed = intents.filter(i => committed[i.id]).map(i => i.id);
        if (completed.length) await persistIntents(completed);
        if (isPhoneResult(result)) assertPhoneResultCurrent(result, expectedEpoch);
        return result;
      },
    );
  }
  function enqueueIntent(item: Intent, onSent?: () => void): Promise<PhoneActionResult | void> {
    const existing = scheduler.get(item.id);
    if (existing) return existing;
    scheduled.add(item.id);
    if (!intents.some(i => i.id === item.id)) intents.push(item);
    const persisted = saveIntents();
    // Catch immediately; execution still awaits and propagates the persistence failure.
    void persisted.catch(() => {});
    const expectedEpoch = epoch;
    const result = scheduler.run({ key: item.id, label: item.label, kind: item.kind, background: false }, async () => {
      await persisted;
      requireWriter();
      if (item.chat !== boundChat || expectedEpoch !== epoch) throw Error('排队期间聊天或分支已变化，请重新执行');
      assertMessageSource(item.source, undefined, true);
      refresh();
      let phoneResult: PhoneActionResult | void = undefined;
      if (item.kind === 'novel' && item.target) {
        if (pending || pendingPhone || failedSend) throw Error('有尚未完成的操作，请先重试或取消');
        await refreshNovelContent(item.target, item.id);
      } else if (!view.data?._系统.提交记录[item.id]) {
        if (pending?.id === item.id || pendingPhone?.id === item.id || failedSend?.id === item.id) phoneResult = await retry();
        else {
          if (pending || pendingPhone || failedSend) throw Error('有尚未完成的操作，请先重试或取消');
          if (item.kind === 'story')
            await send(item.text ?? '', item.append !== false, item.intent, item.id, item.opening, onSent);
          else if (item.action) phoneResult = await phoneAction(copy(item.action), item.id);
          else throw Error('手机操作记录缺少内容');
        }
      } else if (item.kind === 'phone' && item.action) {
        if (pending || failedSend || (pendingPhone && pendingPhone.id !== item.id))
          throw Error('有尚未完成的操作，请先重试或取消');
        // A commit ID proves the atomic write, not durable acknowledgement. Use the
        // same recovery path as retry(), including persistence, cleanup and stop checks.
        phoneResult = await phoneAction(copy(item.action), item.id);
      }
      if (item.kind === 'phone' && !phoneResult) throw Error('手机操作尚未返回确认结果，请检查待恢复记录');
      await persistIntents([item.id]);
      if (phoneResult) assertPhoneResultCurrent(phoneResult, expectedEpoch);
      return phoneResult;
    });
    return result.finally(() => {
      scheduled.delete(item.id);
      updateQueueView();
    });
  }
  function submit(
    kind: 'phone', payload: Pick<Intent, 'action'>, onSent?: () => void,
    onRequest?: (identity: PhoneRequestIdentity) => void,
  ): Promise<PhoneActionResult>;
  function submit(
    kind: 'story' | 'novel',
    payload: Pick<Intent, 'text' | 'action' | 'append' | 'intent' | 'opening' | 'target'>,
    onSent?: () => void,
  ): Promise<void>;
  function submit(
    kind: 'story' | 'phone' | 'novel',
    payload: Pick<Intent, 'text' | 'action' | 'append' | 'intent' | 'opening' | 'target'>,
    onSent?: () => void,
    onRequest?: (identity: PhoneRequestIdentity) => void,
  ): Promise<PhoneActionResult | void> {
    requireWriter();
    payload = copy(payload);
    const duplicate = intents.find(
      i => scheduled.has(i.id) && i.kind === kind && equal(_.pick(i, Object.keys(payload)), payload),
    );
    if (duplicate) {
      if (kind === 'phone' && duplicate.action) {
        const identity = submittedPhoneIdentities.get(duplicate) ?? phoneRequestIdentity(
          duplicate.id, duplicate.action, pendingPhone?.id === duplicate.id ? pendingPhone.context : activeContext(),
        );
        onRequest?.({ ...identity });
      }
      return scheduler.get(duplicate.id)!;
    }
    if ((pending || pendingPhone || failedSend) && !['story', 'phone'].includes(scheduler.active?.kind ?? ''))
      return Promise.reject(Error('有尚未完成的操作，请先重试或取消'));
    if (kind === 'story' && (view.busy || view.updating) && view.operation !== 'background')
      return Promise.reject(Error('请等待本轮正文与变量更新完成'));
    const phoneLabels = {
      send: '发送消息',
      post: '发布动态',
      comment: '评论',
      like: '切换点赞',
      repost: '转发',
      refresh: '刷新',
      invite: '群聊邀约',
    };
    const label = kind === 'novel' ? (payload.target === 'initial' ? '奇遇：生成初始任务与商品' :
      payload.target === 'tasks' ? '奇遇：刷新任务' : '奇遇：刷新商店') :
      kind === 'story'
        ? '正文：' + (payload.text ?? '').slice(0, 32)
        : '手机' +
          phoneLabels[payload.action!.kind] +
          '：' +
          (payload.action?.text ?? blockText(payload.action?.blocks ?? [])).slice(0, 32);
    const item: Intent = {
      id: uid('action'),
      kind,
      label,
      chat: boundChat,
      source: messageSource(),
      ...copy(payload),
    };
    if (kind === 'phone' && item.action) {
      const identity = phoneRequestIdentity(item.id, item.action, activeContext());
      submittedPhoneIdentities.set(item, identity);
      // Notify this caller synchronously, before scheduling. Frontend mirrors may
      // never observe a short-lived phoneRequest status, so they cannot bind IDs by polling it.
      onRequest?.({ ...identity });
    }
    return enqueueIntent(item, onSent);
  }
  function resumeQueued(id: string) {
    requireWriter();
    const item = intents.find(i => i.id === id);
    if (!item) throw Error('待发送操作不存在');
    if (item.kind === 'novel') cancelled = false;
    return enqueueIntent(item);
  }
  async function cancelQueued(id: string) {
    requireWriter();
    if (scheduler.active?.key === id) throw Error('操作正在执行，请使用停止按钮');
    const novel = intents.find(item => item.id === id && item.kind === 'novel');
    if (novel?.target && view.data?._系统.提交记录[id]) {
      cancelled = false;
      await foreground('recovery', () => refreshNovelContent(novel.target!, id), 'confirm:' + id);
      await persistIntents([id]);
      return;
    }
    if ([pending?.id, pendingPhone?.id, failedSend?.id].includes(id) ||
        intents.some(item => item.id === id && item.kind === 'novel')) {
      await foreground('recovery', discardPending, 'discard');
      return;
    }
    scheduler.cancel(id);
    await persistIntents([id]);
  }
  const listeners: EventOnReturn[] = [];
  async function discardStaleRecovery() {
    const previous = pending;
    const current = activeContext();
    const sourceMatches = (source: MessageSource | undefined, replyFloor?: number) => {
      try {
        assertMessageSource(source, replyFloor);
        return true;
      } catch {
        return false;
      }
    };
    const valid = (context: Context, source: MessageSource | undefined, replyFloor?: number) =>
      equal(context, current) && sourceMatches(source, replyFloor);
    const pendingCommitted = pending && pendingAlreadyCommitted(pending, current);
    const stalePending =
      pending &&
      ((!pendingCommitted && (firstUnsettledNarrative()?.message_id ?? pending.replyFloor) !== pending.replyFloor) ||
        !(pendingCommitted ? sourceMatches(pending.source, pending.replyFloor) : valid(pending.context, pending.source, pending.replyFloor)) ||
        (pending.replyFloor !== undefined &&
          pending.replySwipe !== undefined &&
          getChatMessages(pending.replyFloor, { include_swipes: true })[0]?.swipe_id !== pending.replySwipe) ||
        (pending.replyFloor !== undefined &&
          stripProtocol(getChatMessages(pending.replyFloor)[0]?.message ?? '') !== stripProtocol(pending.text)));
    const phoneCommitted = pendingPhone && phoneAlreadyCommitted(pendingPhone);
    const stalePhone = pendingPhone && !(phoneCommitted
      ? sourceMatches(pendingPhone.source)
      : valid(pendingPhone.context, pendingPhone.source));
    const staleFailed = failedSend && !valid(failedSend.context, failedSend.source);
    if (!stalePending && !stalePhone && !staleFailed) return;
    if (stalePending) pending = null;
    if (stalePhone) pendingPhone = null;
    if (staleFailed) failedSend = null;
    await patchChat({
      澄湾待更新正文: pending,
      澄湾待更新手机: pendingPhone,
      澄湾失败请求: failedSend,
    });
    setError('楼层已变化，旧请求已清理；现在可以重新发送');
    if (stalePending && previous) await restoreOrphanedNarrative(previous);
  }
  function firstUnsettledNarrative() {
    const base = activeContext().floor;
    const last = getLastMessageId();
    if (last <= base) return undefined;
    return getChatMessages(`${base + 1}-${last}`).find(message => {
      const extra = messageExtra(message);
      return message.role === 'assistant' &&
        extra.cw_update_pending && !extra.cw_incomplete;
    });
  }
  async function restoreOrphanedNarrative(previous?: NonNullable<typeof pending>) {
    if (pending || pendingPhone || failedSend) return;
    const last = firstUnsettledNarrative();
    if (!last || last.role !== 'assistant') return;
    const extra = messageExtra(last);
    if (!extra.cw_update_pending || extra.cw_incomplete) return;
    const replySwipe = getChatMessages(last.message_id, { include_swipes: true })[0]?.swipe_id ?? 0;
    if (isCommittedCandidate(last.data?.stat_data, last.message_id, replySwipe)) {
      delete extra.cw_update_pending;
      delete extra.cw_story_request;
      await setMessages([{ message_id: last.message_id, extra }], { refresh: 'affected' });
      await saveChat();
      return;
    }
    const context = activeContext();
    const narrative = stripProtocol(last.message);
    if (!narrative) {
      setError('待更新楼层没有正文，请删除该楼层后重新发送');
      return;
    }
    const original = previous?.replyFloor === last.message_id && (previous.replySwipe ?? 0) === replySwipe
      ? previous : extra.cw_story_request as Awaited<ReturnType<typeof narrativeRequest>> | undefined;
    if (!original?.id || !original.source) {
      setError('待结算正文缺少原请求归属，不能绑定当前输入；请删除该正文后重新发送');
      return;
    }
    try {
      assertContext(original.context, context);
      assertMessageSource(original.source, last.message_id);
      if ('text' in original && stripProtocol(original.text) !== narrative) throw Error('正文已编辑');
      if ('narrativeHash' in original && original.narrativeHash !== await sha256(new TextEncoder().encode(narrative))) throw Error('正文已编辑');
    } catch {
      setError('待结算正文的原请求已失效，不能绑定当前输入；请删除该正文后重新发送');
      return;
    }
    pending = {
      context,
      envelope: copy(service.host.read(context.floor)),
      text: last.message,
      id: original.id,
      intent: IntentSchema.shape.intent.parse(original.intent),
      source: original.source,
      replyFloor: last.message_id,
      replySwipe,
      mode: 'extra',
      openingTaskId: original.openingTaskId,
    };
    await savePending();
    setError('已找回待结算正文，请点击重试完成变量更新');
  }
  function startOpening() {
    requireWriter();
    if (!view.data?._系统.建档完成) return Promise.reject(Error('请先保存建档资料'));
    if (pending || failedSend) return foreground('recovery', retry, 'retry');
    const queued = intents.find(i => i.opening);
    if (queued) return enqueueIntent(queued);
    if (Object.keys(view.data._系统.已计轮事件).length) return runBackground(true);
    return submit('story', {
      opening: true,
      text: openingMessage,
    });
  }
  async function start() {
    view.readOnly = true;
    await new Promise<void>((ready, reject) => {
      writerTask = requestBrowserLock('澄湾写入:' + boundChat, {
        ifAvailable: true,
        onLost: error => {
          view.readOnly = true;
          epoch++;
          stop();
          setError(error);
          releaseWriter?.();
        },
      }, async lock => {
          if (!lock) {
            setError('此聊天已有活动写入窗口，本窗口只读');
            ready();
            return;
          }
          if (disposed) {
            ready();
            return;
          }
          view.readOnly = false;
          writerLock = lock;
          const held = new Promise<void>(resolve => {
            releaseWriter = resolve;
          });
          ready();
          await held;
        })
        .catch(reject);
    });
    if (disposed || SillyTavern.getCurrentChatId() !== boundChat) return;
    const loadedSettings = await settingsController.load();
    if (disposed || SillyTavern.getCurrentChatId() !== boundChat) return;
    Object.assign(settings, loadedSettings.value);
    view.settingsWarning = loadedSettings.warning;
    refresh();
    if (view.managementPending) setError('角色管理保存尚未确认，请点击重试；恢复快照已独立保留');
    if (!view.readOnly) await settingsController.recoverLegacyRules();
    if (!view.readOnly) await settingsController.syncRules(settings);
    if (
      !view.readOnly &&
      Object.values(view.data?._系统.任务 ?? {}).some(t => ['生成中', '待校验', '待提交'].includes(t.状态))
    ) {
      await service.commit(activeContext(), uid('task_recovery'), s => {
        for (const t of Object.values(s._系统.任务))
          if (['生成中', '待校验', '待提交'].includes(t.状态)) {
            t.状态 = '失败';
            t.错误 = '上次任务已中断，等待手动重试';
          }
      });
      refresh();
    }
    // Task recovery can change the committed version. Rebuild pending contexts
    // afterwards so a fresh recovery is not stale before the first retry.
    if (!view.readOnly) {
      try {
        await discardStaleRecovery();
        await restoreOrphanedNarrative();
      } catch (error) {
        // Keep the service available so the player can switch back to a valid candidate.
        if (!(error instanceof CandidateIdentityError)) throw error;
        setError(error);
        refreshMessages();
      }
    }
    if (pending || failedSend || pendingPhone) setError('上次请求尚未完成，请点击重试');
    listeners.push(
      eventOn(iframe_events.STREAM_TOKEN_RECEIVED_FULLY, (text, id) => {
        if (id === generationId && view.operation === 'story' && !view.updating) view.streaming = text;
      }),
    );
    listeners.push(eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, (next, old) => {
      if (!old?.stat_data || !next?.stat_data) return;
      try { assertDisabledUnchanged(Schema.parse(old.stat_data), Schema.parse(next.stat_data)); }
      catch (error) {
        next.stat_data = copy(old.stat_data);
        console.warn('[瓦洛兰角色启停] 已拒绝停用人物活动', error);
        throw error;
      }
    }));
    const chat = SillyTavern.getCurrentChatId();
    listeners.push(
      eventOn(tavern_events.CHAT_CHANGED, () => {
        if (SillyTavern.getCurrentChatId() !== chat) {
          epoch++;
          stop();
          window.location.reload();
        }
      }),
    );
    listeners.push(
      eventOn(tavern_events.MESSAGE_EDITED, async id => {
        try {
          if (view.readOnly || id === 0 || id !== getLastMessageId()) return;
          const edited = getChatMessages(id)[0];
          if (edited?.role !== 'assistant' || edited.data?.stat_data?._系统?.楼层id !== id) return;
          const extra = messageExtra(edited);
          extra.cw_update_pending = true;
          await setMessages([{ message_id: id, extra }], { refresh: 'affected' });
          const context = activeContext();
          pending = {
            context,
            envelope: copy(service.host.read(context.floor)),
            text: edited.message,
            id: uid('edited_round'),
            source: messageSource().filter(m => m.id !== id),
            replyFloor: id,
            replySwipe: getChatMessages(id, { include_swipes: true })[0]?.swipe_id ?? 0,
            mode: 'extra',
          };
          extra.cw_story_request = await narrativeRequest(pending);
          await setMessages([{ message_id: id, extra }], { refresh: 'affected' });
          await savePending();
          setError('正文已编辑，点击澄湾输入区“立即重试”重新结算变量');
          refresh();
        } catch (error) {
          setError('编辑后的变量尚未重新结算：' + String(error));
          console.error('[瓦洛兰原生编辑] 记录待更新失败', error);
        }
      }),
    );
    for (const event of [
      tavern_events.MESSAGE_SWIPED,
      tavern_events.MESSAGE_DELETED,
      tavern_events.MESSAGE_UPDATED,
      tavern_events.USER_MESSAGE_RENDERED,
      tavern_events.CHARACTER_MESSAGE_RENDERED,
      Mvu.events.VARIABLE_UPDATE_ENDED,
    ])
      listeners.push(
        eventOn(event as any, () => {
          if (event === tavern_events.MESSAGE_UPDATED && requestSource) {
            try {
              assertMessageSource(requestSource, undefined, true);
            } catch {
              staleSource = true;
              stop();
            }
          }
          if (event === tavern_events.MESSAGE_SWIPED || event === tavern_events.MESSAGE_DELETED) {
            epoch++;
            stop();
            pending = null;
            pendingPhone = null;
            failedSend = null;
            const obsolete = intents.map(i => i.id);
            intents = [];
            updateQueueView();
            if (!view.readOnly)
              void (async () => {
                await savePending();
                await savePhone();
                await saveFailed();
                await persistIntents(obsolete);
              })().catch(e => {
                setError(e);
              });
          }
          refresh();
        }),
      );
  }
  function dispose() {
    if (disposed) return writerTask ?? Promise.resolve();
    disposed = true;
    scheduler.close();
    epoch++;
    stop();
    listeners.forEach(l => l.stop());
    releaseWriter?.();
    return writerTask ?? Promise.resolve();
  }
  return {
    view,
    settings,
    service,
    start,
    dispose,
    refresh,
    refreshMessages,
    manageCharacters,
    manageInformation,
    novelAction,
    novelRefresh,
    exportManagedCharacter: (id: string) => {
      requireWriter();
      return exportManagedCharacter(Schema.parse(service.host.read(activeContext().floor).stat_data), getVariables({ type: 'chat' })[LIBRARY_KEY], id);
    },
    commit: (mutate: (s: State) => void | State, id = uid('commit')) =>
      foreground('local', () => commit(mutate, id), id),
    createProfile: (payload: Parameters<typeof saveCreatedProfile>[0]) =>
      foreground('local', () => saveCreatedProfile(payload), payload.submissionId),
    send: (text: string, append = true, intent?: UseIntent, onSent?: () => void) =>
      submit('story', { text, append, intent }, onSent),
    startOpening,
    stop,
    retry: (): Promise<PhoneActionResult | void> => {
      const existing = scheduler.get('retry');
      if (existing) return existing;
      if (view.busy || view.updating) return Promise.reject(Error('当前操作仍在执行，请等待或停止'));
      return foreground('recovery', retry, 'retry');
    },
    discardPending: () => foreground('recovery', discardPending, 'discard'),
    messageAction: (action: string, id: number, text?: string) =>
      foreground('local', () => messageAction(action, id, text), `message:${action}:${id}`),
    saveSettings,
    reloadSettings,
    phoneAction: (action: PhoneAction, onRequest?: (identity: PhoneRequestIdentity) => void): Promise<PhoneActionResult> => {
      try {
        return submit('phone', { action }, undefined, onRequest);
      } catch (error) {
        return Promise.reject(error);
      }
    },
    runBackground,
    readAlertMemory,
    saveAlertMemory,
    resumeQueued,
    cancelQueued,
    revision: () => [...Object.values(view), ...Object.values(settings)],
    snapshot: () => JSON.stringify({ view, settings }),
  };
}
export type Runtime = ReturnType<typeof createRuntime>;
export const RuntimeKey = Symbol('澄湾运行服务');
