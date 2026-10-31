export const atmosphereRule = '以下是玩家当前的氛围设计，作为持续的创作方向。' +
  '结合这份偏好安排正文基调、角色互动方式、关系发展节奏和事件倾向；' +
  '在地点与组织资料选择、当前程序调度人物的自主生活、经历接续、相关变量更新，以及奇遇任务和商品创作中自然体现。' +
  '承接既有剧情和本轮事实；创作偏好不表示某项行动已经发生，按本次通道的职责与输出协议作答。';

/** Store the original text; only blank detection trims it. The request hook places it before the final task. */
export function atmospherePrompt(value: string): Omit<InjectionPrompt, 'id'> | null {
  return value.trim() ? { role: 'system', position: 'in_chat', depth: 0,
    content: `${atmosphereRule}\n<atmosphere_design>\n${value}\n</atmosphere_design>` } : null;
}
