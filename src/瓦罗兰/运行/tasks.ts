import { planArchives } from './archive';
import { Schema } from '../schema';
import { copy, uid, type State } from './core';
import { validateOpeningResult } from './opening';
import { taskHasActiveTargets } from './character-activity';
export const isCharacterLifeTask = (task: { 类别: string }) => ['生活更新', '自然融入', '升格'].includes(task.类别);
export function planTasks(state: State): State {
  const s: any = copy(state);
  const busyTargets = new Set(
    Object.values(state._系统.任务)
      .filter(t => ['排队', '生成中', '待校验', '待提交', '失败'].includes(t.状态))
      .flatMap(t => t.目标id),
  );
  for (const [id, person] of Object.entries(s.角色) as any) {
    // A management action can change the major/minor discriminator before scheduling.
    if (person.层级 === '主要' && (!person.经历 || !person._更新循环)) {
      // 层级切换时把次要简表迁入主要结构；保留原性格与体型，不以 null 阻塞保存。
      const promoted = copy(person);
      if (typeof promoted.性格 === 'string' || promoted.性格 == null)
        promoted.性格 = { 表性格: promoted.性格 ?? null };
      s.角色[id] = Schema.shape.角色.unwrap().valueType.parse(promoted);
    }
  }
  for (const [id, person] of Object.entries(s.角色) as any) {
    if (s._系统.角色停用标识[id]) continue;
    if (busyTargets.has(id)) continue;
    const source = s._系统.来源档案[person._管理.来源档案id];
    const loop = person._更新循环;
    const date = (t: any) => (t ? `${t.年}-${t.月}-${t.日}` : null);
    const stale = loop?.上次更新变量时间 && s.世界.当前时间 && date(loop.上次更新变量时间) !== date(s.世界.当前时间);
    const due = loop && (loop.当前计数 >= (loop.使用统一阈值 ? s._系统.默认更新阈值 : loop.更新阈值) || stale);
    const category = person._管理.升格
      ? '升格'
      : source && source.当前融入状态 !== '已融入'
        ? '自然融入'
        : due
          ? '生活更新'
          : null;
    if (!category) continue;
    const tid = uid('task');
    s._系统.任务[tid] = {
      类别: category,
      目标id: [id],
      目标版本: { [id]: person._管理.版本 },
      存档id: s._系统.存档id,
      分支id: s._系统.分支id,
      楼层id: s._系统.楼层id,
      输入数据版本: s._系统.数据版本,
      计数截止点: { [id]: loop?.当前计数 ?? 0 },
      起始时间: loop?.上次更新变量时间 ?? null,
      截止时间: s.世界.当前时间,
      状态: '排队',
      提交id: uid('task_commit'),
    };
    if (loop) loop.待处理任务id = tid;
  }
  return planArchives(s);
}
export function validateTaskResult(
  before: State,
  after: State,
  taskId: string,
  withOpeningStory = false,
  withInteraction = false,
): State {
  const task = before._系统.任务[taskId];
  if (!task) throw Error('任务不存在');
  if (['失效', '取消', '已提交'].includes(task.状态) || !taskHasActiveTargets(before, task)) throw Error('任务或人物已停用，结果失效');
  const result = copy(after);
  const combined = withOpeningStory && task.类别 === '建档';
  validateOpeningResult(before, result, taskId, combined);
  for (const [id, p] of Object.entries(before.角色))
    if (!combined && !withInteraction && !task.目标id.includes(id) && !_.isEqual(p, result.角色[id]))
      throw Error('后台任务越权修改其他人物');
  for (const id of Object.keys(result.角色))
    if (!combined && !withInteraction && !before.角色[id] && !task.目标id.includes(id))
      throw Error('后台任务不得递归建立人物');
  for (const id of task.目标id) {
    const person = result.角色[id],
      old = before.角色[id];
    if (!person || !old || old._管理.版本 !== task.目标版本[id]) throw Error('目标已替换或删除');
    if (task.类别 === '升格' && person.层级 !== '主要') throw Error('升格候选缺少主要角色结构');
    person._管理.升格 = false;
    if (person.层级 === '主要') {
      person._更新循环.当前计数 = Math.max(
        0,
        person._更新循环.当前计数 - (task.类别 === '生活更新' ? task.计数截止点[id] : 0),
      );
      person._更新循环.上次更新变量时间 = combined || withInteraction ? result.世界.当前时间 : task.截止时间;
      person._更新循环.待处理任务id = null;
    }
    const sourceId = person._管理.来源档案id;
    if (['自然融入', '建档'].includes(task.类别) && sourceId) result._系统.来源档案[sourceId].当前融入状态 = '已融入';
  }
  result._系统.任务[taskId].状态 = '已提交';
  result._系统.任务[taskId].错误 = null;
  result._系统.任务[taskId].候选结果JSON = null;
  return Schema.parse(result);
}
