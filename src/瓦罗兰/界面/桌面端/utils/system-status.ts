import type { State } from '../../../运行/core';
import { resolveCharacterName } from './entity';

/** 阅读用投影，不把内部任务或提交编码当作玩家需要理解的名称。 */
export function systemTasks(state: Partial<State>, system: State['_系统']) {
  const names = (ids: string[]) => ids.map(id => resolveCharacterName(state, id)).join('、');
  const labels: Record<string, string> = {
    建档: '开局档案补全', 生活更新: '人物生活与关系更新', 自然融入: '导入人物融入世界',
    升格: '补全主要角色档案', 摘要: '整理历史记录', 正文: '正文结算',
    私聊: '私聊回应', 群聊: '群聊回应', 刷新: '手机内容刷新', 导入: '导入人物', 删除: '移除人物',
  };
  const statuses: Record<string, string> = {
    排队: '等待下次结算', 生成中: '正在生成', 待校验: '正在检查结果', 待提交: '等待保存',
    已提交: '已完成', 失败: '需要重试', 取消: '已取消', 失效: '已停止',
  };
  return Object.entries(system.任务).map(([id, task]) => ({
    id, title: labels[task.类别] ?? '资料更新', targets: names(task.目标id),
    status: statuses[task.状态] ?? '等待处理', error: task.错误,
    pending: ['排队', '生成中', '待校验', '待提交', '失败'].includes(task.状态),
    failed: task.状态 === '失败',
    note: task.触发来源 === '自动角色调度：当前生活检查' ? '角色轮换后检查现状，随正文或手机互动处理' : '',
  }));
}

export function systemCommits(system: State['_系统'], tasks: ReturnType<typeof systemTasks>) {
  return Object.entries(system.提交记录).map(([id, record]) => ({
    id, version: record.数据版本,
    title: tasks.find(task => task.id === record.任务id)?.title ?? '互动与资料保存',
    status: record.状态 === '已持久保存' ? '已保存并确认' : record.状态 === '已写入' ? '已写入，等待确认' : '等待保存确认',
  })).sort((a, b) => b.version - a.version);
}
