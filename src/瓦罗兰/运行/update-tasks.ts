import { copy, type State } from './core';
import { archivePrompt, archiveSourceRecords, finalizeArchive } from './archive';
import { openingCharacterPrompt } from './opening';
import { validateTaskResult, isCharacterLifeTask, hasCurrentCharacterTargets } from './tasks';
import { taskHasActiveTargets } from './character-activity';
import { publicModelData, promptProjections, withPromptInstructions } from './model-history';
import { createSourceContextProjector } from './source-context';

function currentTaskTargets(state: State, task: State['_系统']['任务'][string]) {
  return isCharacterLifeTask(task) ? hasCurrentCharacterTargets(state, task) : taskHasActiveTargets(state, task);
}

/** Maintenance is folded into an authorized story/phone request, never sent on its own. */
export function pendingUpdateTasks(state: State) {
  return Object.entries(state._系统.任务)
    .filter(([, task]) => (task.状态 === '排队' || (task.状态 === '失败' && isCharacterLifeTask(task))) && currentTaskTargets(state, task))
    .map(([id]) => id);
}

export function withUpdateTasks(config: GenerateConfig, state: State, ids: string[]): GenerateConfig {
  const result = config;
  const descriptions: string[] = [];
  const sources = new Map<string, Record<string, any>>();
  let needsLifeUpdate = false;
  let retriesLifeUpdate = false;
  let needsRosterCheck = false;
  const archiveContext = promptProjections.get(config);
  const projectSource = createSourceContextProjector(state, archiveContext);
  const missingArchiveRecords = new Map<string, unknown>();
  for (const id of ids) {
    const task = state._系统.任务[id];
    if (!task || !currentTaskTargets(state, task) || ['失效', '取消', '已提交'].includes(task.状态)) continue;
    const rosterCheck = task.触发来源 === '自动角色调度：当前生活检查';
    if (rosterCheck) needsRosterCheck = true;
    if (task.类别 === '摘要') {
      for (const { path, value } of archiveSourceRecords(state, id)) {
        if (value === undefined || _.isEqual(_.get(archiveContext, path), publicModelData(value, path))) continue;
        const pointer = '/' + path.map(part => part.replaceAll('~', '~0').replaceAll('/', '~1')).join('/');
        missingArchiveRecords.set(pointer, publicModelData(value, path));
      }
    }
    const text =
      task.类别 === '摘要'
        ? archivePrompt(state, id)
        : task.类别 === '建档'
          ? openingCharacterPrompt(state, id, true).replace(
              '开场正文已经生成并显示',
              '本次正文或手机交互已提供事实依据',
            )
          : `人物 ${task.目标id.join('、')}：${task.类别}，覆盖起点 ${JSON.stringify(task.起始时间)}。${task.类别 === '升格' ? '按玩家的升格操作补全为主要角色结构。' : ''}`;
    if (isCharacterLifeTask(task)) needsLifeUpdate = true;
    for (const target of task.目标id) {
      const sourceId = state.角色[target]?._管理.来源档案id;
      const source = sourceId && state._系统.来源档案[sourceId];
      if (source && (['建档', '自然融入'].includes(task.类别) ||
          (task.类别 !== '摘要' && source.当前融入状态 !== '已融入'))) {
        const extra = projectSource(sourceId, source);
        if (extra) sources.set(sourceId, extra);
      }
    }
    const retry = isCharacterLifeTask(task) && task.状态 === '失败';
    if (retry) retriesLifeUpdate = true;
    descriptions.push(`待办 ${id}：\n${text}`);
  }
  if (!descriptions.length) return result;
  const lifeUpdate = needsLifeUpdate
    ? `生活更新共同检查：本次请求前故事时点 ${JSON.stringify(state.世界.当前时间)}。按各待办起点接续至本轮实际结束时点，未知时间不臆算。沿现有个人目标和正在发展的事件链连续接续，复用记录与事件身份。每人的普通动作只写在最能承接下一轮的一处。主要和次要人物此刻正在做的事都写当前状态，已有目标取得进展就写该目标的进展。次要人物的持续近况或较长安排写在重要记录中的 npc_current_state。同一事实不在这些字段间重复。其他字段有独立变化时照常更新，有意义的个人经历按常驻规则续记。已融入人物以当前档案为准，不恢复导入快照。\n`
    : '';
  const rosterCheck = needsRosterCheck
    ? '自动调度当前生活检查：包括未在玩家身边的开启人物。每位本次调度目标必须有具体动态变化，并写入符合本轮时长与处境的进展。人物可以留在原处，玩家知情仍须有实际来源。\n'
    : '';
  return withPromptInstructions(result, [{
      role: 'system', position: 'in_chat', depth: 0,
      content: '本次变量更新一并处理以下待办（不另发请求）：\n' + lifeUpdate + rosterCheck + descriptions.join('\n') +
        (retriesLifeUpdate ? '\n本次包含未完成的生活更新：已写入的事实不要重复演绎或再次结算。先核对当前存档中本次已保存的动态，只补遗漏与本轮新事实，不为同次失败重试额外推进一轮生活。' : '') +
        (sources.size ? `\n只读来源资料补充（当前变量未提供）：${JSON.stringify(Object.fromEntries(sources))}` : '') +
        (missingArchiveRecords.size ? `\n归档源记录共享补充（状态资料未提供的全文，按路径共用一次）：${JSON.stringify(Object.fromEntries(missingArchiveRecords))}` : '') +
        '\n本条只描述待办，不限制本次对其他变量的正常更新。',
  }]);
}

export function finalizeUpdateTasks(before: State, candidate: State, ids: string[], _rawText?: string) {
  let result = candidate;
  for (const id of ids) {
    const task = before._系统.任务[id];
    if (!task || ['失效', '取消', '已提交'].includes(task.状态) || !currentTaskTargets(before, task)) continue;
    try {
      result =
        task.类别 === '摘要'
          ? finalizeArchive(before, copy(result), id, true)
          : validateTaskResult(before, result, id, true, true);
    } catch (error) {
      // Opening remains atomic. Optional maintenance failure must not discard the actual interaction.
      if (task.类别 === '建档') throw error;
      result._系统.任务[id].状态 = '失败';
      result._系统.任务[id].错误 = String(error);
      console.warn('[瓦洛兰变量更新] 待办保留待重试', id);
    }
  }
  return result;
}
