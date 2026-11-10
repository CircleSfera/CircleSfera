import { STAFF_PASSKEYS_MAX } from '@circlesfera/shared';
import { startRegistration } from '@simplewebauthn/browser';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Fingerprint, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { adminAuthApi } from '../../services/admin-auth.service';
import { useAdminAuthStore } from '../../stores/adminAuthStore';
import { apiErrorMessage } from '../../utils/apiErrorMessage';
import { Button } from '../ui';
import { Dialog } from '../ui/Dialog';
import { isStepUpCancelled, useAdminStepUp } from './useAdminStepUp';

const PASSKEYS_KEY = ['admin', 'passkeys'] as const;

// The browser says so when the person closes its passkey prompt.
const wasCancelled = (err: unknown) =>
  err instanceof Error && err.name === 'NotAllowedError';

/**
 * The staff passkeys of the identity signed in: list, add, remove. Adding or
 * removing one asks for the authenticator code first (step-up).
 */
export function StaffPasskeysDialog({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const nameId = useId();
  const queryClient = useQueryClient();
  const setAdmin = useAdminAuthStore((state) => state.setAdmin);
  const { run, dialog: stepUpDialog } = useAdminStepUp();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  // The options of a passkey about to be created. Getting them may ask for
  // the authenticator code; creating it is then a click of its own, since
  // a browser shows its passkey prompt only right after a click.
  const [ready, setReady] = useState<Record<string, unknown> | null>(null);

  const { data: passkeys = [], isLoading } = useQuery({
    queryKey: PASSKEYS_KEY,
    queryFn: () => adminAuthApi.listPasskeys().then((r) => r.data),
    enabled: isOpen,
  });
  const full = passkeys.length >= STAFF_PASSKEYS_MAX;

  // The list and who is signed in (its passkey count) after a change.
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: PASSKEYS_KEY });
    try {
      const { data } = await adminAuthApi.me();
      setAdmin(data);
    } catch {
      // The change is made; the count catches up at the next load.
    }
  };

  const report = (err: unknown) => {
    if (isStepUpCancelled(err)) return;
    toast.error(
      wasCancelled(err)
        ? t('adminPanel.passkeys.cancelled')
        : apiErrorMessage(err, t, 'adminPanel.passkeys.error'),
    );
  };

  const prepare = async () => {
    setBusy('add');
    try {
      const { data: options } = await run(() =>
        adminAuthApi.passkeyRegisterOptions(),
      );
      setReady(options);
    } catch (err) {
      report(err);
    } finally {
      setBusy(null);
    }
  };

  const create = async () => {
    if (!ready) return;
    setBusy('create');
    try {
      const answer = await startRegistration({ optionsJSON: ready as never });
      await adminAuthApi.registerPasskey(
        answer as unknown as Record<string, unknown>,
        name.trim() || undefined,
      );
      setName('');
      toast.success(t('adminPanel.passkeys.added'));
      await refresh();
    } catch (err) {
      report(err);
    } finally {
      // Options are used once: another try asks for new ones.
      setReady(null);
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    setBusy(id);
    try {
      await run(() => adminAuthApi.removePasskey(id));
      toast.success(t('adminPanel.passkeys.removed'));
      await refresh();
    } catch (err) {
      report(err);
    } finally {
      setBusy(null);
    }
  };

  const date = (value: string) =>
    new Date(value).toLocaleDateString(i18n.language, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  return (
    <>
      <Dialog
        isOpen={isOpen}
        onClose={onClose}
        maxWidth="sm"
        title={t('adminPanel.passkeys.title')}
      >
        <div className="space-y-4">
          <p className="text-sm text-white/70">
            {t('adminPanel.passkeys.hint')}
          </p>
          {isLoading ? (
            <p className="text-sm text-white/50" role="status">
              {t('adminPanel.passkeys.loading')}
            </p>
          ) : passkeys.length === 0 ? (
            <p className="text-sm text-white/50">
              {t('adminPanel.passkeys.none')}
            </p>
          ) : (
            <ul className="space-y-2">
              {passkeys.map((passkey) => (
                <li
                  key={passkey.id}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5"
                >
                  <Fingerprint
                    size={18}
                    className="text-brand-primary-text shrink-0"
                    aria-hidden
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {passkey.name || t('adminPanel.passkeys.unnamed')}
                    </p>
                    <p className="text-xs text-white/50">
                      {passkey.lastUsedAt
                        ? t('adminPanel.passkeys.used_on', {
                            date: date(passkey.lastUsedAt),
                          })
                        : t('adminPanel.passkeys.added_on', {
                            date: date(passkey.createdAt),
                          })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void remove(passkey.id)}
                    disabled={busy !== null}
                    aria-label={t('adminPanel.passkeys.remove', {
                      name: passkey.name || t('adminPanel.passkeys.unnamed'),
                    })}
                    className="w-11 h-11 flex items-center justify-center rounded-xl text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-40 shrink-0"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {full ? (
            <p className="text-xs text-white/50">
              {t('adminPanel.passkeys.full', { max: STAFF_PASSKEYS_MAX })}
            </p>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void (ready ? create() : prepare());
              }}
            >
              <div>
                <label
                  htmlFor={nameId}
                  className="block text-xs font-semibold text-white/60 mb-1 px-1"
                >
                  {t('adminPanel.passkeys.name')}
                </label>
                <input
                  id={nameId}
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 60))}
                  placeholder={t('adminPanel.passkeys.name_placeholder')}
                  className="w-full min-h-12 rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-primary/60"
                />
              </div>
              <Button
                type="submit"
                variant="primary"
                className="button-alone min-h-11 font-semibold"
                disabled={busy !== null}
                isLoading={busy === 'add' || busy === 'create'}
              >
                {t(
                  ready
                    ? 'adminPanel.passkeys.create'
                    : 'adminPanel.passkeys.add',
                )}
              </Button>
              {ready && (
                <p className="text-xs text-white/50 text-center" role="status">
                  {t('adminPanel.passkeys.create_hint')}
                </p>
              )}
            </form>
          )}
        </div>
      </Dialog>
      {stepUpDialog}
    </>
  );
}

/**
 * Asks a member of staff with no passkey to add one. Nothing shows for an
 * external reviewer, nor once the identity has a passkey.
 */
export function StaffPasskeyNotice() {
  const { t } = useTranslation();
  const admin = useAdminAuthStore((state) => state.admin);
  const [open, setOpen] = useState(false);
  if (!admin || admin.externalReviewer || admin.passkeyCount !== 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="staff-passkey-notice"
      className="glass-panel rounded-xl p-4 mb-4 flex flex-col gap-3 sm:flex-row sm:items-center"
    >
      <Fingerprint
        size={20}
        className="text-brand-primary-text shrink-0"
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <h2
          id="staff-passkey-notice"
          className="text-sm font-semibold text-white"
        >
          {t('adminPanel.passkeys.notice_title')}
        </h2>
        <p className="text-xs text-white/60 mt-0.5">
          {t('adminPanel.passkeys.notice_body')}
        </p>
      </div>
      <Button
        type="button"
        variant="primary"
        className="min-h-11 px-4 font-semibold self-start sm:self-center shrink-0"
        onClick={() => setOpen(true)}
      >
        {t('adminPanel.passkeys.notice_action')}
      </Button>
      <StaffPasskeysDialog isOpen={open} onClose={() => setOpen(false)} />
    </section>
  );
}
