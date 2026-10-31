import type { State } from './core';
import { updateBlock } from './message-protocol';
import { publicModelFields } from './model-fields';

type Task = State['_系统']['任务'][string];
const ReceiptSchema = z.strictObject({
  结果: z.enum(['已更新', '无变化']),
  依据: z.string().trim().min(1),
});
type Receipt = z.infer<typeof ReceiptSchema>;
export type LifeCheckReport = {
  receipts: Map<string, Receipt>;
  errors: Map<string, string>;
  error?: string;
};

export function requiresLifeCheck(task: Task) {
  return ['生活更新', '自然融入', '升格'].includes(task.类别);
}

/** Output-protocol evidence; never a character field, and hidden by normal protocol filtering. */
export function lifeCheckPrompt() {
  return '生活检查完成凭据：在本次唯一 UpdateVariable 块内，与 JSONPatch 同级附一个 <LifeCheck>{"人物id":{"结果":"已更新","依据":"本区间的实际变化或保持理由"}}</LifeCheck>。逐人覆盖上述生活更新、自然融入、升格目标，结果只用“已更新”或“无变化”，依据写简短一句。角色非下划线业务字段确有变化用已更新；确无变化也须说明理由。只改内部计数不算更新。不为交回执编造经历、凑记录或改变数值；普通吃喝不要求新增经历。回执不放进 JSONPatch，不写存档字段，建档和摘要无需回执。';
}

export function readLifeChecks(rawText?: string): LifeCheckReport {
  const report: LifeCheckReport = { receipts: new Map(), errors: new Map() };
  try {
    if (!rawText) throw Error('缺少生活检查回执');
    // Reuse the actual MVU protocol boundary, including its unique-block requirement.
    const body = updateBlock(rawText).block
      .replace(/^<UpdateVariable\b[^>]*>/i, '')
      .replace(/<\/UpdateVariable\s*>$/i, '');
    // Only sibling protocol sections count. Quoted tags in JSONPatch/Analysis are data.
    const sections = [...body.matchAll(/<(Analysis|JSONPatch|LifeCheck)>([\s\S]*?)<\/\1>/gi)];
    if (body.replace(/<(Analysis|JSONPatch|LifeCheck)>([\s\S]*?)<\/\1>/gi, '').trim())
      throw Error('生活检查回执须与 JSONPatch 同级');
    const receipts = sections.filter(section => section[1].toLowerCase() === 'lifecheck');
    if (receipts.length !== 1) throw Error('需要且只能包含一个 LifeCheck 回执');
    const value: unknown = JSON.parse(receipts[0][2]);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('LifeCheck 须按人物id保存对象');
    for (const [id, entry] of Object.entries(value)) {
      const parsed = ReceiptSchema.safeParse(entry);
      if (parsed.success) report.receipts.set(id, parsed.data);
      else report.errors.set(id, '结果须为已更新或无变化，并附非空依据');
    }
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
  }
  return report;
}

export function assertLifeCheckTargets(before: State, after: State, task: Task, report?: LifeCheckReport) {
  if (!requiresLifeCheck(task)) return;
  if (!report || report.error) throw Error(report?.error ?? '缺少生活检查回执');
  const problems: string[] = [];
  for (const id of task.目标id) {
    const receipt = report.receipts.get(id);
    const error = report.errors.get(id);
    if (error || !receipt) {
      problems.push(`${id}：${error ?? '缺少回执'}`);
      continue;
    }
    if (!before.角色[id] || !after.角色[id]) {
      problems.push(`${id}：人物已替换或删除`);
      continue;
    }
    const changed = !_.isEqual(publicModelFields(before.角色[id], ['角色', id]), publicModelFields(after.角色[id], ['角色', id]));
    if (receipt.结果 === '已更新' && !changed) problems.push(`${id}：声称已更新但人物非下划线业务字段没有变化`);
    if (receipt.结果 === '无变化' && changed) problems.push(`${id}：声称无变化但人物非下划线业务字段已变化`);
  }
  if (problems.length) throw Error('生活检查未完成：' + problems.join('；'));
}
