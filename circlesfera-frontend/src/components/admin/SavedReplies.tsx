import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdminSavedReply } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import { Button, Dialog, Input, Switch, Textarea } from '../ui';
import { FilterDropdown } from './AdminTable';

interface Props {
  // Who leads the team manages the replies the team shares.
  leadsTeam: boolean;
  /** Puts the text of the chosen reply in the reply box. */
  onInsert: (body: string) => void;
  onToast: (msg: string, type: 'success' | 'error') => void;
}

const EMPTY = { title: '', body: '', shared: false };

/**
 * The answers an agent keeps for repeated questions: a selector that puts
 * one in the reply box, and a panel to write, change and delete them. A
 * saved reply is never sent from here.
 */
export function SavedReplies({ leadsTeam, onInsert, onToast }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [managing, setManaging] = useState(false);
  // The reply being written: a new one (no id) or one being changed.
  const [form, setForm] = useState<(typeof EMPTY & { id?: string }) | null>(
    null,
  );
  const [deleting, setDeleting] = useState<string | null>(null);

  const { data: replies = [] } = useQuery({
    queryKey: ['admin', 'support-saved-replies'],
    queryFn: () => adminApi.getSavedReplies().then((res) => res.data),
    staleTime: 60 * 1000,
  });
  const done = (message: string) => {
    queryClient.invalidateQueries({
      queryKey: ['admin', 'support-saved-replies'],
    });
    setForm(null);
    setDeleting(null);
    onToast(message, 'success');
  };
  const failed = () => onToast(t('admin.support.toast_error'), 'error');

  const saveMutation = useMutation({
    mutationFn: (reply: typeof EMPTY & { id?: string }) =>
      reply.id
        ? adminApi.updateSavedReply(reply.id, {
            title: reply.title.trim(),
            body: reply.body.trim(),
          })
        : adminApi.createSavedReply({
            title: reply.title.trim(),
            body: reply.body.trim(),
            ...(reply.shared && { shared: true }),
          }),
    onSuccess: () => done(t('admin.support.saved_replies.toast_saved')),
    onError: failed,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteSavedReply(id),
    onSuccess: () => done(t('admin.support.saved_replies.toast_deleted')),
    onError: failed,
  });

  const mayChange = (reply: AdminSavedReply) => !reply.shared || leadsTeam;
  const close = () => {
    setManaging(false);
    setForm(null);
    setDeleting(null);
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      {replies.length > 0 && (
        <div className="w-full min-w-0 sm:max-w-72">
          <FilterDropdown
            label={t('admin.support.saved_replies.insert')}
            value=""
            onChange={(id) => {
              const chosen = replies.find((reply) => reply.id === id);
              if (chosen) onInsert(chosen.body);
            }}
            options={[
              { value: '', label: t('admin.support.saved_replies.insert') },
              ...replies.map((reply) => ({
                value: reply.id,
                label: reply.title,
              })),
            ]}
          />
        </div>
      )}
      <Button
        variant="secondary"
        className="min-h-11 text-sm max-sm:w-full"
        onClick={() => setManaging(true)}
      >
        {t('admin.support.saved_replies.manage')}
      </Button>

      <Dialog
        isOpen={managing}
        onClose={close}
        title={t('admin.support.saved_replies.title')}
        maxWidth="lg"
      >
        {form ? (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate(form);
            }}
          >
            <Input
              label={t('admin.support.saved_replies.field_title')}
              value={form.title}
              maxLength={120}
              onChange={(event) =>
                setForm({ ...form, title: event.target.value })
              }
            />
            <Textarea
              label={t('admin.support.saved_replies.field_body')}
              value={form.body}
              rows={6}
              maxLength={5000}
              onChange={(event) =>
                setForm({ ...form, body: event.target.value })
              }
            />
            <p className="text-xs text-white/60">
              {/* The three are written as they must be typed. */}
              {t('admin.support.saved_replies.placeholders_hint', {
                name: '{{name}}',
                subject: '{{subject}}',
                reference: '{{reference}}',
              })}
            </p>
            {/* A reply is personal or shared from the start. */}
            {leadsTeam && !form.id && (
              <Switch
                label={t('admin.support.saved_replies.share')}
                description={t('admin.support.saved_replies.share_hint')}
                checked={form.shared}
                onChange={(event) =>
                  setForm({ ...form, shared: event.target.checked })
                }
              />
            )}
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
                onClick={() => setForm(null)}
              >
                {t('admin.shared.cancel')}
              </Button>
              <Button
                type="submit"
                className="min-h-11"
                isLoading={saveMutation.isPending}
                disabled={!form.title.trim() || !form.body.trim()}
              >
                {t('admin.support.saved_replies.save')}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            {replies.length === 0 && (
              <p className="text-sm text-white/70">
                {t('admin.support.saved_replies.empty')}
              </p>
            )}
            <ul className="space-y-2">
              {replies.map((reply) => (
                <li
                  key={reply.id}
                  className="rounded-xl border border-white/10 bg-white/5 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 text-sm font-semibold text-white wrap-break-word">
                      {reply.title}
                    </p>
                    <span className="text-xs font-semibold text-white/60">
                      {t(
                        reply.shared
                          ? 'admin.support.saved_replies.kind_shared'
                          : 'admin.support.saved_replies.kind_personal',
                      )}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-white/70 whitespace-pre-wrap wrap-break-word">
                    {reply.body}
                  </p>
                  {mayChange(reply) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        className="min-h-11 text-sm"
                        aria-label={t(
                          'admin.support.saved_replies.edit_named',
                          {
                            title: reply.title,
                          },
                        )}
                        onClick={() =>
                          setForm({
                            id: reply.id,
                            title: reply.title,
                            body: reply.body,
                            shared: reply.shared,
                          })
                        }
                      >
                        {t('admin.support.saved_replies.edit')}
                      </Button>
                      {deleting === reply.id ? (
                        <Button
                          variant="secondary"
                          className="min-h-11 text-sm"
                          isLoading={deleteMutation.isPending}
                          onClick={() => deleteMutation.mutate(reply.id)}
                        >
                          {t('admin.support.saved_replies.delete_confirm')}
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          className="min-h-11 text-sm"
                          aria-label={t(
                            'admin.support.saved_replies.delete_named',
                            { title: reply.title },
                          )}
                          onClick={() => setDeleting(reply.id)}
                        >
                          {t('admin.support.saved_replies.delete')}
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <Button className="min-h-11" onClick={() => setForm(EMPTY)}>
              {t('admin.support.saved_replies.new')}
            </Button>
          </div>
        )}
      </Dialog>
    </div>
  );
}
