export const atmosphereRule = '以下是玩家当前的氛围设计，作为持续的创作方向。' +
  '结合这份偏好安排正文基调、角色互动方式、关系发展节奏和事件倾向；' +
  '在地点与组织资料选择、当前程序调度人物的自主生活、经历接续、相关变量更新，以及奇遇任务和商品创作中自然体现。' +
  '承接既有剧情和本轮事实；创作偏好不表示某项行动已经发生，按本次通道的职责与输出协议作答。';

export const atmosphereEntryName = '规则｜氛围设计';

/** 旧同步器写入的完整来源包装；同名不足以证明条目属于迁移。 */
export function isLegacyAtmosphereEntry(entry: Pick<WorldbookEntry, 'uid' | 'name' | 'content' | 'position' | 'strategy'>) {
  if (entry.name !== atmosphereEntryName) return false;
  const generated = entry.content.startsWith(`${atmosphereRule}\n<atmosphere_design>\n`) &&
    entry.content.endsWith('\n</atmosphere_design>');
  const originalSlot = entry.uid === 52 && entry.content.replace(/\r/g, '').trim() === '<atmosphere_design>\n</atmosphere_design>' &&
    entry.position.type === 'at_depth' && entry.position.role === 'system' && entry.position.depth === 4 &&
    entry.position.order === 340 && entry.strategy.type === 'constant';
  return generated || originalSlot;
}

/** Per-request input; Tavern places it inside the preset's native chat-history region. */
export function atmospherePrompt(value: string): Omit<InjectionPrompt, 'id'> | null {
  return value.trim() ? { role: 'system', position: 'in_chat', depth: 4,
    content: `${atmosphereRule}\n<atmosphere_design>\n${value}\n</atmosphere_design>` } : null;
}

/** Retire the previous duplicate source; the saved preference remains unchanged. */
export async function removeLegacyAtmosphereWorldbook(check: () => void) {
  const book = getCharWorldbookNames('current').primary;
  if (!book) return;
  const entries = await getWorldbook(book);
  check();
  if (!entries.some(isLegacyAtmosphereEntry)) return;
  await updateWorldbookWith(book, current => {
    check();
    return current.filter(entry => !isLegacyAtmosphereEntry(entry));
  }, { render: 'immediate' });
  check();
  const updated = (await getWorldbook(book)).filter(isLegacyAtmosphereEntry);
  check();
  if (updated.length) throw Error('旧氛围设计世界书条目移除读回不一致');
}
