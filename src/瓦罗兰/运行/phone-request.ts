import type { Context } from './core';
import type { PhoneAction } from './phone';

/** Safe routing facts only; drafts, model replies and storage envelopes stay inside Runtime. */
export type PhoneRequestIdentity = {
  readonly id: string;
  readonly kind: PhoneAction['kind'];
  readonly targetId: string | null;
  readonly platform: string;
  readonly chatId: string;
  readonly floor: number;
  readonly swipe: number;
};
export type PhoneRequestStatus = 'sending' | 'settling' | 'saving' | 'failed' | 'stopping';
export type PhoneRequestState = PhoneRequestIdentity & { status: PhoneRequestStatus };
export type PhoneActionResult = PhoneRequestIdentity & { readonly type: 'phone'; readonly status: 'confirmed' };

export function phoneRequestIdentity(id: string, action: PhoneAction, context: Context): PhoneRequestIdentity {
  return {
    id,
    kind: action.kind,
    targetId: action.kind === 'post' ? null : action.kind === 'invite' ? (action.groupId ?? null) : (action.id ?? null),
    platform: action.platform ?? '邻信',
    chatId: context.chat,
    floor: context.floor,
    swipe: context.swipe,
  };
}
