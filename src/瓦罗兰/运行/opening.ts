import { Schema } from '../schema';
import { copy, uid, type State } from './core';
import { playerMapLocationIds, pendingPlayerMapLocations, playerMapLocationPrompt, validPlayerMapPosition } from './player-map-location';

/** The saved action and native worldbook state drive opening generation. */
export const openingMessage = '请根据已保存的建档资料生成开场。';

/** One NPC batch and/or player profile revisions. Runtime generates opening narrative before settling this batch. */
export function planOpeningCharacters(state: State, ids: string[], allowEmpty = false): State {
  const draft = copy(state);
  const targets = [...new Set(ids)].filter(
    id =>
      draft.角色[id]?._管理.来源档案id &&
      !Object.values(draft._系统.任务).some(
        t => t.目标id.includes(id) && ['排队', '生成中', '待校验', '待提交', '失败'].includes(t.状态),
      ),
  );
  if (!targets.length && !allowEmpty) return draft;
  const hasActiveTask = Object.values(draft._系统.任务).some(
    t => t.类别 === '建档' && ['排队', '生成中', '待校验', '待提交', '失败'].includes(t.状态),
  );
  if (hasActiveTask) return draft;
  const taskId = uid('opening');
  draft._系统.任务[taskId] = Schema.parse({
    _系统: {
      任务: {
        [taskId]: {
          类别: '建档',
          触发来源: targets.length
            ? '玩家确认建档：整理本次启用的开局角色，并授权补全和修订适用的玩家与角色设定'
            : '玩家确认建档：授权补全和修订适用的玩家基础设定与开局变量结算',
          目标id: targets,
          目标版本: Object.fromEntries(targets.map(id => [id, draft.角色[id]._管理.版本])),
          存档id: draft._系统.存档id,
          分支id: draft._系统.分支id,
          楼层id: draft._系统.楼层id,
          输入数据版本: draft._系统.数据版本,
          截止时间: copy(draft.世界.开局时间),
          提交id: uid('opening_commit'),
          状态: '排队',
        },
      },
    },
  })._系统.任务[taskId];
  for (const id of targets) {
    const person = draft.角色[id];
    if (person.层级 === '主要') person._更新循环.待处理任务id = taskId;
  }
  return draft;
}

/** Merge legacy queued tasks at dispatch, without rerunning committed work or auto-retrying failures. */
export function mergeOpeningTasks(state: State, taskId: string, retryIds: ReadonlySet<string>): State {
  const draft = copy(state),
    head = draft._系统.任务[taskId];
  if (head.类别 !== '建档') return draft;
  for (const [id, task] of Object.entries(draft._系统.任务)) {
    if (
      id === taskId ||
      task.类别 !== '建档' ||
      !(task.状态 === '排队' || (task.状态 === '失败' && retryIds.has(id))) ||
      !_.isEqual(task.截止时间, head.截止时间) ||
      (task.提交id && draft._系统.提交记录[task.提交id])
    )
      continue;
    for (const target of task.目标id) {
      if (head.目标id.includes(target) && head.目标版本[target] !== task.目标版本[target])
        throw Error('开局任务目标版本冲突，请检查人物替换记录');
      if (!head.目标id.includes(target)) head.目标id.push(target);
      head.目标版本[target] = task.目标版本[target];
      const person = draft.角色[target];
      if (person?.层级 === '主要' && person._更新循环.待处理任务id === id) person._更新循环.待处理任务id = taskId;
    }
    task.状态 = '失效';
    task.错误 = '已合并至整批开局任务：' + taskId;
  }
  return draft;
}

export function openingCharacterPrompt(state: State, taskId: string, withStory = false): string {
  const task = state._系统.任务[taskId];
  if (task?.类别 !== '建档') throw Error('不是开局角色整理任务');
  const targets = task.目标id;
  const targetText = targets.length > 0
    ? `本次全部目标人物：${targets.join('、')}。依据已提供档案整理身份、种族、形态、背景、外貌、性格、生活、状态、关系与认知；种族和形态不混同，不赋予未设定的变形能力。保持既有身份与经历连贯，结果合并进同一更新块。`
    : '本次无额外导入角色，重点处理玩家基础设定补全和修订及开局变量结算。';

  return `【本次建档变量整理】只在本次开局补全任务及其失败重试中适用，成功后停止发送。
玩家已授权补全、修订或清空所有适用的玩家档案内容，已填写内容也可按依据修订，无需逐字段再次授权。按最新要求、本轮正文、当前档案、导入资料和连贯设定的顺序确定内容；未知的基础设定可合理创作，不无故改动已确认事实。
检查玩家姓名、称呼、种族、性别、年龄、身份、全部外貌与背景、生活与住处。种族不与职业混用，id稳定。建档饱食度、水分值、体力值由程序默认100，保留已填写的0及其他值，不重设为未知。
明确的无、0、false和有含义的空集合不当缺失；尚未获知的秘密、他人隐私、不适用项目不强行补齐。补设定不等于玩家已行动，不凭空增加已完成交易、消息、接受邀约或重大关系经历。
初始技能只按明确设定或实际学习事实整理名称、品质、描述，复用技能id，不赋予未学能力、不加等级经验系统。
补全结果必须实际写入MVU，不能只在分析中叙述；可适用但未存在的字段用insert。种族、形态、私密资料按适用条件处理，不为保留资料擅改性别或适用标记；明确不适用则不生成。
【导入角色与环境处理】
只整理本次目标，不恢复待机角色；远处联系人不等于在场。
${targetText}
初始认知、经历等若来自授权创作，来源用“授权生成/开局补全”；没有相识依据不编造玩家既往行为。开局时间仅取玩家已确认起点，未知不补日期。已明确的住所、起点、单位和常去地点可登记“玩家填写”知情来源，不自动登记他人私宅。
${withStory ? '开场正文已经生成并显示：本次在同一个MVU更新块中结算正文确实发生的状态变化，并完成上述玩家资料补全和修订与导入角色整批整理。正文已明确的事实是本次更新依据；玩家未执行的行为不能结算。其他人物、地点、时间、手机、事件与约定仅按正文和既有规则更新，不重复生成正文。' : '只补全和修订玩家基础设定、目标人物资料及其必要的新地点。已有地点仅允许按下方清单补全玩家自设地点的空坐标，其他字段、世界时间、手机原文、事件或约定不能改写；不要输出第一段剧情、替玩家发消息或执行动作。'}新增或改动的人物地点引用必须有效；导入人物原有的未建档地点引用可沿用，必要时再创建符合世界设定的住所/工作地点，私人地点不得变成玩家默认已知地点。男性不生成私密内容，不为不适用的字段编造数据。已明确无法确定或逻辑冲突的项目可以保留未知并说明原因。
${withStory ? (pendingPlayerMapLocations(state).length ? "【开局自设地点定位】按本次玩家自设地点定位专项资料补齐地址，只更新明确授权的地图位置；已提供的地区范围无需重复生成。" : "") : playerMapLocationPrompt(state, "开局")}
按现有世界书规定输出MVU更新块，所有下划线字段只读。`;
}

export function validatePlayerReferences(beforePlayer: State['玩家'], afterPlayer: State['玩家'], afterPlaces: State['地点']) {
  if (beforePlayer.id && afterPlayer.id !== beforePlayer.id) {
    throw Error('开局资料补全不能更改玩家 ID');
  }
  const newHome = afterPlayer.生活?.住处id;
  if (newHome && !afterPlaces[newHome]) {
    throw Error('玩家新住处引用了不存在的地点：' + newHome);
  }
}

export function validateOpeningResult(before: State, after: State, taskId: string, withStory = false) {
  const task = before._系统.任务[taskId];
  if (task.类别 !== '建档') return after;
  validatePlayerReferences(before.玩家, after.玩家, after.地点);
  const mapRequests = new Set(pendingPlayerMapLocations(before).map(row => row.id));
  for (const [id, place] of Object.entries(before.地点)) {
    const next = after.地点[id];
    const onlyFilledMap = mapRequests.has(id) && validPlayerMapPosition(next) &&
      _.isEqual(place, { ...next, 地图位置: place.地图位置 });
    if (!withStory && !_.isEqual(place, next) && !onlyFilledMap)
      throw Error('开局角色补全不能改写已有地点：' + id);
  }
  for (const id of mapRequests) {
    if (!validPlayerMapPosition(after.地点[id])) throw Error('开局自设地点缺少所属地区内的有效地图坐标：' + id);
    if (!Object.hasOwn(after.玩家.已知信息.已知地点, id)) throw Error('开局自设地点缺少玩家知情记录：' + id);
  }
  const referenced = new Set<string>();
  for (const id of task.目标id) {
    const person = after.角色[id];
    const original = before.角色[id];
    if (!person || person.层级 !== original.层级) throw Error('开局补全不能删除人物或改变层级');
    const originalLocations = new Set([
      original.当前地点id,
      original.生活.住处id,
      ...original.生活.工作地点id,
      ...original.生活.常去地点id,
    ]);
    for (const location of [
      person.当前地点id,
      person.生活.住处id,
      ...person.生活.工作地点id,
      ...person.生活.常去地点id,
    ]) {
      // 导入资料里的未建档地点可以沿用；新增悬空引用和删掉已有地点仍须拦截。
      if (location && !after.地点[location] && (!originalLocations.has(location) || before.地点[location]))
        throw Error('开局角色引用了不存在的地点：' + location);
      if (location) referenced.add(location);
    }
  }
  for (const id of playerMapLocationIds(after)) referenced.add(id);
  for (const id of Object.keys(after.地点))
    if (!withStory && !before.地点[id] && !referenced.has(id)) throw Error('开局补全新增地点未关联目标人物：' + id);
  return after;
}

/** Same request-local authority as the worldbook rules; only the explicitly authorized opening task. */
export function authorizeOpeningPrompt(config: GenerateConfig, state: State, taskId: string): GenerateConfig {
  const task = state._系统.任务[taskId];
  if (task.类别 !== '建档') return config;
  const targetDesc = task.目标id.length > 0 ? `及开局导入人物 ${task.目标id.join('、')}` : '';
  return {
    ...config,
    injects: [
      ...(config.injects ?? []),
      {
        role: 'system',
        position: 'in_chat',
        depth: 0,
        content: `本次任务的玩家最新明确授权：玩家档案的所有内容字段（姓名、称呼、种族、性别、年龄、身份、外貌身形、成长与生活背景、住处与日常活动等）${targetDesc}均可补全、修订或清空，已填写内容也允许修订，无需逐字段再次授权。依据玩家最新要求、正文事实、当前资料与瓦洛兰世界设定合理更新，保持内容连贯，避免无依据的变动或档案大面积显示未知。这项明确授权覆盖旧规则中对已填写内容的不可改写限制及未知字段“保留未知、不得推测”的默认要求。不替玩家决定或执行行动；知情边界、稳定ID及下划线只读规则仍须遵守。更新结果必须实际写入 MVU 变量。`,
      },
    ],
  };
}
