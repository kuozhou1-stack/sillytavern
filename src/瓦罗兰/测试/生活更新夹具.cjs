const { pendingUpdateTasks } = require('../运行/update-tasks.ts');

function targetProgress(state) {
  const targets = new Set(pendingUpdateTasks(state)
    .map(id => state._系统.任务[id])
    .filter(task => task.触发来源 === '自动角色调度：当前生活检查')
    .flatMap(task => task.目标id));
  return Array.from(targets, id => {
    const value = state.角色[id].当前状态 === '正在整理本次工作记录'
      ? '已整理记录，正在核对下一项安排'
      : '正在整理本次工作记录';
    return { id, value };
  });
}

function lifeUpdates(state) {
  return targetProgress(state).map(({ id, value }) => ({
    op: 'replace', path: '/角色/' + id.replaceAll('~', '~0').replaceAll('/', '~1') + '/当前状态', value,
  }));
}

function lifeCandidate(state) {
  const candidate = structuredClone(state);
  for (const { id, value } of targetProgress(state)) candidate.角色[id].当前状态 = value;
  return candidate;
}

function requestState(env) {
  return env.vars.澄湾待更新手机?.draft ?? env.state();
}

module.exports = { lifeUpdates, lifeCandidate, requestState };
