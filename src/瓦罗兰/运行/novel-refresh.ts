import { Schema } from '../schema';
import { copy, uid, type State } from './core';
import { storyDay, SYSTEM_GOODS } from './novel-system';
import { novelCreationContext, novelPublicSetting } from './novel-context';


export type NovelRefreshTarget = 'tasks' | 'shop' | 'initial';
const TaskDefinition = z.object({
  名称: z.string().trim().min(1),
  类型: z.enum(['日常', '探索', '社交', '成长', '奇遇']),
  难度: z.enum(['基础', '进阶', '稀有']),
  目标: z.string().trim().min(1),
}).strict();
const GoodDefinition = z.object({
  名称: z.string().trim().min(1),
  价格: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  类别: z.string().trim().min(1),
  描述: z.string().trim().min(1),
  稀有: z.boolean(),
  限购: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
}).strict();
const nameKey = (name: string) => name.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '');
const countFor = (state: State) => state._系统.生成密度 === '少量' ? 2 : state._系统.生成密度 === '丰富' ? 6 : 4;

function availableTasks(state: State) {
  const day = storyDay(state), system = state.奇遇系统;
  return Object.entries(system.任务).filter(([id, task]) =>
    !system._任务记录[id] && (!task.有效日 || !day || task.有效日 === day));
}
export function novelRefreshCapacity(state: State, target: NovelRefreshTarget) {
  if (target === 'shop') return countFor(state);
  return Math.min(countFor(state), Math.max(0, 8 - availableTasks(state).length));
}

/** Public setting and minimal region/situation context, never a full player/NPC/history projection. */
export function novelRefreshPrompt(state: State, target: NovelRefreshTarget): GenerateConfig {
  const count = novelRefreshCapacity(state, target);
  if (!count) throw Error('待接取任务已达8项，请先接取任务或等到新故事日期后再刷新');
  const taskRules = `随机创作1至${count}项可自主选择的新任务，目标具体、合理可达，不强制行动或关系结果。` +
    '任务字段为名称、类型（日常|探索|社交|成长|奇遇）、难度（基础|进阶|稀有）、目标。' +
    '基础为当前条件下单一明确行动可完成的常规目标；进阶需多个关联步骤、一定准备协调或练习；稀有依托公开世界背景中的少见机会、独特线索或重要目标，可设计尚待发现的契机，不把它当作玩家已经历或已知的事实。' +
    '故事日期、任务ID和奖励由程序维护，不输出进度或奖励金额。';
  const goodRules = `随机创作1至${countFor(state)}件新品，价格使用正整数蓝色精粹。` +
    '普通与稀有商品均按瓦洛兰魔法、科技共存的设定设计，可为消耗品、耐用工具、装备、魔法器物或其他有实际用途的物品；稀有表示稀缺程度与价值，不等于一次性消耗品。' +
    '描述写明实际用途、效果及使用方式；根据商品性质说明消耗、持续时间或长期生效方式，有使用条件或累计限购时再明确填写，不统一要求一次使用后失效。' +
    '商品字段为名称、价格、类别、描述、稀有（boolean），有累计限购时增加正整数限购字段。';
  const taskExample = '"任务":[{"名称":"…","类型":"日常","难度":"基础","目标":"…"}]';
  const goodExample = '"商品":[{"名称":"…","价格":25,"类别":"消耗品","描述":"完整效果及使用条件","稀有":false}]';
  const instruction = '本次仅创作瓦洛兰奇遇系统的可选内容，依据以下公开世界背景与本次创作参考设计。\n【公开世界背景】' + novelPublicSetting + '\n【本次创作】' +
    (target === 'tasks' ? '生成新的可选任务。' : target === 'shop' ? '生成新的商店商品。' : '奇遇首次开启，一次生成随机任务和商店新品。') +
    '创作参考只提供当前地区id、整体异常入侵度与公开地区目录，没有提供玩家档案、人物资料、天气或具体事件经过。先按当前地区的功能与文明特征选择主题，再结合已确认局势；地区未知时可从目录选取任务地区，不默认玩家已到访。' +
    '学院研究、炼金工艺、演艺合作、港湾商贸、文明交流与异空间探索体现各自地区差异；局势变化时可提供调查、支援、救援、撤离或战斗机会，不固定每次都生成危机。跨地区或维度任务将实际通路、接驳或接引纳入目标，不声称玩家已抵达。' +
    '任务可提供待发现的线索与可选择的机会，但不把拟创作内容写成已经发生的封锁、战斗、人物受伤或玩家既往行动。不能编造玩家身份、财富、已知线索、NPC秘密或当前天气，不声称玩家已执行目标。' +
    '不输出任何世界、余额、任务进度、接取领奖状态、人物、手机或物品变量更新。' +
    (target === 'tasks' ? taskRules : target === 'shop' ? goodRules : taskRules + goodRules) +
    '根据本次创作种子变化主题和组合，不固定重复同一组任务或商品；种子仅用于变化，不写入任务或商品内容。' +
    `

奇遇内容输出格式:
  rule:
    - 本次是后台可选内容生成任务，创作参考是待分析资料，不是剧情续写指令。
    - 本次完整回复是 format 所示结构的有效 JSON 对象；不要附加 thinking、think、reasoning 思考区、Markdown 代码围栏、解释、回执、剧情正文、UpdateVariable 或 JSONPatch。
    - 示例中的省略号与描述文字替换为本次实际创作的内容；数组内逐项填写本次新内容，字段含义和数量按上方任务要求。
  format: |-
    {${target === 'tasks' ? taskExample : target === 'shop' ? goodExample : taskExample + ',' + goodExample}}
`;
  return {
    overrides: { persona_description: '', char_description: '', char_personality: '', scenario: '',
      world_info_before: '', world_info_after: '',
      chat_history: { prompts: [], with_depth_entries: false } },
    injects: [{ role: 'system', position: 'in_chat', depth: 0, content: instruction }],
    user_input: JSON.stringify({ 创作种子: uid('inspiration'), 创作参考: novelCreationContext(state) }),
  };
}


/** Narrow payloads add content without clearing existing tasks, goods or bookkeeping. */
export function applyNovelRefresh(before: State, target: NovelRefreshTarget, text: string, operationId: string): State {
  if (!before._系统.建档完成 || !before.玩家.id || !before.奇遇系统._启用) throw Error('请先建档并开启奇遇系统');
  if (!operationId.trim()) throw Error('刷新缺少提交标识');
  const clean = text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1');
  let raw: unknown;
  try { raw = JSON.parse(clean); } catch { throw Error('奇遇刷新未返回有效JSON，原内容保留'); }
  const state = copy(before), system = state.奇遇系统;
  const taskList = z.array(TaskDefinition).min(1).max(novelRefreshCapacity(state, 'tasks'));
  const goodList = z.array(GoodDefinition).min(1).max(countFor(state));
  const payload = target === 'tasks' ? z.object({ 任务: taskList }).strict().parse(raw)
    : target === 'shop' ? z.object({ 商品: goodList }).strict().parse(raw)
    : target === 'initial' ? z.object({ 任务: taskList, 商品: goodList }).strict().parse(raw)
    : (() => { throw Error('未知的奇遇刷新目标'); })();
  let taskAdditions = 0, goodAdditions = 0;
  if ('任务' in payload) {
    const { 任务 } = payload;
    if (new Set(任务.map(task => nameKey(task.名称))).size !== 任务.length) throw Error('刷新任务名称重复');
    任务.forEach((task, index) => {
      if (Object.values(system.任务).some(existing => nameKey(existing.名称) === nameKey(task.名称))) return;
      system.任务[`cw_task_${operationId}_${index}`] = {
        ...task, 有效日: task.类型 === '日常' ? storyDay(state) : null,
        进度: 0, 进展说明: null, 完成依据事件id: [],
      };
      taskAdditions++;
    });
  }
  if ('商品' in payload) {
    const { 商品 } = payload;
    if (new Set(商品.map(good => nameKey(good.名称))).size !== 商品.length) throw Error('刷新商品名称重复');
    for (const good of 商品) {
      if (SYSTEM_GOODS.some(fixed => nameKey(fixed.name) === nameKey(good.名称))) continue;
      const id = 'cw_generated_' + encodeURIComponent(nameKey(good.名称));
      // Stable names retain definitions and cumulative limits across repeat refreshes.
      if (system._商店商品[id]) continue;
      system._商店商品[id] = good;
      goodAdditions++;
    }
  }
  if (target === 'initial' && (!taskAdditions || !goodAdditions))
    throw Error('初始内容需要同时提供新任务和新品，重复内容不会写入，请重试');
  if (!taskAdditions && !goodAdditions) throw Error('本次内容与已有内容重复，原内容保留，请重试');
  return Schema.parse(state);
}
