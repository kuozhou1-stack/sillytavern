import { equal, type State } from './core';
export type UseIntent = { itemId: string; amount: number };
export function validateUse(before: State, after: State, intent?: UseIntent) {
  if (!intent) return after;
  const old = before.玩家.物品栏[intent.itemId],
    next = after.玩家.物品栏[intent.itemId];
  if (!old) throw Error('使用目标已不存在');
  if (old.类别 === '消耗品' && old.数量 !== null) {
    const remaining = next?.数量 ?? (next ? null : 0);
    if (remaining !== null && remaining < old.数量) {
      if (Math.abs(old.数量 - remaining - intent.amount) > 1e-9) throw Error('消耗数量与本次明确用量不一致');
      if (
        !Object.entries(after.事件).some(
          ([id, event]) =>
            event.关联记录id.includes(intent.itemId) && !!event.事实?.trim() && !equal(event, before.事件[id]),
        )
      )
        throw Error('物品消耗缺少关联本物品的新增或更新事件记录');
    }
  }
  return after;
}
/** Verify accounting consistency; consumption/recovery amounts remain narrative decisions. */
export function validateSettlement(before: State, after: State) {
  for (const [id, old] of Object.entries(before.玩家.资金.交易)) {
    if (old.状态 !== '已完成') continue;
    const next = after.玩家.资金.交易[id];
    if (!next || next.状态 !== '已完成' || next.类型 !== old.类型 || next.金额分 !== old.金额分)
      throw Error('已完成交易不能删除、回退或改写收支；退款应另记交易：' + id);
  }
  let delta = 0;
  for (const [id, tx] of Object.entries(after.玩家.资金.交易)) {
    const old = before.玩家.资金.交易[id];
    if (tx.状态 !== '已完成' || old?.状态 === '已完成') continue;
    if (!tx.事件id || !after.事件[tx.事件id]) throw Error('结算缺少对应事件：' + id);
    if (tx.金额分 === null) throw Error('金额未知的交易不能确认为已完成');
    if (tx.类型 === '内部转账') throw Error('单一金币余额不再建立内部转账');
    delta += tx.类型 === '支出' ? -tx.金额分 : tx.金额分;
  }
  const oldBalance = before.玩家.资金.余额分;
  if (oldBalance !== null && after.玩家.资金.余额分 !== oldBalance + delta) throw Error('金币余额与交易未一致结算');
  return after;
}
