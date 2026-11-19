export type ScheduledInfo = { key: string; label: string; kind: string; background: boolean };
type Job = ScheduledInfo & {
  run: () => Promise<any>;
  promise: Promise<any>;
  resolve: (value: any) => void;
  reject: (e: unknown) => void;
};

/** One request/transaction at a time. Players retain FIFO order and precede waiting background jobs. */
export class RequestScheduler {
  private jobs: Job[] = [];
  private current?: Job;
  private closed = false;
  private scheduled = false;
  constructor(private changed: (active: ScheduledInfo | undefined, waiting: ScheduledInfo[]) => void) {}
  get(key: string) {
    return [this.current, ...this.jobs].find(j => j?.key === key)?.promise;
  }
  get active() {
    return this.current;
  }
  get waiting() {
    return this.jobs.length;
  }
  private notify() {
    this.changed(
      this.current,
      this.jobs.map(({ key, label, kind, background }) => ({ key, label, kind, background })),
    );
  }
  run<T>(info: ScheduledInfo, run: () => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(Error('运行服务已卸载，请重新打开'));
    const existing = this.get(info.key);
    if (existing) return existing;
    let resolve!: (v: T) => void, reject!: (e: unknown) => void;
    const promise = new Promise<T>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    this.jobs.push({ ...info, run, promise, resolve, reject });
    this.notify();
    this.schedule();
    return promise;
  }
  cancel(key: string, reason = '操作已取消，尚未发送') {
    const index = this.jobs.findIndex(j => j.key === key);
    if (index < 0) return false;
    this.jobs.splice(index, 1)[0].reject(Error(reason));
    this.notify();
    return true;
  }
  cancelWaiting(reason: string) {
    const jobs = this.jobs.splice(0);
    for (const job of jobs) job.reject(Error(reason));
    this.notify();
  }
  close() {
    this.closed = true;
    this.cancelWaiting('运行服务已卸载，待发送操作保留供手动恢复');
  }
  private schedule() {
    if (this.scheduled || this.current || this.closed || !this.jobs.length) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      void this.drain();
    });
  }
  private async drain() {
    if (this.current || this.closed || !this.jobs.length) return;
    const player = this.jobs.findIndex(j => !j.background);
    const job = this.jobs.splice(player < 0 ? 0 : player, 1)[0];
    this.current = job;
    this.notify();
    try {
      job.resolve(await job.run());
    } catch (e) {
      this.cancelWaiting('前一操作未完成，待发送操作保留供手动恢复');
      job.reject(e);
    } finally {
      this.current = undefined;
      this.notify();
      this.schedule();
    }
  }
}
