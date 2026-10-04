import type { TFunction } from 'i18next';
import toast from 'react-hot-toast';

const ACTION_LIMIT_REACHED = 'ACTION_LIMIT_REACHED';
const KNOWN_ACTIONS = ['follow', 'message_request', 'comment'];

interface ActionLimitBody {
  errorCode?: string;
  details?: { action?: string; retryAt?: string };
}

// When the server refuses a follow, message request or comment because a
// per-profile cap was reached, tells the participant which action and when
// they can try again. Returns true when the error was such a refusal.
export function notifyActionLimit(
  status: number | undefined,
  body: unknown,
  t: TFunction,
): boolean {
  const data = body as ActionLimitBody | undefined;
  if (status !== 429 || data?.errorCode !== ACTION_LIMIT_REACHED) return false;

  const action = KNOWN_ACTIONS.includes(data.details?.action ?? '')
    ? data.details?.action
    : 'other';
  const retryAt = data.details?.retryAt ? new Date(data.details.retryAt) : null;
  const time =
    retryAt && !Number.isNaN(retryAt.getTime())
      ? retryAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';

  toast.error(t(`errors.action_limit.${action}`, { time }), {
    id: 'action-limit',
  });
  return true;
}
