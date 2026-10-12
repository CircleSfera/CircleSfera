import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { adminAuthApi } from '../../services/admin-auth.service';
import { apiErrorBody, apiErrorStatus } from '../../utils/apiErrorMessage';
import { Button } from '../ui';
import { Dialog } from '../ui/Dialog';

/** Whether the server asks the staff member to prove again who they are. */
export function isStepUpRequired(err: unknown): boolean {
  const body = apiErrorBody(err) as
    | { message?: string; code?: string; errorCode?: string }
    | undefined;
  return (
    apiErrorStatus(err) === 401 &&
    [body?.code, body?.errorCode, body?.message].includes(
      'ADMIN_STEP_UP_REQUIRED',
    )
  );
}

class StepUpCancelled extends Error {}

/** Whether the staff member closed the dialog instead of giving the code. */
export const isStepUpCancelled = (err: unknown) =>
  err instanceof StepUpCancelled;

interface Waiting {
  action: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

/**
 * Runs an action the server may protect with a second confirmation. When it
 * does, the dialog asks for the code of the authenticator and the action goes
 * on by itself: the caller waits for the same promise. Cancel rejects it with
 * an error that `isStepUpCancelled` tells apart, so nothing is reported.
 */
export function useAdminStepUp(): {
  run: <T>(action: () => Promise<T>) => Promise<T>;
  dialog: ReactNode;
} {
  const { t } = useTranslation();
  const fieldId = useId();
  const waiting = useRef<Waiting | null>(null);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [wrong, setWrong] = useState(false);
  // The dialog gives the focus to its first control, the close button: the
  // code field is what the staff member came for.
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => field.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  const close = () => {
    waiting.current = null;
    setOpen(false);
    setCode('');
    setWrong(false);
    setChecking(false);
  };

  const run = useCallback(<T,>(action: () => Promise<T>): Promise<T> => {
    return action().catch((err: unknown) => {
      if (!isStepUpRequired(err)) throw err;
      return new Promise<T>((resolve, reject) => {
        waiting.current = {
          action,
          resolve: resolve as (value: unknown) => void,
          reject,
        };
        setOpen(true);
      });
    });
  }, []);

  const cancel = () => {
    waiting.current?.reject(new StepUpCancelled());
    close();
  };

  const confirm = async () => {
    const pending = waiting.current;
    if (!pending || code.length < 6) return;
    setChecking(true);
    setWrong(false);
    try {
      await adminAuthApi.stepUp({ totpCode: code });
    } catch {
      // A wrong code stays in the dialog: the action is still waiting.
      setChecking(false);
      setWrong(true);
      setCode('');
      field.current?.focus();
      return;
    }
    close();
    pending.action().then(pending.resolve, pending.reject);
  };

  const dialog = (
    <Dialog
      isOpen={open}
      onClose={cancel}
      maxWidth="sm"
      title={t('admin.shared.step_up_title')}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void confirm();
        }}
      >
        <label htmlFor={fieldId} className="block text-sm text-white/70">
          {t('admin.operators.step_up_hint')}
        </label>
        <input
          ref={field}
          id={fieldId}
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
            setWrong(false);
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          maxLength={6}
          aria-invalid={wrong}
          aria-describedby={wrong ? `${fieldId}-wrong` : undefined}
          className="w-full min-h-12 rounded-xl border border-white/10 bg-white/5 px-4 text-center font-mono text-lg tracking-widest text-white focus:outline-none focus:border-brand-primary/60"
        />
        {wrong && (
          <p
            id={`${fieldId}-wrong`}
            role="alert"
            className="text-sm text-red-400"
          >
            {t('admin.operators.step_up_failed')}
          </p>
        )}
        <div className="flex flex-col gap-3">
          <Button
            type="submit"
            variant="primary"
            className="w-full min-h-11 font-semibold"
            disabled={code.length < 6 || checking}
            isLoading={checking}
          >
            {t('admin.operators.confirm')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full min-h-11 font-semibold bg-white/5 text-gray-300"
            disabled={checking}
            onClick={cancel}
          >
            {t('admin.shared.cancel')}
          </Button>
        </div>
      </form>
    </Dialog>
  );

  return { run, dialog };
}
