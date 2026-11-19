export class CandidateIdentityError extends Error {}

/** Initial floor snapshots may be uncommitted; later snapshots must belong to the selected candidate. */
export function isCommittedCandidate(data: any, floor: number, swipe: number): boolean {
  if (!data || typeof data !== 'object') return false;
  const system = data._系统;
  if (floor === 0 && system?.楼层id == null && system?.候选回复id == null) return true;
  return system?.楼层id === floor && String(system.候选回复id) === String(swipe);
}
