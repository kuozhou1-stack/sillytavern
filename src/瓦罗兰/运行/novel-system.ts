import type { State } from './core';

type Quest = State['奇遇系统']['任务'][string];
export type NovelAction = { kind: 'enable' | 'accept' | 'abandon' | 'claim' | 'buy'; id?: string; operationId: string };
export type SystemGood = {
  id: string;
  name: string;
  price: number;
  category: string;
  description: string;
  rare?: boolean;
  limit?: number;
};

// 固定目录和价格由代码维护；超常商品占少数，均为有限用途的消耗券。
export const SYSTEM_GOODS: readonly SystemGood[] = [
  {
    id: 'water',
    name: '随身饮水',
    price: 8,
    category: '消耗品',
    description: '一瓶普通饮用水。实际饮用量和身体状态变化依照正常剧情结算。',
  },
  {
    id: 'snack',
    name: '轻食补给包',
    price: 15,
    category: '消耗品',
    description: '一份便携轻食。可正常食用，不带超常恢复效果。',
  },
  {
    id: 'notebook',
    name: '城市漫游手账',
    price: 35,
    category: '工具与设备',
    limit: 1,
    description: '用于记录城市路线、生活见闻和个人灵感的普通手账。',
  },
  {
    id: 'umbrella',
    name: '轻便晴雨伞',
    price: 40,
    category: '工具与设备',
    limit: 1,
    description: '一把普通折叠伞，兼顾遮阳与挡雨。',
  },
  {
    id: 'coffee',
    name: '咖啡体验券',
    price: 25,
    category: '消耗品',
    description: '可兑换一次普通咖啡体验的系统凭证。消费发生在玩家实际选择兑换后，不自动移动玩家或预约店铺。',
  },
  {
    id: 'workshop',
    name: '兴趣体验券',
    price: 70,
    category: '消耗品',
    description: '兑换一次公开兴趣体验课的凭证。玩家自行选择合理可达的课程，按正常时间与安排参加，不直接获得技能。',
  },
  {
    id: 'focus',
    name: '感官聚焦券',
    price: 220,
    category: '消耗品',
    rare: true,
    limit: 2,
    description:
      '稀有超常奖励。明确使用后仅在当前一段行动中加强对真实可感知细节的注意与分辨，行动结束即失效；不能读心、透视、远程感知或获知未接触的秘密。每次使用消耗一张。',
  },
  {
    id: 'learning',
    name: '学习回响券',
    price: 280,
    category: '消耗品',
    rare: true,
    limit: 2,
    description:
      '稀有超常奖励。明确使用后仅增强一次真实练习的理解与记忆，练习结束即失效；仍需投入时间，不凭空生成知识，不直接成为大师。每次使用消耗一张。',
  },
  {
    id: 'encounter',
    name: '偶遇信标',
    price: 320,
    category: '消耗品',
    rare: true,
    limit: 1,
    description:
      '稀有超常奖励。明确使用后在下一次合理可达的公共活动中提供一次自然相遇的机会，机会出现后即失效；只涉及活动角色或普通新人物，不强迫邀约、好感和选择，不复活停用角色，也不瞬移。每次使用消耗一枚。',
  },
];

/** Generated goods supplement fixed supplies; refresh never removes saved definitions. */
export function systemGoods(state: State): SystemGood[] {
  return [
    ...SYSTEM_GOODS,
    ...Object.entries(state.奇遇系统._商店商品).map(([id, good]) => ({
      id, name: good.名称, price: good.价格, category: good.类别, description: good.描述,
      rare: good.稀有, limit: good.限购,
    })),
  ];
}

export function storyDay(state: State): string | null {
  const t = state.世界.当前时间;
  return t
    ? `${String(t.年).padStart(4, '0')}-${String(t.月).padStart(2, '0')}-${String(t.日).padStart(2, '0')}`
    : null;
}

function definition(task: Quest) {
  const { 进度, 进展说明, 完成依据事件id, ...fixed } = task;
  return JSON.stringify(fixed);
}

function eventStamp(event: State['事件'][string]) {
  const text = JSON.stringify([event.事实, event.参与者, event.关联记录id]);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}

export function questReward(task: Quest) {
  if (task.难度 === '稀有') return 90;
  if (task.难度 === '进阶') return 45;
  return task.类型 === '日常' ? 15 : task.类型 === '成长' ? 30 : 25;
}

export function completedQuests(state: State) {
  return Object.values(state.奇遇系统._任务记录).filter(t => t.状态 === '已领取').length;
}

export function questIssue(state: State, id: string): string {
  const system = state.奇遇系统,
    task = system.任务[id],
    record = system._任务记录[id];
  if (!system._启用) return '请先开启奇遇系统';
  if (!task) return '任务已不存在';
  if (!record || record.状态 !== '进行中') return '任务未接取或已经结束';
  if (task.进度 < 100) return '目标尚未完成';
  if (task.有效日 && storyDay(state) && task.有效日 !== storyDay(state)) return '该日常任务已经过期';
  if (definition(task) !== record.定义快照) return '已接取任务的目标或奖励档位发生变化';
  const proof = task.完成依据事件id;
  if (
    !proof.length ||
    proof.some(eventId => {
      const event = state.事件[eventId];
      return (
        !event?.事实?.trim() ||
        !state.玩家.id ||
        !Object.hasOwn(event.参与者, state.玩家.id) ||
        record.接取时事件摘要[eventId] === eventStamp(event)
      );
    })
  )
    return '需要接取之后发生、与玩家有关的任务完成事件';
  return '';
}

export function shopIssue(state: State, good: SystemGood): string {
  const system = state.奇遇系统;
  if (!system._启用) return '请先开启奇遇系统';
  if (good.rare && completedQuests(state) < 5) return '完成并领取 5 项任务后解锁';
  if (good.limit !== undefined && (system._商店已购[good.id] ?? 0) >= good.limit) return '已达到本存档购买上限';
  if (system._系统币 < good.price) return '蓝色精粹不足';
  return '';
}

function changeCoins(
  state: State,
  amount: number,
  id: string,
  type: State['奇遇系统']['_流水'][string]['类型'],
  description: string,
  related: string | null,
) {
  const system = state.奇遇系统;
  if (system._流水[id]) throw Error('本次结算已经记录');
  const balance = system._系统币 + amount;
  if (!Number.isSafeInteger(balance) || balance < 0) throw Error('蓝色精粹数额无效');
  system._系统币 = balance;
  system._流水[id] = { 类型: type, 数额: amount, 说明: description, 关联id: related };
}

/** Called only by the state writer after a successful candidate, never by Schema parsing/rendering. */
export function refreshNovelSystem(state: State): State {
  const system = state.奇遇系统;
  if (!system._启用) return state;
  const day = storyDay(state);
  const key = day ?? '未定日';
  if (system._刷新日期 === key) return state;
  const templates = [
    {
      key: 'meal',
      name: '认真吃一顿',
      type: '日常',
      goal: '接取后，自主选择并实际享用一顿合适的饭食，记录一个具体的味道或用餐感受。',
    },
    {
      key: 'walk',
      name: '换一条路看看',
      type: '日常',
      goal: '接取后，完成一次合理可达的日常散步，实际观察并记录一处此前没有注意到的街景细节。',
    },
    {
      key: 'talk',
      name: '一段真诚交流',
      type: '社交',
      goal: '接取后，与一位愿意交流的人完成一次有具体内容的自然交谈。不要求提高好感，不强迫对方回应。',
    },
  ] as const;
  for (const template of templates) {
    const id = `cw_daily_${key}_${template.key}`;
    // Returning to a date or reloading cannot reset an already recorded task.
    if (system.任务[id] || system._任务记录[id]) continue;
    system.任务[id] = {
      名称: template.name,
      类型: template.type,
      难度: '基础',
      目标: template.goal,
      有效日: day,
      进度: 0,
      进展说明: null,
      完成依据事件id: [],
    };
  }
  system._刷新日期 = key;
  return state;
}

export function applyNovelAction(state: State, action: NovelAction): State {
  if (!state._系统.建档完成 || !state.玩家.id) throw Error('请先完成玩家建档');
  if (!action.operationId?.trim()) throw Error('操作缺少结算标识');
  const system = state.奇遇系统;
  if (system._流水[`buy:${action.operationId}`]) return state;
  if (action.kind === 'enable') {
    if (system._启用) return state;
    changeCoins(state, 30, 'welcome', '启用赠礼', '奇遇系统初次开启赠礼', null);
    system._启用 = true;
    return refreshNovelSystem(state);
  }
  if (!system._启用) throw Error('请先开启奇遇系统');
  const id = action.id;
  if (!id) throw Error('请选择任务或商品');
  if (action.kind === 'buy') {
    const good = systemGoods(state).find(g => g.id === id);
    if (!good) throw Error('商品不存在');
    const issue = shopIssue(state, good);
    if (issue) throw Error(issue);
    const itemId = `cw_system_item_${good.id}`;
    const existing = state.玩家.物品栏[itemId];
    if (existing && (existing.名称 !== good.name || existing.数量 === null))
      throw Error('该系统物品记录不一致，请检查存档');
    const quantity = (existing?.数量 ?? 0) + 1;
    if (!Number.isSafeInteger(quantity)) throw Error('物品数量无效');
    changeCoins(state, -good.price, `buy:${action.operationId}`, '商店购买', `购买 ${good.name}`, good.id);
    system._商店已购[good.id] = (system._商店已购[good.id] ?? 0) + 1;
    state.玩家.物品栏[itemId] = {
      ...existing,
      名称: good.name,
      类别: good.category,
      单位: good.id === 'encounter' ? '枚' : good.category === '消耗品' ? '份' : '件',
      描述: good.description,
      状态: '可用',
      数量: quantity,
      获得时间: state.世界.当前时间,
      关联事项id: existing?.关联事项id ?? [],
    } as State['玩家']['物品栏'][string];
    return state;
  }
  const task = system.任务[id];
  if (!task?.名称.trim() || !task.目标.trim()) throw Error('任务名称或目标不完整');
  const record = system._任务记录[id];
  if (action.kind === 'accept') {
    if (record) throw Error('该任务已经接取或结束');
    if (task.有效日 && storyDay(state) && task.有效日 !== storyDay(state)) throw Error('任务已经过期');
    if (Object.values(system._任务记录).filter(r => r.状态 === '进行中').length >= 5)
      throw Error('最多同时接取 5 项任务，请先完成或放弃已有任务');
    system._任务记录[id] = {
      状态: '进行中',
      定义快照: definition(task),
      接取时事件摘要: Object.fromEntries(
        // An event without player participation cannot be old completion evidence.
        Object.entries(state.事件)
          .filter(([, event]) => Object.hasOwn(event.参与者, state.玩家.id!))
          .map(([eventId, event]) => [eventId, eventStamp(event)]),
      ),
    };
    task.进度 = 0;
    task.进展说明 = null;
    task.完成依据事件id = [];
  } else if (action.kind === 'abandon') {
    if (!record || record.状态 !== '进行中') throw Error('该任务没有进行中');
    record.状态 = '已放弃';
  } else if (action.kind === 'claim') {
    if (record?.状态 === '已领取' && system._流水[`reward:${id}`]) return state;
    const issue = questIssue(state, id);
    if (issue) throw Error(issue);
    changeCoins(state, questReward(task), `reward:${id}`, '任务奖励', `完成 ${task.名称}`, id);
    record.状态 = '已领取';
  } else throw Error('未知的奇遇系统操作');
  // Release the comparison cache only during an explicit, atomic end action.
  // Actual events, completion IDs, task definitions, ledger and old saved states are untouched.
  // Schema parsing never sweeps legacy records or changes their recovery fingerprint.
  if (record && record.状态 !== '进行中') record.接取时事件摘要 = {};
  return state;
}

/** Public task progress may be authored by the worker; accepted definitions and system items cannot be forged. */
export function assertNovelModel(before: State, after: State) {
  const old = before.奇遇系统,
    next = after.奇遇系统;
  if (!old._启用 && !_.isEqual(old.任务, next.任务)) throw Error('奇遇系统尚未开启，不能生成或结算任务');
  for (const [id, record] of Object.entries(old._任务记录)) {
    if (!next.任务[id] || definition(next.任务[id]) !== record.定义快照)
      throw Error('模型不能改写或删除已接取任务：' + id);
    if (record.状态 !== '进行中' && !_.isEqual(old.任务[id], next.任务[id]))
      throw Error('已结束任务不可重新结算：' + id);
  }
  let available = 0;
  for (const [id, task] of Object.entries(next.任务)) {
    if (old._任务记录[id]) continue;
    if (task.进度 || task.完成依据事件id.length) throw Error('未接取任务不能提前完成：' + id);
    if (!old.任务[id] && (id.startsWith('cw_daily_') || task.类型 === '日常'))
      throw Error('固定日常任务由程序按故事日期发布');
    // An untouched legacy placeholder is stored history, not a new model update.
    // Still validate any edit to it, and keep it in the existing availability count.
    if ((!task.名称.trim() || !task.目标.trim()) && !_.isEqual(old.任务[id], task))
      throw Error('任务名称与目标不能为空');
    if (!task.有效日 || !storyDay(after) || task.有效日 === storyDay(after)) {
      available++;
    }
  }
  if (available > 8) throw Error('可接取任务最多 8 项');
  for (const [id, item] of Object.entries(after.玩家.物品栏)) {
    if (!id.startsWith('cw_system_item_')) continue;
    const previous = before.玩家.物品栏[id];
    if (
      !previous ||
      (item.数量 ?? 0) > (previous.数量 ?? 0) ||
      item.数量 === null ||
      item.名称 !== previous.名称 ||
      item.类别 !== previous.类别 ||
      item.描述 !== previous.描述
    )
      throw Error('系统商品只能由实际购买增加，不得改写效果：' + id);
  }
}

export function novelPrompt(state: State, worker: boolean) {
  if (!state.奇遇系统._启用) return '玩家尚未开启奇遇系统，正文不触发系统提示，任务保持为空。';
  return (
    (worker
      ? '奇遇系统已开启。仅依据本次实际正文或手机行为推进已接取任务的进度和进展说明；完成时填写接取之后新发生、参与者含玩家且事实明确的完成依据事件id。不得提前完成待接取任务，不改动已接取任务定义，不重结已结束任务。可按当前故事提供探索、社交、成长或奇遇任务（新任务进度0、依据空）；日常由程序按故事日期发布，可接取最多8项。全部下划线字段由程序维护，不能发币、扣币、代领、代买或生成系统商品。'
      : '玩家专属奇遇系统已开启，提供符合世界设定的可选任务与商品。接取、放弃、领奖、购买由玩家主动操作，不能替玩家选择；任务只是可选引导，不强推剧情。系统物品按各自描述的使用方式、效果、消耗和持续时间结算，耐用品与长期生效物品不统一视为一次性消耗品。人物不自动知道系统，城市社会与生活遵循瓦洛兰的瓦罗兰背景，普通日常与里世界按各自知情和权限边界并行。') +
    ' 蓝色精粹独立于金币，不互兑。商品目录与结算由程序维护；已购买物品的实际效果以玩家物品栏中的描述为准。'
  );
}
