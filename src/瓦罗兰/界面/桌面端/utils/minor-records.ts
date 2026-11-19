const recordTitles: Record<string, string> = {
  npc_current_state: '当前近况',
  npc_online_habits: '网络往来',
  npc_history: '个人经历与今年生活',
  current_practice: '近期兴趣与实践',
};

/** 模板记录沿用 MVU 重要记录字典，保留稳定键；界面用标题与正文展示。 */
export function minorRecordSections(character: any) {
  return Object.entries(character?.重要记录 ?? {}).flatMap(([id, record]: [string, any]) => {
    const text = record?.内容;
    if (typeof text !== 'string' || !text.trim()) return [];
    return [{ id, title: recordTitles[id] ?? text.split('\n')[0].slice(0, 36), text,
      eventId: record.事件id, covenantId: record.约定id }];
  });
}
