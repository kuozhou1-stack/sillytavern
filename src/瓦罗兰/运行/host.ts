import { validateSettlement, validateUse, type UseIntent } from './settlement';
import { phoneBudget } from './phone-budget';
import { normalizePhoneRecordPatches } from './model-phone-patch';
import { phoneRequestIdentity, type PhoneRequestIdentity, type PhoneRequestState, type PhoneRequestStatus, type PhoneActionResult } from './phone-request';
import { finalizeWorld, normalizeWorldAnchorPatches, restoreWorldAnchors } from './world';
import { reactive } from 'vue';
import { sha256 } from './browser-crypto';
import { requestBrowserLock, type BrowserLock } from './browser-lock';
import { livePromptConfig, nativePromptConfig, variableRulePrompts } from './prompts';
import { normalizeGeographicNames } from './地理名称';
import { normalizeWorldInformation } from './世界资料';
import { normalizeMapLandmarks } from './地图地标';
import {
  prepareInformationCommand, informationSelectionPrompt,
  hasAutomaticInformation, assertInformationPatch, type InformationKind, type InformationMode,
  ensureInformationContext, expandInformationForRetry, InformationNotLoadedError,
  parseInformationSelection, applyInformationSelectionValues,
} from './knowledge-context';
import { mergeOpeningTasks, planOpeningCharacters, openingMessage } from './opening';
import { taskReceipt, type UpdateReceipt } from './update-receipt';
import { planTasks } from './tasks';
import { pendingUpdateTasks, withUpdateTasks, finalizeUpdateTasks } from './update-tasks';
import { phoneTimePrompt } from './phone';
import { applyPhoneAction, assertPhoneActionNotRepeated, blockText, finalizePhone, type PhoneAction } from './phone';
import { Schema } from '../schema';
import { messageSource, assertMessageSource, MessageSourceError, MessageSourceSchema, sameAssistantFloorText, assistantFloorTextVariants, type MessageSource } from './request-source';
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

import { SettingsSchema, createSettingsController, validateApi, apiConnection, informationApi, type ApiSettings, type SettingsChannel, type SettingsScope } from './settings';
import { atmospherePrompt } from './atmosphere';
import { stripProtocol, storedNarrative, updateBlock, protocolJson } from './message-protocol';
import { withPromptContext, preparePromptWorldbook } from './prompt-context';
import { variableResponseBlock, variableResponseSchema } from './variable-response';
import { withPromptInstructions, promptProjections } from './model-history';
import { savedChanges, storyChangeStatus, type StorySettlement } from './variable-changes';
import { applyCommitReplay, replayAfterStory, MissingCommitReplay, type CommitReplay } from './commit-replay';
import { legacyStoryReplay } from './story-backup';
import { CandidateIdentityError, isCommittedCandidate } from './committed-candidate';
import { assertMvuCommandResult } from './mvu-schema';
import { persistChat } from './chat-persistence';
import { LIBRARY_KEY, LibrarySchema, libraryView, prepareLibraryCommand, exportManagedCharacter, type LibraryCommand, type LibraryView } from './character-library';
import { prepareCharacterRoster, prepareOpeningCharacterRoster, characterSelectionContext } from './character-roster';
import { createProfile, initialConnectionIds } from './creation';
import { assertDisabledUnchanged, taskHasActiveTargets } from './character-activity';
import { applyNovelAction, refreshNovelSystem, type NovelAction } from './novel-system';
import { applyNovelRefresh, novelRefreshPrompt, type NovelRefreshTarget } from './novel-refresh';
const normalizeRuntimeWorld = (state: State): State =>
  normalizeWorldInformation(normalizeMapLandmarks(normalizeGeographicNames(state)));

export { stripProtocol } from './message-protocol';
export { SettingsSchema } from './settings';
export type { PhoneRequestIdentity, PhoneRequestState, PhoneRequestStatus, PhoneActionResult } from './phone-request';
// Tavern logs event-listener exceptions without rejecting parseMessage. Keep the
// rejection on that exact candidate so a rolled-back update cannot look successful.
const rejectedMvuCandidates = new WeakMap<Mvu.MvuData, unknown>();
async function parseCandidate(text: string, envelope: Mvu.MvuData) {
  const { commands } = updateBlock(text);
  const base = copy(envelope);
  // 旧存档只在候选快照内补新分组，不改活动楼层，也不放宽只读字段校验。
  if (!Object.hasOwn(base.stat_data, '奇遇系统')) base.stat_data.奇遇系统 = Schema.parse({}).奇遇系统;
  if (!Object.hasOwn(base.stat_data._系统 ?? {}, '资料加载'))
    _.set(base.stat_data, '_系统.资料加载', Schema.parse({})._系统.资料加载);
  const before = Schema.parse(base.stat_data);
  const normalized = normalizePhoneRecordPatches(before, normalizeWorldAnchorPatches(before, commands));
  assertInformationPatch(before, normalized);
  assertModelPrivatePatches(before, normalized);
  // Give MVU only the extracted commands, without preset markup or explanation examples.
  const safeBlock = `<UpdateVariable><JSONPatch>${protocolJson(normalized)}</JSONPatch></UpdateVariable>`;
  const parsed = await Mvu.parseMessage(safeBlock, base);
  if (parsed) assertMvuCommandResult(parsed);
  if (parsed && rejectedMvuCandidates.has(parsed)) {
    const error = rejectedMvuCandidates.get(parsed);
    rejectedMvuCandidates.delete(parsed);
    throw error;
  }
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
export function activeContext(lastFloor = getLastMessageId()): Context {
  const chat = SillyTavern.getCurrentChatId();
  if (!chat) throw Error('请先打开瓦洛兰聊天');
  const active = (() => {
    for (let end = lastFloor; end >= 0; end -= 10) {
      const floors = getChatMessages(`${Math.max(0, end - 9)}-${end}`, { role: 'assistant', include_swipes: true });
      for (const f of floors.reverse()) {
        const data = f.swipes_data[f.swipe_id]?.stat_data;
        const extra = messageExtra({ extra: f.swipes_info[f.swipe_id] });
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
/** A source mismatch whose recovery records and player notice were already handled by send(). */
class StaleStoryRequestError extends MessageSourceError {}

export function createRuntime() {
  // Keep the original callback: Helper's returned stop handle loses this mapping.
  function listen<T extends EventType>(event: T, listener: ListenerType[T]): EventOnReturn {
    eventOn(event, listener);
    return { stop: () => eventRemoveListener(event, listener) };
  }
  const boundChat = SillyTavern.getCurrentChatId();
  const view = reactive({
    data: null as State | null,
    characterLibrary: null as LibraryView | null,
    managementPending: false,
    messages: [] as any[],
    busy: false,
    updating: false,
    error: '',
    canResend: false,
    loadError: '',
    loading: false,
    loadPhase: '' as '' | 'read' | 'worldbook' | 'recovery',
    settingsWarning: '',
    streaming: '',
    readOnly: false,
    operation: '',
    phase: '',
    updates: [] as UpdateReceipt[],
    queued: [] as { id: string; label: string; kind: string }[],
    recoverable: [] as { id: string; label: string; kind: string; preview: string }[],
    phoneRequest: null as PhoneRequestState | null,
  });
  let errorSource: 'candidate' | 'operation' | 'source' = 'operation';
  function setError(error: unknown) {
    errorSource = error instanceof CandidateIdentityError ? 'candidate' : 'operation';
    view.canResend = false;
    view.error = String(error);
  }
  function setSourceChangeError(message: string) {
    setError(message);
    errorSource = 'source';
    updateResendState();
  }
  function updateResendState() {
    if (errorSource !== 'source') return;
    view.canResend = !view.readOnly && !view.loadError && !disposed &&
      SillyTavern.getCurrentChatId() === boundChat && !pending && !failedSend && !pendingPhone &&
      !intents.length && !getVariables({ type: 'chat' }).澄湾待确认提交 && !firstUnsettledNarrative();
  }
  function setLoadError(error: unknown, phase: 'read' | 'worldbook' | 'recovery' = 'read') {
    view.loadPhase = phase;
    view.loadError = error instanceof z.ZodError
      ? `存档字段“${error.issues[0]?.path.join('.') || '存档内容'}”格式不正确。`
      : String(error);
    setError(error instanceof CandidateIdentityError ? error : view.loadError);
    console.error('[瓦洛兰存档] 读取或恢复失败', error);
  }
  const settings = reactive(SettingsSchema.parse(getVariables({ type: 'character' }).澄湾设置));
  const settingsController = createSettingsController(requireWriter);
  let disposed = false;
  let generationId: string | null = null;
  let cancelled = false;
  let epoch = 0;
  let requestSource: MessageSource | undefined;
  let sourceChange: MessageSourceError | undefined;
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
    inputSaved: z.boolean().optional(),
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
  let phaseOwner = '';
  const scheduler = new RequestScheduler((active, waiting) => {
    if ((active?.key ?? '') !== phaseOwner) {
      phaseOwner = active?.key ?? '';
      if (active) view.phase = 'preparing';
      else if (!view.error) view.phase = '';
    }
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
  function requireLoaded() {
    if (view.loading) throw Error('请先完成存档读取和恢复，再进行操作');
    if (view.loadError) {
      if (errorSource === 'candidate') throw new CandidateIdentityError(view.loadError);
      throw Error(view.loadError);
    }
    if (!view.data) throw Error('尚未读取到有效的存档状态');
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
  function writeStoryCandidate(floor: number, swipe: number, text: string, extra: Record<string, any>, data?: Mvu.MvuData) {
    const row = getChatMessages(floor, { include_swipes: true })[0];
    if (row?.message_id !== floor || row.swipe_id !== swipe) throw Error('正文候选已切换，请返回原候选后重试');
    const { swipes, swipes_data, swipes_info } = row;
    swipes[swipe] = text;
    if (data) swipes_data[swipe] = data;
    // 助手的候选数组写法保留其他 swipe_info；旧酒馆候选可把业务字段放在嵌套 extra 中。
    const info = swipes_info[swipe];
    const cardFields = _.pickBy(extra, (_value, key) => key.startsWith('cw_'));
    for (const target of [info, info.extra].filter(_.isPlainObject)) {
      for (const key of Object.keys(target)) if (key.startsWith('cw_')) delete target[key];
      Object.assign(target, cardFields);
    }
    return setMessages([{ message_id: floor, swipe_id: swipe, swipes, swipes_data, swipes_info }], { refresh: 'affected' });
  }
  const deleteMessages = (...args: Parameters<typeof deleteChatMessages>) => {
    requireWriter();
    return deleteChatMessages(...args);
  };
  const saveChat = () => {
    requireWriter();
    return persistChat();
  };
  // 保存等待期间仍可入队。只对本次待确认的出队项暂时隐藏，失败时按原顺序恢复。
  let confirmingRemovals: string[] = [];
  const queueForSave = () => intents.filter(item => !confirmingRemovals.includes(item.id));
  function patchChat(patch: Record<string, unknown>, removeIntents: string[] = []) {
    const saved = copy(patch);
    const operation = chatWrites.then(async () => {
      requireWriter();
      const previous = getVariables({ type: 'chat' });
      confirmingRemovals = removeIntents.filter(id => intents.some(item => item.id === id));
      if (confirmingRemovals.length) saved.澄湾排队操作 = queueForSave();
      if (!Object.keys(saved).length) return;
      try {
        await replaceVariables({ ...previous, ...saved }, { type: 'chat' });
        requireWriter();
        const readback = getVariables({ type: 'chat' });
        for (const key of Object.keys(saved)) {
          const expected = key === '澄湾排队操作' ? queueForSave() : saved[key];
          if (!equal(readback[key], expected)) throw Error('聊天恢复记录保存不一致：' + key);
        }
        await saveChat();
        if (confirmingRemovals.length) {
          intents = queueForSave();
          updateQueueView();
        }
      } catch (error) {
        // Failed acknowledgement must not remove the only local recovery record.
        // 清除日志与原请求基线交接同属一次保存，失败时一起保留原恢复依据。
        if (!disposed && SillyTavern.getCurrentChatId() === boundChat) {
          requireWriter();
          const current = getVariables({ type: 'chat' });
          const restore = Object.fromEntries(Object.keys(saved)
            .filter(key => previous[key] != null && ((saved[key] === null && current[key] === null) ||
              (key === '澄湾失败请求' && saved.澄湾待确认提交 === null && equal(current[key], saved[key]))))
            .map(key => [key, previous[key]]));
          if (confirmingRemovals.length) restore.澄湾排队操作 = copy(intents);
          if (Object.keys(restore).length) await replaceVariables({ ...current, ...restore }, { type: 'chat' });
        }
        throw error;
      } finally {
        confirmingRemovals = [];
      }
    });
    chatWrites = operation.catch(() => {});
    return operation;
  }
  const persistIntents = (remove: string[]) => patchChat({}, remove);
  const saveIntents = () => {
    requireWriter();
    const currentVars = getVariables({ type: 'chat' });
    replaceVariables({ ...currentVars, 澄湾排队操作: queueForSave() }, { type: 'chat' });
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
    replay?: CommitReplay;
    revisionVersion?: number;
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
    replyFormat?: 'structured';
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
      replay: p.replay, revisionVersion: p.revisionVersion,
      narrativeHash: await sha256(new TextEncoder().encode(stripProtocol(p.text))) };
  }
  async function matchesNarrativeHash(hash: string, narrative: string, floor: number) {
    const matches = async (text: string) => hash === await sha256(new TextEncoder().encode(text));
    if (await matches(narrative)) return true;
    // 旧回执只有原文哈希，按与来源比较相同的编号规则还原待核对的文本。
    for (const text of assistantFloorTextVariants(narrative, floor)) {
      if (await matches(text)) return true;
    }
    return false;
  }
  function sameReplyNarrative(expected: string, current: string, floor: number) {
    return sameAssistantFloorText(stripProtocol(expected), stripProtocol(current), floor);
  }
  async function captureSavedNarrative(p: NonNullable<typeof pending>) {
    const saved = getChatMessages(p.replyFloor!)[0];
    // The completed create operation includes native/plugin receive processing.
    // Seal its readback once; retries must never adopt later edits this way.
    const generated = p.text;
    p.text = saved.message;
    if (sameReplyNarrative(generated, p.text, p.replyFloor!)) return;
    const extra = messageExtra(saved);
    extra.cw_story_request = await narrativeRequest(p);
    assertContext(p.context, activeContext());
    assertMessageSource(p.source, p.replyFloor);
    const current = getChatMessages(p.replyFloor!)[0];
    if (!current || !sameReplyNarrative(p.text, current.message, p.replyFloor!))
      throw Error('正文保存读回期间已被编辑，保留原请求供检查');
    await writeStoryCandidate(p.replyFloor!, p.replySwipe ?? 0, current.message, extra);
  }
  async function parseUpdate(text: string, envelope: Mvu.MvuData, channel: string, id: string, structured = false) {
    try {
      return await parseCandidate(structured ? variableResponseBlock(text) : text, envelope);
    } catch (error) {
      // Keep the actual response and stack in the chat, outside stat_data/prompts.
      // A retry may request a new response, but must not erase the failed evidence.
      await patchChat({ 澄湾最近解析失败: {
        channel, id, at: new Date().toISOString(),
        error: String(error), stack: error instanceof Error ? error.stack : undefined,
        response: text,
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
      const previous = getVariables({ type: 'chat' }).澄湾待确认提交;
      if (value === null && recoverablePreparationJournal(previous)) {
        const resumed = { ...failedSend!, context: activeContext() };
        // 原请求的新基线与清除调度日志同次保存，避免二者之间失败后丢失衔接依据。
        await patchChat({ 澄湾待确认提交: null, 澄湾失败请求: resumed });
        failedSend = resumed;
      } else await patchChat({ 澄湾待确认提交: value });
    },
  });
  const settledTexts = new Map<string, { commitId?: string; text: string }>();
  function refreshMessages() {
    if (disposed || SillyTavern.getCurrentChatId() !== boundChat) return;
    const last = getLastMessageId();
    if (last < 1) {
      if (view.messages.length) view.messages = [];
      return;
    }
    const firstVisible = Math.max(1, last - 9);
    const selected = getChatMessages(`${firstVisible}-${last}`, { include_swipes: true });
    // The helper's plain read clones the same variables again. Reuse selected
    // candidate data/metadata, but display the saved message, which may differ
    // from a stale swipe string after a preset or direct native edit.
    const archived = SillyTavern.chat;
    let previous: { floor: number; swipe: number; data: Record<string, unknown> } | undefined;
    for (let end = firstVisible - 1; end > 0 && !previous; end -= 10) {
      const prior = getChatMessages(`${Math.max(1, end - 9)}-${end}`, { role: 'assistant', include_swipes: true });
      for (const message of prior.reverse()) {
        const data = message.swipes_data[message.swipe_id]?.stat_data;
        if (!isCommittedCandidate(data, message.message_id, message.swipe_id)) continue;
        const extra = messageExtra({ extra: message.swipes_info[message.swipe_id] });
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
    const messages = selected
      .filter(m => m.message_id > 0 && m.role !== 'system')
      .map(m => {
        const swipe = m.swipe_id;
        const extra = messageExtra({ extra: m.swipes_info[swipe] });
        const data = m.swipes_data[swipe]?.stat_data;
        const history = extra.cw_story_settlements;
        const settlement = history && typeof history === 'object' ? history[String(swipe)] as StorySettlement : undefined;
        const committedSelected = isCommittedCandidate(data, m.message_id, swipe);
        const textKey = `${m.message_id}:${swipe}`;
        const remembered = settledTexts.get(textKey);
        if (m.role === 'assistant' && committedSelected && !extra.cw_update_pending &&
            (!remembered || remembered.commitId !== settlement?.commitId))
          settledTexts.set(textKey, { commitId: settlement?.commitId, text: archived[m.message_id]?.mes ?? m.swipes[swipe] });
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
          content: archived[m.message_id]?.mes ?? '',
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
    if (disposed) return false;
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
      if (errorSource === 'candidate') {
        view.loadError = '';
        view.loadPhase = '';
        setError('');
      }
      updateResendState();
      return true;
    } catch (e) {
      setLoadError(e);
      return false;
    }
  }
  async function saveSettings(input: unknown = copy(settings), channel?: SettingsScope) {
    requireWriter();
    if ((view.busy || view.updating) && channel !== 'atmosphere') throw Error('请等待当前请求完成或停止后保存设置');
    const { value, warning } = await settingsController.save(input, channel);
    requireWriter();
    // Independent forms may finish in either order; only adopt the saved channel.
    Object.assign(settings, value);
    view.settingsWarning = warning;
    return warning;
  }
  async function reloadSettings(channel?: SettingsChannel) {
    requireWriter();
    if ((view.busy || view.updating) && channel !== 'atmosphere') throw Error('请等待当前请求完成或停止后同步设置');
    const { value, warning } = await settingsController.load(channel, copy(settings));
    requireWriter();
    if (channel === 'atmosphere') settings.atmosphere = value.atmosphere;
    else if (channel === 'information') settings.information = value.information;
    else if (channel) settings[channel] = value[channel];
    else Object.assign(settings, value);
    view.settingsWarning = warning;
    return warning;
  }
  function readAlertMemory(): Record<string, boolean> {
    return getVariables({ type: 'chat' }).澄湾告警 ?? {};
  }
  async function saveAlertMemory(value: Record<string, boolean>) {
    if (equal(readAlertMemory(), value)) return;
    await patchChat({ 澄湾告警: copy(value) });
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
          settings.characterRoster, initialConnectionIds(payload), settings.characterAuto && settings.informationAuto ? [] : undefined);
        if (prepared) await patchChat({ [LIBRARY_KEY]: prepared.library });
        assertContext(expected, activeContext());
        await service.commit(expected, submissionId, () => planTasks(refreshNovelSystem(prepared?.state ?? created)), true);
      }
      refresh();
      return { active: Object.keys(view.data!.角色).length, waiting: Object.values(view.characterLibrary!.meta).filter(person => !person.enabled).length };
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
  async function selectInformation(before: State, input: string, key: string, retain = false, action?: PhoneAction) {
    if (!settings.informationAuto) return before;
    const library = getVariables({ type: 'chat' })[LIBRARY_KEY];
    const characters = settings.characterAuto ? characterSelectionContext(before, library, settings.characterRoster, input, action) : undefined;
    const chooseCharacters = characters && Object.keys(characters.目录).length > 0;
    if (before._系统.资料加载.选择依据 === key || (!hasAutomaticInformation(before) && !chooseCharacters))
      return ensureInformationContext(before, input);
    const api = informationApi(settings);
    validateApi(api, '资料选择');
    const expected = activeContext(), source = messageSource();
    const quotas = { 地点: settings.locationRoster, 组织: settings.organizationRoster };
    const config = informationSelectionPrompt(before, input, source.filter(item => item.role !== 'system'),
      { quotas, characters: chooseCharacters ? characters : undefined });
    config.custom_api = apiConnection(api);
    const reply = await request(config, before,
      true, api.retries, 'knowledge');
    assertContext(expected, activeContext());
    assertMessageSource(source);
    const selection = parseInformationSelection(reply, !!chooseCharacters);
    let selected = applyInformationSelectionValues(before, selection, key, retain, quotas, input);
    const prepared = chooseCharacters
      ? characters.开局
        ? prepareOpeningCharacterRoster(selected, library, settings.characterRoster, undefined, selection.人物!, characters.保留人物id)
        : prepareCharacterRoster(selected, library, input, action, settings.characterRoster, selection.人物!)
      : null;
    if (prepared) {
      assertContext(expected, activeContext());
      assertMessageSource(source);
      await patchChat({ [LIBRARY_KEY]: prepared.library });
      selected = planTasks(prepared.state);
    }
    return ensureInformationContext(selected, input);
  }
  async function scheduleInformation(input: string, key: string) {
    const expected = activeContext(), before = Schema.parse(service.host.read(expected.floor).stat_data);
    const selected = await selectInformation(before, input, key);
    if (selected === before) return;
    assertContext(expected, activeContext());
    await service.commit(expected, uid('information_selection'), () => selected);
    refresh();
  }
  async function requestOnce(config: GenerateConfig, state: State, extra = false, purpose: 'variables' | 'novel' | 'knowledge' = 'variables') {
    generationId = uid('generation');
    const startedEpoch = epoch;
    try {
      requireWriter();
      view.phase = purpose === 'knowledge' ? 'information' : purpose === 'novel' ? 'novel' : extra ? 'variables' : 'story';
      const native = extra ? nativePromptConfig(config) : { user_input: config.user_input ?? '' };
      const injects = extra && purpose === 'variables' ? await variableRulePrompts() : [];
      const atmosphere = atmospherePrompt(settings.atmosphere);
      if (atmosphere) injects.push(atmosphere);
      if (cancelled || disposed || startedEpoch !== epoch) throw Error('生成已取消或上下文已变化');
      const result = await withPromptContext({ purpose: extra ? purpose : 'story', state,
        projection: extra ? promptProjections.get(config) : undefined }, () => generate({
          ...native, ...(injects.length ? { injects } : {}), generation_id: generationId!,
          should_stream: extra ? false : getPreset('in_use').settings.should_stream,
        }));
      if (cancelled || disposed || startedEpoch !== epoch) throw Error('生成已取消或上下文已变化');
      requireWriter();
      view.phase = 'validating';
      if (typeof result !== 'string' || !result.trim()) throw Error('生成未返回有效正文');
      if (!extra && !stripProtocol(result)) throw Error('主模型没有返回剧情正文；请重试正文生成');
      if (cancelled || disposed || startedEpoch !== epoch) throw Error('生成已取消或上下文已变化');
      return result;
    } finally {
      generationId = null;
    }
  }
  async function request(config: GenerateConfig, state: State, extra = false, attempts = 0, purpose: 'variables' | 'novel' | 'knowledge' = 'variables') {
    let error: unknown;
    for (let index = 0; index <= attempts; index++) {
      if (cancelled || disposed) throw Error('生成已取消');
      try {
        return await requestOnce(config, state, extra, purpose);
      } catch (e) {
        error = e;
        if (cancelled || disposed) throw e;
        if (index < attempts) await new Promise(r => setTimeout(r, 2000));
      }
    }
    throw error;
  }
  async function requestUpdate(config: GenerateConfig, api: ApiSettings, name: string, state: State) {
    validateApi(api, name);
    console.info('[瓦洛兰变量更新] 开始请求', name);
    config.custom_api = apiConnection(api);
    config.json_schema = variableResponseSchema;
    return request(config, state, true, api.retries);
  }
  async function requestScopedUpdate(
    before: State, envelope: Mvu.MvuData, makeConfig: (state: State) => Promise<GenerateConfig>,
    api: ApiSettings, name: string, id: string, saveContext: (state: State) => Promise<void>, cachedReply?: string,
    receiveReply?: (text: string, structured: boolean) => Promise<void>, rejectReply?: () => void,
    cachedStructured = false,
  ) {
    // Retry the variable handoff once with the missing records. Never regenerate the story or apply the rejected patch.
    for (let attempt = 0; attempt < 2; attempt++) {
      const cached = attempt === 0 && cachedReply !== undefined;
      const text = cached ? cachedReply : await requestUpdate(await makeConfig(before), api, name, before);
      // Old persisted phone replies used tagged MVU text. New responses must
      // obey the requested structured transport; never silently accept prose.
      const structured = !cached || cachedStructured;
      await receiveReply?.(text, structured);
      try {
        const parsed = await parseUpdate(text, { ...envelope, stat_data: before }, name, id, structured);
        return { before, text, parsed };
      } catch (error) {
        rejectReply?.();
        if (!(error instanceof InformationNotLoadedError) || !settings.informationAuto || attempt !== 0) throw error;
        const expanded = expandInformationForRetry(before, updateBlock(structured ? variableResponseBlock(text) : text).commands);
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
  async function storeStoryProgress(p: NonNullable<typeof pending>, complete = false) {
    const records = getVariables({ type: 'chat' });
    const matchingFailure = records.澄湾失败请求?.id === p.id;
    await patchChat({
      澄湾待更新正文: complete ? null : p,
      ...(complete && records.澄湾待确认提交?.commitId === p.id ? { 澄湾待确认提交: null } : {}),
      ...(matchingFailure ? { 澄湾失败请求: null } : {}),
      ...(complete && p.replay ? { 澄湾正文重放: {
        ...records.澄湾正文重放,
        [p.id]: { saveId: service.host.read(p.replyFloor!).stat_data._系统.存档id, floor: p.replyFloor, swipe: p.replySwipe ?? 0,
          branch: `${p.context.chat}:${p.replyFloor}:${p.replySwipe ?? 0}`, plan: p.replay },
      } } : {}),
    }, complete ? [p.id] : []);
    if (matchingFailure && failedSend?.id === p.id) failedSend = null;
    if (complete && pending === p) pending = null;
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
      !sameReplyNarrative(p.text, getChatMessages(p.replyFloor)[0]?.message ?? '', p.replyFloor)
    )
      throw Error('待更新正文已被编辑，请取消后重新生成');
    if (pendingAlreadyCommitted(p)) {
      view.phase = 'saving';
      await saveChat();
      requireWriter();
      assertMessageSource(p.source, p.replyFloor);
      if (!pendingAlreadyCommitted(p)) throw Error('保存期间候选变化，保留待恢复记录');
      await storeStoryProgress(p, true);
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
    const instruction = `正文已经完整输出。结算已完成正文及本次授权的后台生活、维护任务；未实现的玩家意图不算已发生，不续写面向玩家的正文。\n本轮玩家输入（未在正文实现的行动不算已发生）：\n${userText}\n\n本轮已完成正文（事实资料）：\n${narrative}`;
    const retryHint = informationRetryHint(p.id);
    if (settings.informationAuto) {
      // Completed narrative supplies explicit IDs/names. Expand those existing
      // records locally, retaining the first selection and manual overrides;
      // no second model is needed to identify references already in the text.
      const expanded = ensureInformationContext(before, instruction + retryHint);
      if (expanded !== before) {
        before = expanded;
        p.envelope = { ...p.envelope, stat_data: before };
        await savePending();
      }
    }
    const makeUpdateConfig = async (state: State) => {
      // Keep the settlement instruction together with its facts; rebuilding the
      // input from facts alone loses the boundary between settlement and story.
      return withUpdateTasks(await livePromptConfig(state, instruction, 'worker'), state, taskIds);
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
    // 本次正文的展示差异先结算；随后恢复的独立操作不能被归因为正文造成的变化。
    const storyChanges = savedChanges(before, candidate);
    candidate = Schema.parse(applyCommitReplay(candidate, p.replay));
    // The completed text is stored before update; retry replaces this same floor, never appends twice.
    const floor = p.replyFloor ?? getLastMessageId() + 1;
    candidate._系统.楼层id = floor;
    candidate._系统.数据版本 = Math.max(p.context.version, p.revisionVersion ?? 0,
      ...Object.values(p.replay?.records ?? {}).map(receipt => receipt.数据版本)) + 1;
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
      changes: storyChanges,
      ...(p.replay ? { replayId: p.id } : {}),
    };
    // The MVU result is already parsed and written as floor data. Keeping the command in
    // the message would let MVU or another script apply the same patch again on a rerender.
    p.prepared = { envelope, settlement };
    view.phase = 'saving';
    await savePending();
    await savePreparedNarrative(p, p.prepared, startedEpoch);
  }
  async function savePreparedNarrative(
    p: NonNullable<typeof pending>, prepared: NonNullable<NonNullable<typeof pending>['prepared']>, startedEpoch: number,
  ) {
    view.phase = 'saving';
    const { envelope, settlement } = prepared;
    const candidate = envelope.stat_data as State, floor = settlement.floor, replySwipe = settlement.swipe;
    const before = Schema.parse(p.envelope.stat_data);
    let message = storedNarrative(p.text);
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
      const saved = getChatMessages(floor)[0];
      if (!saved || saved.role !== 'assistant' || !sameReplyNarrative(p.text, saved.message, floor))
        throw Error(`第 ${floor} 楼待结算正文已被编辑，未写入旧结算结果`);
      // 变量请求和保存回执都可能等待。保留这期间写入楼层的编号和展示标记。
      message = storedNarrative(saved.message);
      const extra = messageExtra(saved);
      delete extra.cw_update_pending;
      delete extra.cw_story_request;
      delete extra.cw_incomplete;
      extra.cw_story_settlements = {
        ...(extra.cw_story_settlements && typeof extra.cw_story_settlements === 'object' ? extra.cw_story_settlements : {}),
        [String(replySwipe)]: settlement,
      };
      await writeStoryCandidate(floor, replySwipe, message, extra, envelope);
    }
    if (
      !sameAssistantFloorText(message, getChatMessages(floor)[0]?.message ?? '', floor) ||
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
    await storeStoryProgress(p, true);
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
    sourceChange = undefined;
    requestSource = undefined;
    let context = activeContext();
    let envelope = copy(service.host.read(context.floor));
    let openingTaskId: string | undefined;
    let inputSaved = !append;
    let replyFloor: number | undefined;
    try {
      assertContext(context, activeContext());
      requestSource = messageSource();
      if (append) {
        const inputFloor = getLastMessageId() + 1;
        await createMessages([{ role: 'user', message: text, extra: intent ? { cw_use_intent: intent } : {} }], {
          refresh: 'affected',
        });
        requestSource = [...requestSource, { id: inputFloor, role: 'user', swipe: 0,
          text, archive: text, candidate: text }];
        inputSaved = true;
        // 玩家楼已创建。即使失效出队或后续生成的保存失败，恢复也只能沿该楼继续。
        const queued = intents.find(item => item.id === submissionId && item.kind === 'story');
        if (queued) {
          queued.source = requestSource;
          queued.inputSaved = true;
          await saveIntents();
        }
        assertMessageSource(requestSource);
        // Publish the saved floor before acknowledging input; disk/model work may take longer.
        refreshMessages();
        onSent?.();
        await saveChat();
      }
      // The player's saved floor must appear before worldbook I/O and roster commits.
      // Preparation still finishes before constructing prompts or calling the model.
      await prepareWorldInformation();
      context = activeContext();
      envelope = copy(service.host.read(context.floor));
      if (opening) {
        await scheduleOpeningCharacters();
        context = activeContext();
        envelope = copy(service.host.read(context.floor));
      } else if (!(settings.characterAuto && settings.informationAuto)) {
        await scheduleCharacters(text);
        context = activeContext();
        envelope = copy(service.host.read(context.floor));
      }
      assertMessageSource(requestSource);
      await scheduleInformation(text, 'story:' + submissionId);
      context = activeContext();
      envelope = copy(service.host.read(context.floor));
      if (opening) {
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
      if (cancelled || disposed) throw Error('生成已停止');
      assertMessageSource(requestSource);
      refresh();
      const storyState = Schema.parse(envelope.stat_data);
      const reply = await request({ user_input: continuation ? text : '' }, storyState);
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
      await storeStoryProgress(pending);
      const origin = await narrativeRequest(pending);
      assertContext(context, activeContext());
      assertMessageSource(requestSource);
      if (cancelled || disposed) throw Error('生成已停止');
      // Publish completed narrative before the independent variable request; retry updates this same floor.
      view.phase = 'story-save';
      const floor = getLastMessageId() + 1;
      await createMessages(
        [{ role: 'assistant', message: storedNarrative(reply), extra: { cw_update_pending: true, cw_story_request: origin } }],
        { refresh: 'affected' },
      );
      replyFloor = floor;
      pending.replyFloor = floor;
      pending.replySwipe = 0;
      await captureSavedNarrative(pending);
      await savePending();
      view.streaming = '';
      refresh();
      view.busy = false;
      await finishPending();
    } catch (e) {
      if (e instanceof MessageSourceError) sourceChange ??= e;
      if (!sourceChange && requestSource && !disposed && SillyTavern.getCurrentChatId() === context.chat) {
        try {
          assertMessageSource(requestSource, pending?.replyFloor);
        } catch (error) {
          if (!(error instanceof MessageSourceError)) throw error;
          sourceChange = error;
        }
      }
      if (sourceChange) {
        const reason = sourceChange.message;
        const savedReply = replyFloor === undefined || disposed || SillyTavern.getCurrentChatId() !== context.chat
          ? undefined : messageExtra(getChatMessages(replyFloor)[0]);
        const replyStillSelected = savedReply?.cw_story_request?.id === submissionId;
        if (!disposed && SillyTavern.getCurrentChatId() === context.chat) {
          const records = getVariables({ type: 'chat' });
          const matchingFailure = records.澄湾失败请求?.id === submissionId;
          try {
            await patchChat({
              澄湾待更新正文: null,
              ...(matchingFailure ? { 澄湾失败请求: null } : {}),
              ...(records.澄湾待确认提交?.commitId === submissionId ? { 澄湾待确认提交: null } : {}),
            }, [submissionId]);
          } catch (error) {
            setError(`${reason}。旧请求清理未确认：${error instanceof Error ? error.message : error}。请恢复该排队操作。`);
            throw Error(view.error, { cause: error });
          }
          pending = null;
          if (matchingFailure && failedSend?.id === submissionId) failedSend = null;
        }
        setSourceChangeError(reason + (replyFloor === undefined ? '。本轮没有新增正文，可从当前玩家楼续接，或发送新输入。'
          : replyStillSelected ? `。正文保留在第 ${replyFloor} 楼，原结算请求已失效。请从该楼的消息菜单重新生成回复。`
          : `。本轮正文曾写入第 ${replyFloor} 楼，请检查当前楼层和候选。`));
        throw new StaleStoryRequestError(view.error, { cause: sourceChange });
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
        const resumeStory = failedSend && recoverablePreparationJournal(rosterJournal);
        if (failedSend && !resumeStory) throw Error('自动名单恢复与原请求上下文不一致，请检查当前候选');
        if (resumeStory) assertMessageSource(failedSend!.source);
        libraryView(Schema.parse(rosterJournal.candidate), getVariables({ type: 'chat' })[LIBRARY_KEY]);
        await service.commit(rosterJournal.context, rosterJournal.commitId, () => Schema.parse(rosterJournal.candidate), true);
        await service.host.journal(null);
        refresh();
        if (!resumeStory) {
          const original = intents.find(item => item.kind === 'phone' && item.action);
          if (original?.action) {
            assertMessageSource(original.source, undefined, true);
            return await phoneAction(original.action, original.id);
          }
        }
      }
      const informationJournal = getVariables({ type: 'chat' }).澄湾待确认提交;
      if (failedSend?.id && String(informationJournal?.commitId).startsWith('information_selection_') &&
          informationJournal.candidate?._系统?.资料加载?.选择依据 === 'story:' + failedSend.id) {
        if (!recoverablePreparationJournal(informationJournal))
          throw Error('资料调度恢复与原请求上下文不一致，请检查当前候选');
        assertMessageSource(failedSend.source);
        await service.commit(informationJournal.context, informationJournal.commitId,
          () => Schema.parse(informationJournal.candidate));
        await service.host.journal(null);
        refresh();
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
        if (!failedSend.id) {
          // 旧版本的失败请求可能没有 ID；先保存身份，后续交接和重试共用同一提交。
          failedSend = { ...failedSend, id: uid('round') };
          await saveFailed();
        }
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
          if (journal.replyFloor !== undefined) {
            // 正文结算属于回复候选。普通提交会把 candidate 写进 journal.context 指向的上一楼。
            const floor = journal.replyFloor;
            const swipe = Number(journal.candidate?._系统?.候选回复id);
            // 酒馆助手会把越界的楼号截到最后一楼。
            const row = floor <= getLastMessageId() ? getChatMessages(floor, { include_swipes: true })[0] : undefined;
            const written = row?.swipes_data[swipe]?.stat_data;
            if (isCommittedCandidate(written, floor, swipe) && written?._系统?.提交记录?.[journal.commitId]) {
              await patchChat({ 澄湾待确认提交: null }, [journal.commitId]);
              setError('');
            } else if (!row) {
              await patchChat({ 澄湾待确认提交: null }, [journal.commitId]);
              setSourceChangeError(`第 ${floor} 楼已删除，旧结算记录已清理。`);
            } else {
              throw Error(`第 ${floor} 楼缺少这次结算的确认记录，请检查原候选。如需重新生成，请先取消这条待确认记录。`);
            }
            return;
          }
          const novel = intents.find(item => item.kind === 'novel' && item.id === journal.commitId);
          if (novel?.target) {
            await refreshNovelContent(novel.target, novel.id);
            return;
          }
          if (journal.rollbackOnFailure) libraryView(Schema.parse(journal.candidate), getVariables({ type: 'chat' })[LIBRARY_KEY]);
          await service.commit(journal.context, journal.commitId, () => Schema.parse(journal.candidate), !!journal.rollbackOnFailure);
          await service.host.journal(null);
          setError('');
        } else {
          const item = intents.find(intent => intent.kind === 'novel' || intent.kind === 'phone');
          if (!item) throw Error('没有待恢复提交，请重新执行原操作');
          assertMessageSource(item.source, undefined, true);
          // 名单快照保存可能早于 phone pending/journal，原排队操作仍保留身份。
          if (item.kind === 'phone' && item.action) return await phoneAction(item.action, item.id);
          if (!item.target) throw Error('待恢复操作缺少请求内容');
          await refreshNovelContent(item.target, item.id);
        }
      }
    } catch (error) {
      if (failedSend && error instanceof MessageSourceError && !(error instanceof StaleStoryRequestError) &&
          !getVariables({ type: 'chat' }).澄湾待确认提交) {
        await discardStaleRecovery();
        if (!failedSend) throw new StaleStoryRequestError(view.error, { cause: error });
      }
      if (!(error instanceof StaleStoryRequestError)) setError(error);
      console.error('[瓦洛兰重试] 未完成', error);
      throw error;
    } finally {
      view.updating = false;
      refresh();
    }
  }
  function cancelCurrentGeneration() {
    if (cancelled) return;
    cancelled = true;
    epoch++;
    view.streaming = '';
    if (view.phoneRequest && view.busy) view.phoneRequest.status = 'stopping';
    scheduler.cancelWaiting('已停止；尚未发送的操作保留供手动恢复');
  }
  function stop() {
    cancelCurrentGeneration();
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
    await patchChat({
      澄湾待更新正文: null, 澄湾待更新手机: null, 澄湾失败请求: null, 澄湾待确认提交: null,
    }, ids.filter((id): id is string => !!id));
    pending = null;
    pendingPhone = null;
    failedSend = null;
    setError('');
    refresh();
  }
  async function recordEditedStory(id: number, replacement?: string) {
    if (id === 0 || id !== getLastMessageId()) return false;
    const edited = getChatMessages(id)[0];
    if (edited?.role !== 'assistant') return false;
    const swipe = getChatMessages(id, { include_swipes: true })[0].swipe_id;
    const previous = pending?.replyFloor === id && (pending.replySwipe ?? 0) === swipe ? pending : undefined;
    if (!previous && edited.data?.stat_data?._系统?.楼层id !== id) return false;
    const text = replacement ?? edited.message;
    const extra = messageExtra(edited);
    const oldCommit = extra.cw_story_settlements?.[String(swipe)]?.commitId;
    const cached = settledTexts.get(`${id}:${swipe}`);
    // 原生事件在存档已被改写后触发，原文取自同一候选的待办或已结算版本。
    const before = previous?.text ?? (cached?.commitId === oldCommit ? cached?.text : undefined);
    // 原生编辑已经写入。桌面显式恢复到已结算原文时，调用方仍需保存替换文本。
    if (before !== undefined && sameAssistantFloorText(before, text, id)) return replacement === undefined;
    if (view.busy || view.updating) stop();
    const context = activeContext(id - 1);
    let replay: CommitReplay | undefined;
    try {
      const oldStory = extra.cw_story_settlements?.[String(swipe)] as StorySettlement | undefined;
      const current = oldStory ? Schema.parse(edited.data.stat_data) : undefined;
      const savedReplay = oldStory?.replayId ? getVariables({ type: 'chat' }).澄湾正文重放?.[oldStory.replayId] : undefined;
      if (oldStory?.replayId && (!savedReplay || oldStory.replayId !== oldStory.commitId ||
          savedReplay.saveId !== current?._系统.存档id || savedReplay.floor !== id || savedReplay.swipe !== swipe ||
          savedReplay.branch !== current?._系统.分支id)) throw Error('正文重放依据与当前候选不一致，请恢复完整聊天记录');
      const replayStory = oldStory ? { ...oldStory, replay: savedReplay?.plan as CommitReplay | undefined } : undefined;
      const library = current ? LibrarySchema.parse(getVariables({ type: 'chat' })[LIBRARY_KEY]) : undefined;
      const archived = (commitId: string, version: number) => {
        return Object.values(library?.snapshots ?? {}).find(snapshot => snapshot.saveId === current?._系统.存档id &&
          snapshot.replays?.[commitId]?.version === version)?.replays?.[commitId]?.changes;
      };
      try { replay = previous ? previous.replay : current ? replayAfterStory(current, replayStory, archived) : undefined; }
      catch (error) {
        if (!(error instanceof MissingCommitReplay) || !oldStory) throw error;
        const originalEpoch = epoch;
        replay = await legacyStoryReplay(current!, Schema.parse(service.host.read(context.floor).stat_data), replayStory!, () => {
          requireWriter();
          assertContext(context, activeContext(id - 1));
          if (epoch !== originalEpoch || getChatMessages(id)[0]?.message !== edited.message ||
              !equal(getChatMessages(id)[0]?.data?.stat_data, edited.data.stat_data))
            throw Error('读取备份期间候选或变量已变化，未采用旧结果');
        });
      }
      if (replay && library && current) replay.archived = [...new Set(Object.values(library.snapshots)
        .filter(snapshot => snapshot.saveId === current._系统.存档id)
        .flatMap(snapshot => Object.entries(snapshot.replays ?? {}).filter(([commitId, value]) =>
          current._系统.提交记录[commitId]?.数据版本 === value.version && !current._系统.提交记录[commitId].变更JSON)
          .map(([commitId]) => commitId)))];
    } catch (error) {
      // 原生完成编辑事件发生在正文已被宿主改写之后。只用事先缓存的同候选原文恢复。
      if (replacement === undefined) {
        if (cached && cached.commitId === oldCommit && getChatMessages(id)[0]?.message === edited.message) {
          await writeStoryCandidate(id, swipe, cached.text, extra);
          await saveChat();
        }
      }
      throw error;
    }
    const priorMessage = getChatMessages(id - 1)[0];
    const idToSettle = previous && !edited.data?.stat_data?._系统?.提交记录?.[previous.id]
      ? previous.id : uid('edited_round');
    const next: NonNullable<typeof pending> = {
      context, envelope: copy(service.host.read(context.floor)), text, id: idToSettle,
      source: messageSource().filter(m => m.id !== id), replyFloor: id, replySwipe: swipe, mode: 'extra',
      openingTaskId: previous?.openingTaskId ?? edited.data?.stat_data?._系统?.提交记录?.[oldCommit]?.任务id ?? undefined,
      intent: previous?.intent ?? (priorMessage?.role === 'user' ? messageExtra(priorMessage).cw_use_intent : undefined),
      replay,
      revisionVersion: previous?.revisionVersion ?? edited.data?.stat_data?._系统?.数据版本,
    };
    extra.cw_story_request = await narrativeRequest(next);
    extra.cw_update_pending = true;
    assertContext(context, activeContext(id - 1));
    assertMessageSource(next.source, id);
    if (getChatMessages(id)[0]?.message !== edited.message) throw Error('正文在记录编辑时再次变更，请检查最新内容');
    await writeStoryCandidate(id, swipe, text, extra);
    pending = next;
    await savePending();
    setError('正文已编辑，点击输入区“立即重试”重新结算变量');
    refresh();
    return true;
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
    const old = action === 'edit' ? getChatMessages(id)[0] : undefined;
    const message = old?.role === 'assistant' ? storedNarrative(text ?? '') : text ?? '';
    if (old && (text === undefined || old.message === message || old.message === text)) {
      await saveChat();
      return;
    }
    if (old?.role === 'assistant' && sameAssistantFloorText(old.message, message, id)) {
      await setMessages([{ message_id: id, message }], { refresh: 'affected' });
      refresh();
      await saveChat();
      return;
    }
    if (action === 'edit') {
      const recorded = old?.role === 'assistant' && await recordEditedStory(id, message);
      if (!recorded) await setMessages([{ message_id: id, message }], { refresh: 'affected' });
      // 旧操作的排队快照可能截止于玩家输入前；按完整失败快照移除失效重试和同 ID 排队项。
      if (failedSend) await discardStaleRecovery();
      if (recorded) return;
    } else {
      if (id === 0) throw Error('第 0 层为界面容器，请在新聊天中重新建档');
      epoch++;
      scheduler.cancelWaiting('楼层已删除，旧排队操作失效');
      if (pending || pendingPhone || failedSend || intents.length) {
        await patchChat({
          澄湾待更新正文: null,
          澄湾待更新手机: null,
          澄湾失败请求: null,
        }, intents.map(item => item.id));
        pending = null;
        pendingPhone = null;
        failedSend = null;
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
  async function clearSavedPhone(p: NonNullable<typeof pendingPhone>, complete: boolean) {
    const journal = getVariables({ type: 'chat' }).澄湾待确认提交;
    await patchChat({ 澄湾待更新手机: null, ...(journal?.commitId === p.id ? { 澄湾待确认提交: null } : {}) },
      complete ? [p.id] : []);
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
          // Dispatch validates active recipients before the combined selector sees the candidate action.
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
        view.phase = 'saving';
        setPhoneRequest(p, 'saving');
        await service.host.persist();
        assertPhoneWritable();
        assertMessageSource(p.source);
        if (!phoneAlreadyCommitted(p)) throw Error('保存期间候选变化，保留手机恢复记录');
        await clearSavedPhone(p, true);
        setError('');
        refresh();
        return confirmedPhoneResult(p, startedEpoch);
      }
      assertContext(context, activeContext());
      if (!p.candidate && !p.reply) {
        const selected = await selectInformation(p.draft,
          '玩家手机操作与待结算状态：' + JSON.stringify(action) + informationRetryHint(p.id),
          'phone:' + p.id + informationRetryHint(p.id), !!informationRetryHint(p.id), action);
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
          '玩家本次手机操作已写入候选状态，不重复执行。按已有交流、人物知情和实际活动生成手机新内容，允许没有回应。数量参考仅用于手机新内容。其他实际变化按本轮变量规则一并结算。\n' +
          phoneTimePrompt(draft);
        const settled = await requestScopedUpdate(
          draft,
          envelope,
          async state => {
            let config = withUpdateTasks(
              await livePromptConfig(state, '', 'worker', undefined, {
                session: action.kind === 'send' ? action.id : undefined,
                post: ['comment', 'like', 'repost'].includes(action.kind) ? action.id : undefined,
                platform: action.platform,
              }),
              state,
              taskIds,
            );
            config = withPromptInstructions(config, [{ role: 'system', position: 'in_chat', depth: 0, content: instruction }]);
            config.user_input = JSON.stringify({ 玩家手机操作: action, 手机新内容数量参考: budget });
            return config;
          },
          config,
          '手机',
          id,
          async state => {
            assertPhoneWritable();
            p.draft = state;
            delete p.reply;
            delete p.replyFormat;
            await savePhone();
          },
          p.reply,
          async (text, structured) => {
            assertPhoneWritable();
            rejectedReply = false;
            p.reply = text;
            p.replyFormat = structured ? 'structured' : undefined;
            setPhoneRequest(p, 'settling');
            await savePhone();
          },
          () => {
            rejectedReply = true;
          },
          p.replyFormat === 'structured',
        );
        assertPhoneWritable();
        draft = settled.before;
        const { text: reply, parsed } = settled;
        try {
          if (!parsed) throw Error('手机更新解析失败');
          let candidate = validateSettlement(draft, validateModel(draft, parsed.stat_data));
          assertPhoneActionNotRepeated(Schema.parse(envelope.stat_data), draft, candidate);
          candidate = finalizePhone(draft, candidate);
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
      view.phase = 'saving';
      view.updating = true;
      await service.commit(context, id, () => copy(p.candidate!), false, () => {
        assertPhoneWritable();
        assertMessageSource(p.source);
      });
      assertPhoneWritable();
      await clearSavedPhone(p, true);
      setError('');
      refresh();
      return confirmedPhoneResult(p, startedEpoch);
    } catch (e) {
      const invalidated = cancelled || startedEpoch !== epoch;
      if (pendingPhone && rejectedReply && !pendingPhone.candidate) {
        delete pendingPhone.reply;
        delete pendingPhone.replyFormat;
      }
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
            } else await clearSavedPhone(operation, false);
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
    const startedEpoch = epoch, source = intents.find(intent => intent.id === id)?.source;
    const assertNovelWritable = () => {
      requireWriter();
      if (cancelled || disposed || epoch !== startedEpoch) throw Error('奇遇刷新已取消或上下文已变化');
      if (source) assertMessageSource(source, undefined, true);
    };
    view.busy = true;
    try {
      assertNovelWritable();
      if (service.host.read(context.floor).stat_data?._系统?.提交记录?.[id]) {
        view.phase = 'saving';
        await service.host.persist();
        if (journal?.commitId === id) await service.host.journal(null);
      } else if (journal?.commitId === id) {
        view.phase = 'saving';
        await service.commit(journal.context, id, () => Schema.parse(journal.candidate), false, assertNovelWritable);
        await service.host.journal(null);
      } else {
        validateApi(settings.phone, '手机与奇遇');
        const state = Schema.parse(service.host.read(context.floor).stat_data);
        const config = novelRefreshPrompt(state, target);
        console.info('[瓦洛兰奇遇] 开始刷新', target);
        config.custom_api = apiConnection(settings.phone);
        const text = await request(config, state, true, settings.phone.retries, 'novel');
        assertNovelWritable();
        view.updating = true;
        view.phase = 'saving';
        await service.commit(context, id, candidate => applyNovelRefresh(candidate, target, text, id), false, assertNovelWritable);
      }
      setError('');
      console.info('[瓦洛兰奇遇] 刷新已保存', target);
    } catch (error) {
      if (cancelled && !disposed && SillyTavern.getCurrentChatId() === boundChat) {
        try {
          const savedJournal = getVariables({ type: 'chat' }).澄湾待确认提交;
          const written = service.host.read(context.floor).stat_data?._系统?.提交记录?.[id];
          if (!written && savedJournal?.commitId === id) await service.host.journal(null);
          await persistIntents([id]);
        } catch (saveError) {
          setError('奇遇停止记录保存未确认：' + String(saveError));
          throw Error(view.error, { cause: saveError });
        }
      }
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
    requireLoaded();
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
    try { if (kind !== 'recovery') requireLoaded(); }
    catch (error) { return Promise.reject(error); }
    const expectedEpoch = epoch;
    return scheduler.run(
      { key, label: kind === 'recovery' ? '恢复未完成操作' : '保存操作', kind, background: false },
      async () => {
        requireWriter();
        if (kind !== 'recovery') requireLoaded();
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
      refresh();
      // 已落玩家楼只允许恢复这次输入；普通待发项仍可排在前一轮回复之后。
      const savedInput = item.kind === 'story' && item.inputSaved === true;
      const hasRecovery = pending?.id === item.id || pendingPhone?.id === item.id || failedSend?.id === item.id;
      if (!savedInput || (!hasRecovery && !view.data?._系统.提交记录[item.id])) {
        try {
          assertMessageSource(item.source, undefined, !savedInput);
        } catch (error) {
          if (!savedInput || !(error instanceof MessageSourceError)) throw error;
          await persistIntents([item.id]);
          setSourceChangeError(error.message + '。旧请求已清理，可按当前内容重新发送。');
          throw new StaleStoryRequestError(view.error, { cause: error });
        }
      }
      let phoneResult: PhoneActionResult | void = undefined;
      if (item.kind === 'novel' && item.target) {
        if (pending || pendingPhone || failedSend) throw Error('有尚未完成的操作，请先重试或取消');
        await refreshNovelContent(item.target, item.id);
      } else if (!view.data?._系统.提交记录[item.id]) {
        if (hasRecovery) phoneResult = await retry();
        else {
          if (pending || pendingPhone || failedSend) throw Error('有尚未完成的操作，请先重试或取消');
          if (item.kind === 'story')
            await send(item.text ?? '', !savedInput && item.append !== false, item.intent, item.id, item.opening, onSent);
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
    try { requireLoaded(); }
    catch (error) { return Promise.reject(error); }
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
    updateResendState();
  }
  const listeners: EventOnReturn[] = [];
  function recoverablePreparationJournal(journal: any, current?: Context) {
    if (!failedSend?.id || !journal) return false;
    const roster = journal.rollbackOnFailure && ['character_roster_', 'opening_roster_'].some(prefix =>
      String(journal.commitId).startsWith(prefix));
    const information = String(journal.commitId).startsWith('information_selection_') &&
      journal.candidate?._系统?.资料加载?.选择依据 === 'story:' + failedSend.id;
    if (!roster && !information) return false;
    const actual = current ?? activeContext();
    const original = equal(failedSend.context, journal.context);
    if (original && equal(actual, journal.context)) return true;
    return (original || equal(failedSend.context, actual)) &&
      ['chat', 'floor', 'swipe', 'branch'].every(key => actual[key as keyof Context] === journal.context[key]) &&
      equal(service.host.read(actual.floor).stat_data, journal.candidate);
  }
  async function discardStaleRecovery() {
    const previous = pending;
    const current = activeContext();
    let reason = '';
    const sourceMatches = (source: MessageSource | undefined, replyFloor?: number) => {
      try {
        assertMessageSource(source, replyFloor);
        return true;
      } catch (error) {
        if (!(error instanceof MessageSourceError)) throw error;
        reason ||= error.message;
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
          !sameReplyNarrative(pending.text, getChatMessages(pending.replyFloor)[0]?.message ?? '', pending.replyFloor)));
    const phoneCommitted = pendingPhone && phoneAlreadyCommitted(pendingPhone);
    const stalePhone = pendingPhone && !(phoneCommitted
      ? sourceMatches(pendingPhone.source)
      : valid(pendingPhone.context, pendingPhone.source));
    const journal = getVariables({ type: 'chat' }).澄湾待确认提交;
    // 调度可能已写入而保存未确认。原日志证明这次版本变化，retry 会先确认它。
    // A committed preparation still needs its original story identity even if the player
    // temporarily edits its input. retry validates the source again before confirming it.
    const prepared = recoverablePreparationJournal(journal, current);
    const staleFailed = failedSend && !valid(failedSend.context, failedSend.source) && !prepared;
    if (!stalePending && !stalePhone && !staleFailed) return;
    const obsolete = [stalePending && pending?.id, stalePhone && pendingPhone?.id, staleFailed && failedSend?.id]
      .filter((id): id is string => typeof id === 'string');
    await patchChat({
      澄湾待更新正文: stalePending ? null : pending,
      澄湾待更新手机: stalePhone ? null : pendingPhone,
      澄湾失败请求: staleFailed ? null : failedSend,
      ...(stalePending && pending && journal?.replyFloor !== undefined && journal.replyFloor === pending.replyFloor &&
        journal.commitId === pending.id ? { 澄湾待确认提交: null } : {}),
    }, obsolete);
    if (stalePending) pending = null;
    if (stalePhone) pendingPhone = null;
    if (staleFailed) failedSend = null;
    setSourceChangeError((reason || '存档楼层、候选或请求基线已变化') + '。旧请求已清理，可按当前内容重新发送。');
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
    if (isCommittedCandidate(last.data?.stat_data, last.message_id, replySwipe) &&
        (!extra.cw_story_request?.id || last.data.stat_data._系统.提交记录[extra.cw_story_request.id])) {
      delete extra.cw_update_pending;
      delete extra.cw_story_request;
      await writeStoryCandidate(last.message_id, replySwipe, last.message, extra);
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
      if ('text' in original && !sameReplyNarrative(original.text, last.message, last.message_id)) throw Error('正文已编辑');
      if ('narrativeHash' in original && !await matchesNarrativeHash(original.narrativeHash, narrative, last.message_id))
        throw Error('正文已编辑');
    } catch (error) {
      setError(`第 ${last.message_id} 楼正文的原请求已失效。${error instanceof Error ? error.message : String(error)}。请从该楼的消息菜单重新生成回复。`);
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
      replay: original.replay,
      revisionVersion: original.revisionVersion,
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
  async function reload() {
    view.loading = true;
    const previousError = view.loadError;
    view.loadError = '';
    view.loadPhase = '';
    if (previousError && view.error === previousError) setError('');
    let phase: 'worldbook' | 'recovery' = 'worldbook';
    try {
      if (!refresh()) return;
      if (view.managementPending) setError('角色管理保存尚未确认，请点击重试；恢复快照已独立保留');
      if (!view.readOnly) {
        await settingsController.recoverLegacyRules();
        requireWriter();
        await preparePromptWorldbook(requireWriter);
      }
      if (!view.readOnly) await settingsController.removeLegacyAtmosphere();
      if (disposed || SillyTavern.getCurrentChatId() !== boundChat) return;
      phase = 'recovery';
      if (!view.readOnly) {
        try {
          // 未完成请求拥有原版本；中断任务整理不能先提交新版本，使原正文失去恢复依据。
          if (!pending && !pendingPhone && !failedSend && !getVariables({ type: 'chat' }).澄湾待确认提交 &&
              Object.values(view.data?._系统.任务 ?? {}).some(t => ['生成中', '待校验', '待提交'].includes(t.状态)) &&
              !firstUnsettledNarrative()) {
            await service.commit(activeContext(), uid('task_recovery'), s => {
              for (const t of Object.values(s._系统.任务))
                if (['生成中', '待校验', '待提交'].includes(t.状态)) {
                  t.状态 = '失败';
                  t.错误 = '上次任务已中断，等待手动重试';
                }
            });
            refresh();
          }
          await discardStaleRecovery();
          await restoreOrphanedNarrative();
          const journal = getVariables({ type: 'chat' }).澄湾待确认提交;
          const inProgress = [pending?.id, pendingPhone?.id, failedSend?.id, journal?.commitId];
          const completed = intents.filter(item => !inProgress.includes(item.id) && view.data?._系统.提交记录[item.id]);
          if (completed.length) await persistIntents(completed.map(item => item.id));
        } catch (error) {
          // Keep the service available so the player can switch back to a valid candidate.
          if (!(error instanceof CandidateIdentityError)) throw error;
          setError(error);
          refreshMessages();
        }
      }
      if (pending || failedSend || pendingPhone) setError('上次请求尚未完成，请点击重试');
      else if (!view.error && !view.readOnly && getVariables({ type: 'chat' }).澄湾待确认提交?.replyFloor !== undefined)
        setError('上次回复的结算尚未确认，请点击重试核对原楼层。');
    } catch (error) {
      if (!disposed && SillyTavern.getCurrentChatId() === boundChat) setLoadError(error, phase);
    } finally {
      view.loading = false;
    }
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
    await reload();
    if (disposed || SillyTavern.getCurrentChatId() !== boundChat) return;
    listeners.push(
      listen(iframe_events.STREAM_TOKEN_RECEIVED_FULLY, (text, id) => {
        if (!cancelled && !disposed && id === generationId && view.operation === 'story' && !view.updating) view.streaming = text;
      }),
    );
    listeners.push(listen(tavern_events.GENERATION_STOPPED, (id?: string) => {
      // Helper includes its generation id; native Tavern's global stop has none.
      if (generationId && (id === undefined || id === generationId)) cancelCurrentGeneration();
    }));
    listeners.push(listen(Mvu.events.VARIABLE_UPDATE_ENDED, (next, old) => {
      if (!old?.stat_data || !next?.stat_data) return;
      try { assertDisabledUnchanged(Schema.parse(old.stat_data), Schema.parse(next.stat_data)); }
      catch (error) {
        rejectedMvuCandidates.set(next, error);
        next.stat_data = copy(old.stat_data);
        console.warn('[瓦洛兰角色启停] 已拒绝停用人物活动', error);
        throw error;
      }
    }));
    const chat = boundChat;
    listeners.push(
      listen(tavern_events.CHAT_CHANGED, () => {
        if (!disposed && SillyTavern.getCurrentChatId() !== chat) {
          epoch++;
          stop();
          window.location.reload();
        }
      }),
    );
    listeners.push(
      listen(tavern_events.MESSAGE_EDITED, async id => {
        try {
          if (!view.readOnly) await recordEditedStory(id);
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
        listen(event as any, () => {
          if (event === tavern_events.MESSAGE_UPDATED && requestSource) {
            try {
              assertMessageSource(requestSource, undefined, true);
            } catch (error) {
              if (!(error instanceof MessageSourceError)) throw error;
              sourceChange ??= error;
              stop();
            }
          }
          if (event === tavern_events.MESSAGE_SWIPED || event === tavern_events.MESSAGE_DELETED) {
            epoch++;
            stop();
            const obsolete = intents.map(item => item.id);
            if (!view.readOnly && (pending || pendingPhone || failedSend || obsolete.length))
              void patchChat({
                澄湾待更新正文: null, 澄湾待更新手机: null, 澄湾失败请求: null,
              }, obsolete).catch(setError);
            pending = null;
            pendingPhone = null;
            failedSend = null;
            if (view.readOnly) {
              intents = [];
              updateQueueView();
            }
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
    reload: () => foreground('recovery', async () => {
      await reload();
      if (view.loadError) throw Error(view.loadError);
    }, 'reload'),
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
