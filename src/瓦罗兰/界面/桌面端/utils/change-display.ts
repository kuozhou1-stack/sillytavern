import type { VariableChange } from '../../../运行/variable-changes';

const timeParts = ['年', '月', '日', '时', '分'] as const;
type TimePart = (typeof timeParts)[number];
type ClockRows = Partial<Record<TimePart, VariableChange>>;

function clockText(rows: ClockRows, side: 'before' | 'after') {
  const changed = timeParts.filter(part => rows[part]);
  const first = rows[changed[0]]![side];
  if (!/^\d+$/.test(first) && changed.every(part => rows[part]![side] === first)) return first;

  const partText = (part: TimePart) => {
    const value = rows[part]?.[side];
    return value === undefined ? '' : /^\d+$/.test(value) ? value + part : `${part}（${value}）`;
  };
  const date = timeParts.slice(0, 3).map(partText).join('');
  const hour = rows.时?.[side], minute = rows.分?.[side];
  const time = hour !== undefined && minute !== undefined && /^\d+$/.test(hour) && /^\d+$/.test(minute)
    ? `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}` : partText('时') + partText('分');
  return [date, time].filter(Boolean).join(' ');
}

/** 旧结算只保存变化的叶字段。按完整父路径合并，同名人物记录和未变化的日期部分各自保留原意。 */
export function compactChangeRows(rows: VariableChange[]): VariableChange[] {
  const clocks = new Map<string, ClockRows>();
  const ordered: VariableChange[] = [];
  for (const row of rows) {
    const match = /^(.*\/(?:[^/]*时间|原时间锚点))\/([年月日时分])$/.exec(row.path);
    if (!match) {
      ordered.push(row);
      continue;
    }
    const [, path, part] = match;
    let clock = clocks.get(path);
    if (!clock) {
      clock = {};
      clocks.set(path, clock);
      ordered.push({ ...row, path, label: row.label.split(' · ').slice(0, -1).join(' · '), delta: '' });
    }
    clock[part as TimePart] = row;
  }
  return ordered.map(row => {
    const clock = clocks.get(row.path);
    return clock ? { ...row, before: clockText(clock, 'before'), after: clockText(clock, 'after') } : row;
  });
}
