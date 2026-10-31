import { copy, type State } from './core';
import { archivePrompt, archiveSourceRecords, finalizeArchive } from './archive';
import { openingCharacterPrompt } from './opening';
import { validateTaskResult } from './tasks';
import { taskHasActiveTargets } from './character-activity';
import { publicModelData, promptProjections, withPromptInstructions } from './model-history';
import { lifeCheckPrompt, readLifeChecks, requiresLifeCheck } from './life-check';

function currentTaskTargets(state: State, task: State['_系统']['任务'][string]) {
  return taskHasActiveTargets(state, task) && (!requiresLifeCheck(task) || task.目标id.every(
    id => state.角色[id]._管理.版本 === task.目标版本[id],
  ));
}

/** Maintenance is folded into an authorized story/phone request, never sent on its own. */
export function pendingUpdateTasks(state: State) {
  return Object.entries(state._系统.任务)
    .filter(([, task]) => (task.状态 === '排队' || (task.状态 === '失败' && requiresLifeCheck(task))) && currentTaskTargets(state, task))
    .map(([id]) => id);
}

export function withUpdateTasks(config: GenerateConfig, state: State, ids: string[]): GenerateConfig {
  const result = config;
  const descriptions: string[] = [];
  const sources = new Map<string, State['_系统']['来源档案'][string]>();
  let needsLifeCheck = false;
  let retriesLifeCheck = false;
  let needsRosterCheck = false;
  const archiveContext = promptProjections.get(config);
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
          : `人物 ${task.目标id.join('、')}：${task.类别}，覆盖起点 ${JSON.stringify(task.起始时间)}。${task.类别 === '升格' ? '按玩家的升格操作补全为主要角色结构。' : ''}${rosterCheck ? '按下方自动调度共同说明检查。' : ''}`;
    if (requiresLifeCheck(task)) needsLifeCheck = true;
    for (const target of task.目标id) {
      const sourceId = state.角色[target]?._管理.来源档案id;
      const source = sourceId && state._系统.来源档案[sourceId];
      if (source && (['建档', '自然融入'].includes(task.类别) ||
          (task.类别 !== '摘要' && source.当前融入状态 !== '已融入')))
        sources.set(sourceId, source);
    }
    const retry = requiresLifeCheck(task) && task.状态 === '失败';
    if (retry) retriesLifeCheck = true;
    const reason = retry ? `\n上次检查未完成（仅诊断资料）：${JSON.stringify((task.错误 ?? '未取得有效完成凭据').replace(/\s+/g, ' ').slice(0, 160))}` : '';
    descriptions.push(`待办 ${id}：\n${text}${reason}`);
  }
  if (!descriptions.length) return result;
  const lifeCheck = needsLifeCheck
    ? `生活更新共同检查：本次请求前故事时点 ${JSON.stringify(state.世界.当前时间)}；若本轮推进时间，接续到本轮实际结束时点，不能停在排队时的旧截止时间。时间未知则仅处理有依据的事件，不臆算时长。检查当前状态、地点、穿搭、生活安排、目标、约定及最近经历；关系、认知、重要记录仅按人物实际经历更新，后台事实不得自动传播给玩家。无变化允许保留，不凭空改动人设、不凑条数。已融入人物以当前档案为准，不反复恢复导入快照。\n`
    : '';
  const rosterCheck = needsRosterCheck
    ? '自动调度当前生活检查：包括未在玩家身边的开启人物。从最后已知时点接续自主生活到本轮结束，检查当前地点、状态、穿搭、生活安排、相关人物关系、认知和重要记录。主要角色同步经历；次要角色同步重要记录中的npc_current_state（当前近况）、npc_online_habits（网络往来）、npc_history（个人经历）及current_practice（近期实践），这些都是原有重要记录条目，不新建平行变量。关系含好感、信任、关系备注、当前定位、防御姿态、破壁阶段和已知私密，只有发生相应事实才变化，不因轮换涨分或自动亲密。允许无变化，不强行出场，不改写已有历史，不把后台事实赋予玩家知情。\n'
    : '';
  return withPromptInstructions(result, [{
      role: 'system', position: 'in_chat', depth: 0,
      content: '本次变量更新一并处理以下待办（不另发请求）：\n' + lifeCheck + rosterCheck + descriptions.join('\n') +
        (retriesLifeCheck ? '\n本次包含未完成的生活检查：已写入的事实不要重复演绎或再次结算。以当前存档核对既有进展，只补遗漏与本轮新事实；确无新增变化可据实回报无变化。' : '') +
        (needsLifeCheck ? '\n' + lifeCheckPrompt() : '') +
        (sources.size ? `\n只读来源资料（共用一次）：${JSON.stringify(Object.fromEntries(sources))}` : '') +
        (missingArchiveRecords.size ? `\n归档源记录共享补充（状态资料未提供的全文，按路径共用一次）：${JSON.stringify(Object.fromEntries(missingArchiveRecords))}` : '') +
        '\n本条只描述待办，不限制本次对其他变量的正常更新。',
  }]);
}

export function finalizeUpdateTasks(before: State, candidate: State, ids: string[], rawText?: string) {
  let result = candidate;
  const lifeChecks = readLifeChecks(rawText);
  for (const id of ids) {
    const task = before._系统.任务[id];
    if (!task || ['失效', '取消', '已提交'].includes(task.状态) || !currentTaskTargets(before, task)) continue;
    try {
      result =
        task.类别 === '摘要'
          ? finalizeArchive(before, copy(result), id, true)
          : validateTaskResult(before, result, id, true, true, lifeChecks);
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
