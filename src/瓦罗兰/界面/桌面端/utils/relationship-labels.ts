type RelationValue = number | null | undefined;

// 与世界书「好感与信任」保持一致；好感不代替信任，数值也不授予关系或同意。
export function favorLabel(value: RelationValue): string {
  if (value == null || !Number.isFinite(value)) return '未知';
  if (value <= -60) return '强烈排斥';
  if (value <= -20) return '明显反感';
  if (value < 20) return '中立或轻微倾向';
  if (value < 50) return '愿意亲近';
  if (value < 80) return '明显偏爱';
  return '深厚情感或高度欣赏';
}

export function trustLabel(value: RelationValue): string {
  if (value == null || !Number.isFinite(value)) return '未知';
  if (value < 0) return '不同程度的不信任';
  if (value === 0) return '尚无明确倾向';
  if (value <= 15) return '有少量正面依据';
  if (value <= 35) return '认可常规事务上的可靠性';
  if (value <= 60) return '愿意在有依据的领域分享或托付';
  if (value <= 85) return '可承担较重要的共同事务';
  return '高度信赖';
}

function formatValue(value: RelationValue): string {
  if (value == null || !Number.isFinite(value)) return '未知';
  return value > 0 ? `+${value}` : String(value);
}

export function favorDescription(value: RelationValue): string {
  return `好感度 ${formatValue(value)} · ${favorLabel(value)}\n范围 −100～+100，未知与 0 不同。\n表示欣赏、亲近与相处意愿，可体现友情、亲情、欣赏或爱情；不自动变成恋爱，也不代替信任或当下同意。`;
}

export function trustDescription(value: RelationValue): string {
  return `信任度 ${formatValue(value)} · ${trustLabel(value)}\n范围 −100～+100，0 表示尚无明确倾向。\n表示对可靠性的判断及愿意托付的范围；托付范围取决于经历，不等于所有秘密都能问或所有事情都可托付。`;
}

export const emotionalTriggerLabel = '相处触动点';
export const emotionalTriggerDescription = '相处中容易触动情绪的事情，不表示战斗弱点，也不保证对方顺从；是否被触动及如何回应依人物、场合与实际经历而定。';

export const relationPositionDescription = '当前档案角色如何看待对方在自己生活中的角色，可能与公开称呼不同。';
export const relationBoundaryDescription = '当前档案角色对对方愿意交流或接近的范围，不是即时情绪或战斗戒备。';
export const knownSecretsDescription = '记录关系对象已知的当前档案角色私密；不代表获准接近、可以公开传播或已得到信任。';

const privateLifeStages = [
  ['未记录私人交集', '未记录对方进入私人生活的进展，不代表陌生或失忆。'],
  ['日常往来', '已有日常交集，还不能据此了解私生活。'],
  ['察觉差异', '对方察觉公开表现与私人一面的差异，仍可能只是推测。'],
  ['确认私密', '对方已有依据确认私密事实，不等于受邀进入私人生活。'],
  ['自愿分享', '当前档案角色主动选择向对方分享私人经历，或接受有限协助。'],
  ['稳定接纳', '当前档案角色持续且自愿地让对方参与部分私人生活。'],
] as const;

function privateLifeStage(value: RelationValue) {
  return value != null && Number.isInteger(value) && value >= 0 && value < privateLifeStages.length
    ? privateLifeStages[value]
    : undefined;
}

export function privateLifeStageLabel(value: RelationValue): string {
  if (value == null) return '未知';
  const stage = privateLifeStage(value);
  return stage ? `${value} 阶 · ${stage[0]}` : '待确认';
}

export function privateLifeStageDescription(value: RelationValue): string {
  const stage = privateLifeStage(value);
  const meaning = value == null ? '尚未确认私人交集进展。' : stage?.[1] ?? '旧值不在0～5阶内，需要核对，不推断更高阶段';
  return `破壁阶段记录对方进入当前档案角色私人生活的已有进展。\n${meaning}\n窥见秘密不自动增加信任；自愿分享与接纳可以收回，已经知道的事实保留。阶段不自动授予恋爱、同意、臣服或特权。`;
}
