/** Presentation only: global write locks stay independent of which surface shows progress. */
export function taskPresentation(view: {
  operation: string;
  phase?: string;
  busy: boolean;
  updating: boolean;
  error: string;
  canResend?: boolean;
  recoverable: { kind: string }[];
  messages: { isUpdatePending?: boolean }[];
  queued?: { kind: string }[];
}) {
  const recoveringPhone =
    view.operation === 'recovery' &&
    view.recoverable.some(i => i.kind === 'phone') &&
    !view.messages.some(m => m.isUpdatePending);
  const phone = view.operation === 'phone' || recoveringPhone;
  const novel = view.operation === 'novel' || (view.operation === 'recovery' &&
    view.recoverable.some(item => item.kind === 'novel') && !view.messages.some(message => message.isUpdatePending));
  const generating = view.busy && !phone && !novel && view.operation !== 'background';
  const updating =
    view.updating &&
    !phone && !novel &&
    (view.operation === 'story' || view.operation === 'recovery' || view.messages.some(m => m.isUpdatePending));
  const acting =
    ['local', 'recovery', 'novel'].includes(view.operation) ||
    !!view.queued?.some(item => ['local', 'recovery', 'novel'].includes(item.kind));
  const locked = view.busy || view.updating || acting || (!!view.error && !view.canResend);
  const stoppable =
    view.busy ||
    view.operation === 'background' ||
    view.operation === 'novel' ||
    (view.updating && ['story', 'recovery', 'phone'].includes(view.operation)) ||
    !!view.queued?.some(item => ['story', 'recovery', 'phone', 'novel'].includes(item.kind));
  const phases: Record<string, string> = {
    preparing: '准备本轮资料', information: '选择地点与组织资料', story: '生成正文',
    'story-save': '保存正文', variables: '结算变量', validating: '校验生成结果',
    saving: '保存并确认结果', novel: '生成奇遇内容',
  };
  const phase = view.phase && phases[view.phase];
  const hint = phase && (view.busy || view.updating || view.operation || view.error)
    ? `${phone ? '手机 · ' : ''}${phase}${view.error ? '未完成' : '…'}`
    :
    novel ? '奇遇内容刷新中…' : phone && (view.busy || view.updating)
      ? '手机处理中…'
      : view.updating && !updating
        ? '正在保存…'
        : acting && !generating && !updating
          ? '正在处理…'
          : '';
  return { generating, updating, locked, hint, acting, stoppable };
}
