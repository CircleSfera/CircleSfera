import { STAFF_PASSWORD_MIN_LENGTH } from '@circlesfera/shared';
import { KeyRound } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { adminAuthApi } from '../../services/admin-auth.service';
import { useAdminAuthStore } from '../../stores/adminAuthStore';
import { apiErrorMessage, apiErrorStatus } from '../../utils/apiErrorMessage';
import { Button } from '../ui';
import { Dialog } from '../ui/Dialog';

const fieldClass =
  'w-full min-h-12 rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white focus:outline-none focus:border-brand-primary/60';
const labelClass = 'block text-xs font-semibold text-white/60 mb-1 px-1';

/**
 * Sets the staff password of the identity signed in, or changes it. One that
 * still signs in the old way (with its CircleSfera account's password) gives
 * that password as the current one; from then on only the new one works
 * here. A member of staff also gives a code of the authenticator.
 */
export function StaffPasswordDialog({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const admin = useAdminAuthStore((state) => state.admin);
  const setAdmin = useAdminAuthStore((state) => state.setAdmin);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const firstTime = admin?.ownPassword === false;
  const needsCode = !admin?.externalReviewer;
  const differ = repeat.length > 0 && next !== repeat;
  const ready =
    current.length > 0 &&
    next.length >= STAFF_PASSWORD_MIN_LENGTH &&
    next === repeat &&
    (!needsCode || code.length === 6);

  const close = () => {
    setCurrent('');
    setNext('');
    setRepeat('');
    setCode('');
    setError(null);
    setSaving(false);
    onClose();
  };

  const save = async () => {
    if (!ready) return;
    setSaving(true);
    setError(null);
    try {
      await adminAuthApi.changePassword({
        currentPassword: current,
        newPassword: next,
        ...(needsCode ? { totpCode: code } : {}),
      });
    } catch (err: unknown) {
      const status = apiErrorStatus(err);
      setError(
        status === 403
          ? t('adminPanel.login.locked')
          : status === 401
            ? t('adminPanel.password.wrong')
            : apiErrorMessage(err, t, 'errors.generic.server'),
      );
      setCode('');
      setSaving(false);
      return;
    }
    toast.success(t('adminPanel.password.saved'));
    try {
      const { data } = await adminAuthApi.me();
      setAdmin(data);
    } catch {
      // The password is saved; the notice goes at the next load.
    }
    close();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={close}
      maxWidth="sm"
      title={t(
        firstTime
          ? 'adminPanel.password.set_title'
          : 'adminPanel.password.title',
      )}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <p className="text-sm text-white/70">
          {t(
            firstTime
              ? 'adminPanel.password.set_hint'
              : 'adminPanel.password.hint',
            { min: STAFF_PASSWORD_MIN_LENGTH },
          )}
        </p>
        {/* For the browser's password manager: whose password this is. */}
        <input
          type="email"
          value={admin?.email ?? ''}
          autoComplete="username"
          readOnly
          hidden
        />
        <div>
          <label htmlFor={`${id}-current`} className={labelClass}>
            {t(
              firstTime
                ? 'adminPanel.password.current_account'
                : 'adminPanel.password.current',
            )}
          </label>
          <input
            id={`${id}-current`}
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor={`${id}-new`} className={labelClass}>
            {t('adminPanel.login.new_password')}
          </label>
          <input
            id={`${id}-new`}
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            minLength={STAFF_PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
            aria-describedby={`${id}-rule`}
            className={fieldClass}
          />
          <p id={`${id}-rule`} className="text-xs text-white/50 mt-1 px-1">
            {t('adminPanel.login.new_password_rule', {
              min: STAFF_PASSWORD_MIN_LENGTH,
            })}
          </p>
        </div>
        <div>
          <label htmlFor={`${id}-repeat`} className={labelClass}>
            {t('adminPanel.login.repeat_password')}
          </label>
          <input
            id={`${id}-repeat`}
            type="password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            autoComplete="new-password"
            aria-invalid={differ}
            className={fieldClass}
          />
          {differ && (
            <p className="text-xs text-red-400 mt-1 px-1" role="alert">
              {t('adminPanel.login.passwords_differ')}
            </p>
          )}
        </div>
        {needsCode && (
          <div>
            <label htmlFor={`${id}-code`} className={labelClass}>
              {t('adminPanel.login.mfa_code')}
            </label>
            <input
              id={`${id}-code`}
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={6}
              className={`${fieldClass} text-center font-mono tracking-widest`}
            />
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-3">
          <Button
            type="submit"
            variant="primary"
            className="button-alone min-h-11 font-semibold"
            disabled={!ready || saving}
            isLoading={saving}
          >
            {t('adminPanel.password.save')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="button-alone min-h-11 font-semibold bg-white/5 text-gray-300"
            disabled={saving}
            onClick={close}
          >
            {t('admin.shared.cancel')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Asks an identity that still signs in with its CircleSfera account's
 * password to set one of its own. Nothing shows once it has.
 */
export function StaffPasswordNotice() {
  const { t } = useTranslation();
  const ownPassword = useAdminAuthStore((state) => state.admin?.ownPassword);
  const [open, setOpen] = useState(false);
  if (ownPassword !== false) return null;

  return (
    <section
      aria-labelledby="staff-password-notice"
      className="glass-panel rounded-xl p-4 mb-4 flex flex-col gap-3 sm:flex-row sm:items-center"
    >
      <KeyRound
        size={20}
        className="text-brand-primary-text shrink-0"
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <h2
          id="staff-password-notice"
          className="text-sm font-semibold text-white"
        >
          {t('adminPanel.password.notice_title')}
        </h2>
        <p className="text-xs text-white/60 mt-0.5">
          {t('adminPanel.password.notice_body')}
        </p>
      </div>
      <Button
        type="button"
        variant="primary"
        className="min-h-11 px-4 font-semibold self-start sm:self-center shrink-0"
        onClick={() => setOpen(true)}
      >
        {t('adminPanel.password.notice_action')}
      </Button>
      <StaffPasswordDialog isOpen={open} onClose={() => setOpen(false)} />
    </section>
  );
}
