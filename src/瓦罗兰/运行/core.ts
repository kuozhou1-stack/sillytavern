import { Schema } from '../schema';
import { assertDisabledUnchanged } from './character-activity';
import { assertNovelModel } from './novel-system';
import { assertInformationUnchanged } from './knowledge-context';
import { randomUUID } from './browser-crypto';
import { isPrivateModelPath, modelPathParts, privateModelPaths, publicModelFields } from './model-fields';

export type State = z.infer<typeof Schema>;
export type Context = {
  chat: string;
  floor: number;
  swipe: number;
  branch: string;
  version: number;
  fingerprint: string;
};
export const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export const equal = (a: unknown, b: unknown) => _.isEqual(a, b);
export const uid = (prefix = 'cw') => `${prefix}_${randomUUID()}`;
export const privatePaths = privateModelPaths;
const publicOnly = publicModelFields;

/** Inspect actual command values before MVU's schema can strip an unknown private key. */
export function assertModelPrivatePatches(before: State, commands: readonly any[]) {
  const parts = modelPathParts;
  const oldPrivate = privatePaths(before);
  for (const command of commands) {
    if (command?.op === 'test') continue;
    // MVU's documented move uses from/to; RFC-style patches may still supply path.
    const target = command?.path ?? command?.to;
    if (typeof target !== 'string' || (target !== '' && !target.startsWith('/'))) continue;
    const route = target === '' ? [] : parts(target);
    const privateTarget = isPrivateModelPath(route);
    if (privateTarget) {
      if (!['add', 'replace', 'insert'].includes(command.op) || Object.hasOwn(command, 'from') ||
          !_.has(before, route) || !equal(_.get(before, route), command.value))
        throw Error('模型尝试修改脚本管理字段：' + target);
    }
    if (command.op === 'move' && typeof command.from === 'string' && isPrivateModelPath(parts(command.from)))
      throw Error('模型尝试修改脚本管理字段：' + command.from);
    if (!Object.hasOwn(command, 'value') || privateTarget) continue;
    const addedPrivate = privatePaths(command.value, target);
    if (!Object.keys(addedPrivate).length) continue;
    const probe = copy(before);
    const raw = route.length ? _.set(probe, route, publicOnly(command.value, route)) : publicOnly(command.value);
    const defaults = privatePaths(Schema.parse(raw));
    for (const [path, value] of Object.entries(addedPrivate)) {
      const existing = Object.hasOwn(oldPrivate, path);
      if (!equal(value, existing ? oldPrivate[path] : defaults[path]))
        throw Error((existing ? '模型尝试修改脚本管理字段：' : '新记录包含非默认脚本管理字段：') + path);
    }
  }
}
/** AI cannot change script-owned fields. Compare raw input before Schema strips unknown keys. */
export function validateModel(before: State, raw: any, allowedRoots?: string[]): State {
  const oldPrivate = privatePaths(before),
    nextPrivate = privatePaths(raw);
  for (const [path, value] of Object.entries(oldPrivate))
    if (!equal(value, nextPrivate[path])) throw Error('模型尝试修改脚本管理字段：' + path);
  const additions = Object.entries(nextPrivate).filter(([path]) => !Object.hasOwn(oldPrivate, path));
  if (additions.length) {
    const defaults = privatePaths(Schema.parse(publicOnly(raw)));
    for (const [path, value] of additions) {
      const expected = defaults[path];
      if (!equal(value, expected)) throw Error('新记录包含非默认脚本管理字段：' + path);
    }
  }
  if (allowedRoots)
    for (const root of Object.keys(before)) {
      if (!allowedRoots.includes(root) && !equal((before as any)[root], raw[root])) throw Error(`越权更新：${root}`);
    }
  for (const id of Object.keys(before._系统.角色停用标识))
    if (raw.角色?.[id]) throw Error('已移除人物不能被后台重新建立');
  const parsed = Schema.parse(raw);
  // Omitted prompt history is still stored. A parent-object replacement must not erase it.
  for (const root of ['消息', '帖子', '评论'] as const)
    for (const id of Object.keys(before.手机.原文[root]))
      if (!Object.hasOwn(parsed.手机.原文[root], id)) throw Error('模型不能删除手机历史原文：' + id);
  for (const [id, message] of Object.entries(before.手机.原文.消息)) {
    const { 撤回时间: oldWithdrawal, ...original } = message;
    const { 撤回时间: nextWithdrawal, ...current } = parsed.手机.原文.消息[id];
    if (!equal(original, current)) throw Error('模型不能改写已发送消息原文：' + id);
  }
  for (const id of Object.keys(before.手机.摘要))
    if (!Object.hasOwn(parsed.手机.摘要, id)) throw Error('模型不能删除历史摘要：' + id);
  assertInformationUnchanged(before, parsed);
  assertDisabledUnchanged(before, parsed);
  assertNovelModel(before, parsed);
  return parsed;
}
export interface StateHost {
  context(): Context;
  read(floor: number): any;
  write(data: any, floor: number): Promise<void>;
  persist(): Promise<void>;
  journal(value: any): Promise<void>;
}
export function assertContext(expected: Context, current: Context) {
  if (!equal(expected, current)) throw Error('聊天、候选、楼层或数据已变化，本次结果失效，请重新读取');
}
/** One instance is shared by every iframe in the host. No whole-state watch writes. */
export class CommitService {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(readonly host: StateHost) {}
  run<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.tail.then(operation, operation);
    this.tail = next.catch(() => undefined);
    return next;
  }
  async commit(
    expected: Context,
    id: string,
    mutate: (candidate: State) => void | State,
    rollbackOnFailure = false,
    assertWritable?: () => void,
  ): Promise<State> {
    return this.run(async () => {
      const current = this.host.context();
      if (
        current.chat !== expected.chat ||
        current.floor !== expected.floor ||
        current.swipe !== expected.swipe ||
        current.branch !== expected.branch
      )
        assertContext(expected, current);
      const envelope = copy(this.host.read(expected.floor));
      const before = Schema.parse(envelope.stat_data);
      if (before._系统.提交记录[id]) {
        await this.host.persist();
        return before;
      }
      assertContext(expected, current);
      assertWritable?.();
      const draft = copy(before);
      const candidate = mutate(draft) || draft;
      candidate._系统.数据版本 = before._系统.数据版本 + 1;
      candidate._系统.存档id ??= uid('save');
      candidate._系统.分支id = expected.branch;
      candidate._系统.楼层id = expected.floor;
      candidate._系统.候选回复id = String(expected.swipe);
      candidate._系统.提交记录[id] = {
        任务id: null,
        事件id: [],
        数据版本: candidate._系统.数据版本,
        状态: '已写入',
        恢复候选JSON: null,
      };
      const validated = Schema.parse(candidate);
      const recovery = { context: expected, commitId: id, candidate: validated, rollbackOnFailure };
      await this.host.journal(recovery);
      assertContext(expected, this.host.context());
      assertWritable?.();
      // Management callers retain this journal until both activity and snapshots are acknowledged.
      try {
        await this.host.write({ ...envelope, stat_data: validated }, expected.floor);
        const readback = Schema.parse(this.host.read(expected.floor).stat_data);
        if (!equal(readback, validated)) throw Error('写回后的完整数据不一致，保留恢复记录');
        await this.host.persist();
        // The card's persistence adapter confirms server readback before resolving.
        const after = this.host.context();
        if (
          after.chat !== expected.chat ||
          after.floor !== expected.floor ||
          after.swipe !== expected.swipe ||
          after.branch !== expected.branch
        )
          throw Error('保存期间上下文已变化，未清除恢复记录');
        await this.host.journal(null);
        return readback;
      } catch (error) {
        if (rollbackOnFailure) {
          const now = this.host.context();
          // Never overwrite a different branch or another writer's changes.
          if (
            now.chat === expected.chat &&
            now.floor === expected.floor &&
            now.swipe === expected.swipe &&
            now.branch === expected.branch &&
            equal(this.host.read(expected.floor).stat_data, validated)
          ) {
            await this.host.write(envelope, expected.floor);
            if (!equal(this.host.read(expected.floor), envelope))
              throw Error('角色管理回滚读回失败，保留恢复记录', { cause: error });
            try {
              await this.host.persist();
            } catch {
              /* Durable journal and immutable snapshots remain recoverable. */
            }
          }
        }
        throw error;
      }
    });
  }
}
export function countRound(state: State, eventId: string) {
  if (state._系统.已计轮事件[eventId]) return;
  const ids: string[] = [];
  for (const [id, person] of Object.entries(state.角色))
    if (person.层级 === '主要') {
      person._更新循环.当前计数 += 1;
      ids.push(id);
    }
  state._系统.已计轮事件[eventId] = { 提交id: eventId, 角色id: ids };
}
export function lowStatus(previous: Record<string, boolean>, state: State) {
  const next: Record<string, boolean> = {};
  const alerts: string[] = [];
  for (const key of ['饱食度', '水分值', '体力值'] as const) {
    const value = state.玩家.当前状态[key];
    next[key] = value !== null && value < 20;
    if (next[key] && !previous[key]) alerts.push(key);
  }
  return { next, alerts };
}
