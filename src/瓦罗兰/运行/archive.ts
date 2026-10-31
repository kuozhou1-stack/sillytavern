import { Schema } from '../schema';
import { uid, copy, equal, type State } from './core';
import { byNewest, postActivity } from './phone';
const dateKey = (t: any) => (t ? `${t.年}-${t.月}-${t.日}` : null);
export function planArchives(state: State): State {
  const s: any = state;
  const pending = new Set(
    Object.values(state._系统.任务)
      .filter(t => t.类别 === '摘要' && !['已提交', '取消', '失效'].includes(t.状态))
      .map(t => t.触发来源),
  );
  const add = (key: string, ids: string[], targets: string[]) => {
    if (!ids.length || pending.has(key)) return;
    pending.add(key);
    s._系统.任务[uid('archive')] = {
      类别: '摘要',
      触发来源: key,
      目标id: targets,
      覆盖记录id: ids,
      截止时间: s.世界.当前时间,
      状态: '排队',
      提交id: uid('archive_commit'),
    };
  };
  for (const [id, p] of Object.entries(s.角色) as any)
    if (p.层级 === '主要') {
      const recent = Object.keys(p.经历.最近经历);
      const current = s.世界.当前时间;
      // A life update may already have advanced its anchor; date the records themselves before archiving.
      const previousDayRecords = recent.filter(recordId => {
        const record = p.经历.最近经历[recordId];
        const date = record.日期精度 === '日' && record.日期说明?.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
        return (
          current &&
          date &&
          Number(date[1]) * 10000 + Number(date[2]) * 100 + Number(date[3]) <
            current.年 * 10000 + current.月 * 100 + current.日
        );
      });
      const crossed =
        p._更新循环.上次更新变量时间 && dateKey(p._更新循环.上次更新变量时间) !== dateKey(s.世界.当前时间);
      if (previousDayRecords.length) add('人物:' + id, previousDayRecords.slice(0, 10), [id]);
      else if (recent.length >= 10 || crossed) add('人物:' + id, recent.slice(0, 10), [id]);
      const fine = Object.keys(p.经历.生活摘要),
        stages = Object.keys(p.经历.阶段概述);
      if (fine.length > 7) add('人物细摘要:' + id, fine.slice(0, 2), [id]);
      if (stages.length > 4) add('人物阶段:' + id, stages.slice(0, 2), [id]);
    }
  const streams = [
    ...Object.entries(s.手机.会话).map(([id, c]: any) => ({
      key: '会话:' + id,
      window: c._窗口,
      limit: c.类型 === '群聊' ? 30 : 20,
      batch: 10,
    })),
    ...Object.entries(s.手机._动态流).map(([id, w]: any) => ({
      key: '动态:' + id,
      window: w,
      limit: id === '朋友圈' ? 20 : 30,
      batch: id === '朋友圈' ? 5 : 10,
    })),
  ];
  for (const x of streams) {
    const dynamic = x.key.startsWith('动态:');
    x.window._近期id = x.window._近期id.filter((id: string) => (dynamic ? s.手机.原文.帖子[id] : s.手机.原文.消息[id]));
    x.window._近期id.sort((a: string, b: string) =>
      dynamic
        ? byNewest(postActivity(s, a), postActivity(s, b))
        : byNewest({ id: a, ...s.手机.原文.消息[a] }, { id: b, ...s.手机.原文.消息[b] }),
    );
    if (x.window._近期id.length > x.limit) {
      const oldest = x.window._近期id.slice(-x.batch);
      const comments = dynamic
        ? Object.entries(s.手机.原文.评论)
            .filter(([id, c]: any) => oldest.includes(c.帖子id) && !x.window._已归档覆盖id.includes(id))
            .map(([id]) => id)
        : [];
      add(x.key, [...oldest, ...comments], []);
    }
    if (x.window._细摘要id.length > 5) add('细摘要:' + x.key, x.window._细摘要id.slice(0, 2), []);
    if (x.window._阶段概述id.length > 3) add('阶段:' + x.key, x.window._阶段概述id.slice(0, 2), []);
  }
  return Schema.parse(s);
}
export function archiveSourceRecords(state: State, taskId: string) {
  const task = state._系统.任务[taskId], key = task.触发来源!;
  if (key.startsWith('人物')) {
    const id = task.目标id[0];
    const root = key.startsWith('人物细摘要:') ? '生活摘要' : key.startsWith('人物阶段:') ? '阶段概述' : '最近经历';
    return task.覆盖记录id.map(recordId => ({
      path: ['角色', id, '经历', root, recordId], value: (state.角色[id] as any).经历[root][recordId],
    }));
  }
  const root = key.startsWith('细摘要:') || key.startsWith('阶段:') ? '摘要' : key.startsWith('会话:') ? '消息' : '帖子';
  return task.覆盖记录id.map(id => {
    if (root === '摘要') return { path: ['手机', '摘要', id], value: state.手机.摘要[id] };
    const record = state.手机.原文[root][id];
    return record ? { path: ['手机', '原文', root, id], value: record }
      : { path: ['手机', '原文', '评论', id], value: state.手机.原文.评论[id] };
  });
}

export function archivePrompt(state: State, taskId: string) {
  const task = state._系统.任务[taskId],
    key = task.触发来源!;
  const person = key.startsWith('人物');
  let path: string, layer: string;
  if (person) {
    const id = task.目标id[0];
    const root = key.startsWith('人物细摘要:') ? '生活摘要' : key.startsWith('人物阶段:') ? '阶段概述' : '最近经历';
    layer = root === '最近经历' ? '生活摘要' : '阶段概述';
    path = '/角色/' + id + '/经历/' + layer;
  } else {
    const root =
      key.startsWith('细摘要:') || key.startsWith('阶段:') ? '摘要' : key.startsWith('会话:') ? '消息' : '帖子';
    layer = root === '摘要' ? '阶段概述' : '细摘要';
    path = '/手机/摘要';
  }
  const references = archiveSourceRecords(state, taskId).map(({ path }) => '/' + path.map(part => part.replaceAll('~', '~0').replaceAll('/', '~1')).join('/'));
  return `归档任务。只在 ${path} 新增一条 ${layer}；使用原日期区间与覆盖记录id ${JSON.stringify(task.覆盖记录id)}。原帖已覆盖的事实仅作上下文，旧帖新互动仅总结新增互动，不重复结算事件。原文和旧摘要由脚本迁移，你不得删除原文或修改下划线字段。会话细摘要目标150–300字，动态细摘要200–400字，阶段概述目标600字内，保护重要事实，不截断。源记录路径（从本次状态资料或共享补充读取全文）：${JSON.stringify(references)}`;
}
export function finalizeArchive(before: State, candidate: State, taskId: string, withInteraction = false): State {
  const task = before._系统.任务[taskId],
    key = task.触发来源!;
  const s: any = candidate;
  const unchanged = copy(candidate);
  if (key.startsWith('人物')) {
    const id = task.目标id[0],
      old: any = before.角色[id],
      p = s.角色[id];
    if (!old || !p || old._管理.版本 !== p._管理.版本) throw Error('归档目标版本变化');
    const source = key.startsWith('人物细摘要:') ? '生活摘要' : key.startsWith('人物阶段:') ? '阶段概述' : '最近经历';
    const target = source === '最近经历' ? '生活摘要' : '阶段概述';
    const added = Object.keys(p.经历[target]).filter(
      k => !old.经历[target][k] && task.覆盖记录id.every(id => p.经历[target][k].覆盖记录id.includes(id)),
    );
    if (added.length !== 1 || !p.经历[target][added[0]].经历?.trim()) throw Error('归档候选没有完整摘要');
    const summary = p.经历[target][added[0]];
    if (!task.覆盖记录id.every(id => summary.覆盖记录id.includes(id))) throw Error('摘要未覆盖本批全部记录');
    delete (unchanged.角色[id] as any).经历[target][added[0]];
    if (!withInteraction && !equal(unchanged, before)) throw Error('摘要任务修改了归档范围之外的数据');
    for (const recordId of task.覆盖记录id)
      if (!equal(p.经历[source][recordId], old.经历[source][recordId]))
        throw Error('待归档经历已变化，保留原文等待下次归档');
    for (const recordId of task.覆盖记录id) {
      if (source === '最近经历') p.经历._待归档经历[recordId] = old.经历[source][recordId];
      delete p.经历[source][recordId];
    }
  } else {
    const ids = Object.keys(s.手机.摘要).filter(
      id => !before.手机.摘要[id] && task.覆盖记录id.every(ref => s.手机.摘要[id].覆盖记录id.includes(ref)),
    );
    if (
      ids.length !== 1 ||
      !s.手机.摘要[ids[0]].内容?.trim() ||
      !task.覆盖记录id.every(id => s.手机.摘要[ids[0]].覆盖记录id.includes(id))
    )
      throw Error('手机摘要覆盖不完整');
    delete unchanged.手机.摘要[ids[0]];
    if (!withInteraction && !equal(unchanged, before)) throw Error('摘要任务修改了原文或其他数据');
    const target = key.replace(/^(细摘要|阶段):/, '');
    const window = target.startsWith('会话:') ? s.手机.会话[target.slice(3)]._窗口 : s.手机._动态流[target.slice(3)];
    const source = key.startsWith('细摘要:') ? '_细摘要id' : key.startsWith('阶段:') ? '_阶段概述id' : '_近期id';
    window[source] = window[source].filter((id: string) => !task.覆盖记录id.includes(id));
    window[source === '_近期id' ? '_细摘要id' : '_阶段概述id'].push(ids[0]);
    window._已归档覆盖id = [...new Set([...window._已归档覆盖id, ...task.覆盖记录id])];
    s.手机._归档批次[taskId] = {
      来源类型: target.split(':')[0],
      来源id: target.slice(3),
      覆盖消息id: target.startsWith('会话:') ? task.覆盖记录id : [],
      覆盖帖子id: target.startsWith('动态:') ? task.覆盖记录id : [],
      摘要id: ids[0],
      提交id: task.提交id,
    };
  }
  s._系统.任务[taskId].状态 = '已提交';
  return Schema.parse(s);
}
