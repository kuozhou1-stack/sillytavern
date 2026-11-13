import { Schema } from '../schema';
import type { State } from './core';
import { committedChanges, makeCommitReplay, type CommitReplay } from './commit-replay';
import type { StorySettlement } from './variable-changes';

/** 仅旧回执缺重放数据时，读取酒馆已有备份；不恢复备份、不接触服务器文件路径。 */
export async function legacyStoryReplay(current: State, base: State, story: StorySettlement & { replay?: CommitReplay }, check: () => void) {
  const post = Object.fromEntries(Object.entries(current._系统.提交记录).filter(([, receipt]) => receipt.数据版本 > story.version));
  const request = async (route: string, body?: object) => {
    check();
    const response = await fetch(new URL(route, window.parent.location.href), {
      method: 'POST', headers: SillyTavern.getRequestHeaders(), cache: 'no-store',
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    check();
    if (!response.ok) throw Error('无法读取旧正文的备份依据：HTTP ' + response.status);
    return response;
  };
  const index = await (await request('/api/backups/chat/get')).json();
  const card = SillyTavern.characters[Number(SillyTavern.characterId)];
  const prefix = 'chat_' + String(SillyTavern.groupId || card.name).replace(/[^a-z0-9]/gi, '_').toLowerCase() + '_';
  // 酒馆的 last_mes 可为日期字符串；备份文件名已有时间后缀，查询不依赖预览日期类型。
  const files = z.array(z.object({ file_name: z.string() })).parse(index)
    .filter(file => file.file_name.startsWith(prefix)).sort((a, b) => b.file_name.localeCompare(a.file_name));
  for (const file of files) {
    const text = await (await request('/api/backups/chat/download', { name: file.file_name })).text();
    check();
    const lines = text.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line));
    const message = lines[story.floor + 1];
    const raw = message?.variables?.[story.swipe]?.stat_data;
    const previous = lines[story.baseFloor + 1]?.variables?.[story.baseSwipe]?.stat_data;
    if (!raw || !previous || (message.swipe_id ?? 0) !== story.swipe) continue;
    const system = raw._系统;
    if (system?.存档id !== current._系统.存档id || system?.分支id !== current._系统.分支id ||
        system?.楼层id !== story.floor || system?.候选回复id !== String(story.swipe) ||
        system?.数据版本 !== story.version ||
        !_.isEqual(system.提交记录?.[story.commitId], current._系统.提交记录[story.commitId])) continue;
    if (!_.isEqual(Schema.parse(previous), base)) continue;
    const snapshot = Schema.parse(raw);
    // 已有原正文提交及此前的事务必须同链；仅允许确证的后续提交造成差异。
    if (Object.entries(snapshot._系统.提交记录).some(([id, receipt]) => !_.isEqual(receipt, current._系统.提交记录[id])) ||
        Object.keys(current._系统.提交记录).some(id => !snapshot._系统.提交记录[id] && !post[id])) continue;
    const changes = [...(story.replay?.changes ?? []), ...committedChanges(snapshot, current)];
    return makeCommitReplay(current, { ...story.replay?.records, ...post }, changes);
  }
  throw Error('未找到身份与原正文提交一致的备份，无法无损重算。已保留原正文和变量；可从前一楼层创建聊天分支后重玩。');
}
