import toast from 'react-hot-toast';

/** Unified admin toast helper — replaces dual ToastContainer / hot-toast usage. */
export function adminToast(
  message: string,
  type: 'success' | 'error' | 'info' = 'success',
) {
  if (type === 'success') toast.success(message);
  else if (type === 'error') toast.error(message);
  else toast(message);
}

export type AdminToastFn = (
  message: string,
  type: 'success' | 'error' | 'info',
) => void;
