import toast from 'react-hot-toast';

/** Unified creator toast helper. */
export function creatorToast(
  message: string,
  type: 'success' | 'error' | 'info' = 'success',
) {
  if (type === 'success') toast.success(message);
  else if (type === 'error') toast.error(message);
  else toast(message);
}

export type CreatorToastFn = (
  message: string,
  type: 'success' | 'error' | 'info',
) => void;
