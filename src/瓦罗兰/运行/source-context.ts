import { Schema } from '../schema';
import { copy, type State } from './core';
import { bindTemplatePlayer, normalizeCharacterImport } from './characters';
import { publicModelData } from './model-history';
import { isModelRecord } from './model-fields';

type Source = State['_系统']['来源档案'][string];

/** Existing values, including null/false/0/empty collections, belong to the current character. */
function missingCharacterFields(source: any, provided: any, path: string[]): any {
  if (provided === undefined) return copy(source);
  if (isModelRecord(path) || !_.isPlainObject(source) || !_.isPlainObject(provided)) return undefined;
  const missing = Object.fromEntries(Object.entries(source).flatMap(([key, value]) => {
    const extra = missingCharacterFields(value, Object.hasOwn(provided, key) ? provided[key] : undefined, [...path, key]);
    return extra === undefined ? [] : [[key, extra]];
  }));
  return Object.keys(missing).length ? missing : undefined;
}

/** Request-only projection. Neither source snapshots nor the variable projection are modified. */
export function createSourceContextProjector(state: State, provided?: Record<string, any>) {
  const seenRecords = new Map<string, unknown[]>();
  const seenSources = new Map<string, Source[]>();
  const rawPhoneKinds = new Set(['消息', '帖子', '评论', '点赞', '转发']);
  const additionalRecords = (records: Record<string, unknown>, path: string[]) =>
    Object.fromEntries(Object.entries(records).filter(([id, value]) => {
      if (_.isEqual(_.get(provided, [...path, id]), value)) return false;
      const key = JSON.stringify([...path, id]);
      const seen = seenRecords.get(key) ?? [];
      if (seen.some(record => _.isEqual(record, value))) return false;
      seenRecords.set(key, [...seen, value]);
      return true;
    }).map(([id, value]) => [id, copy(value)]));

  function project(sourceId: string, source: Source): Record<string, any> | undefined {
    const seen = seenSources.get(sourceId) ?? [];
    if (seen.some(previous => _.isEqual(previous, source))) return undefined;
    seenSources.set(sourceId, [...seen, source]);
    const packet = source.原始快照JSON === null ? {} : JSON.parse(source.原始快照JSON);
    const { id, 格式版本, 角色, 手机, 来源, 来源档案, 关联约定, ...other } = packet;
    const personId = source.人物id ?? id;
    const extra: Record<string, any> = copy(other);
    if (角色) {
      const normalized = normalizeCharacterImport(角色);
      if (source.格式版本 === '裸角色资料') bindTemplatePlayer(normalized, state, personId);
      const character = Schema.shape.角色.unwrap().valueType.parse(normalized);
      if (provided) for (const [targetId, relation] of Object.entries(character.关系网)) {
        const name = targetId === provided.玩家?.id ? provided.玩家.姓名
          : provided.角色?.[targetId]?.姓名 ?? state._系统.角色停用标识[targetId]?.姓名;
        if (name && relation.姓名 === name) delete relation.姓名;
      }
      const missing = missingCharacterFields(
        publicModelData(character, ['角色', personId]), provided?.角色?.[personId], ['角色', personId],
      );
      if (missing !== undefined) extra.角色 = missing;
    }
    const phone = 手机 && Schema.shape.手机.unwrap().parse({
      ..._.omit(手机, [...rawPhoneKinds]), 原文: _.pick(手机, [...rawPhoneKinds]),
    });
    for (const [kind, records] of Object.entries(手机 ?? {})) {
      const path = rawPhoneKinds.has(kind) ? ['手机', '原文', kind] : ['手机', kind];
      const normalized = rawPhoneKinds.has(kind) ? phone.原文[kind] : phone[kind];
      const missing = additionalRecords(publicModelData(_.merge({}, records, normalized), path), path);
      if (Object.keys(missing).length) (extra.手机 ??= {})[kind] = missing;
    }
    const agreements = additionalRecords(publicModelData(
      _.merge({}, 关联约定, Schema.shape.约定.unwrap().parse(关联约定 ?? {})), ['约定'],
    ), ['约定']);
    if (Object.keys(agreements).length) extra.关联约定 = agreements;
    for (const [nestedId, nested] of Object.entries(来源档案 ?? {})) {
      const normalized = Schema.shape._系统.unwrap().shape.来源档案.unwrap().valueType.parse(nested);
      const missing = project(nestedId, normalized);
      if (missing) (extra.来源档案 ??= {})[nestedId] = missing;
    }
    const origin = { ...来源 };
    for (const key of ['来源存档id', '导出故事时间', '原时间锚点'] as const)
      if (source[key] !== null) origin[key] = copy(source[key]);
    if (Object.keys(origin).length) extra.来源 = origin;
    if (Object.keys(source.资源清单).length) extra.资源清单 = copy(source.资源清单);
    if (!Object.keys(extra).length) return undefined;
    return { 人物id: personId, 格式版本: source.格式版本 ?? 格式版本, ...extra };
  }
  return project;
}
