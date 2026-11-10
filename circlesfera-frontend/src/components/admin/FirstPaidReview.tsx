import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminApi, type FirstPaidItem } from '../../services/admin.service';
import { apiErrorMessage } from '../../utils/apiErrorMessage';
import { formatDay } from '../../utils/format';
import { formatCents } from '../../utils/money';
import MediaThumb from '../common/MediaThumb';
import { Button } from '../ui';
import { BUTTON_PAIR } from '../ui/buttonWidth';
import { Dialog } from '../ui/Dialog';
import { Textarea } from '../ui/Textarea';
import { AdminListRow } from './AdminList';

const QUERY_KEY = ['admin', 'moderation', 'firstPaid'];

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

// The first paid posts and stories of each creator wait here, off sale,
// until a person on staff passes them or removes them with a reason. Shown
// only while something waits.
export default function FirstPaidReview({ onToast }: Props) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [removing, setRemoving] = useState<FirstPaidItem | null>(null);
  const [viewing, setViewing] = useState<FirstPaidItem | null>(null);
  const [reason, setReason] = useState('');

  const { data } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => adminApi.getFirstPaidReview().then((res) => res.data),
  });

  const done = (message: string) => {
    onToast(message, 'success');
    setRemoving(null);
    setReason('');
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  };

  const approve = useMutation({
    mutationFn: (item: FirstPaidItem) =>
      adminApi.approveFirstPaid(item.type, item.id, item.contentEditedAt),
    onSuccess: () => {
      setViewing(null);
      done(t('admin.moderation.first_paid.approved'));
    },
    // Changed by its author since it was opened: shown again as it is now.
    onError: (err) => {
      onToast(
        apiErrorMessage(err, t, 'admin.moderation.first_paid.error'),
        'error',
      );
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const remove = useMutation({
    mutationFn: (input: { item: FirstPaidItem; note: string }) =>
      adminApi.updateModerationStatus(
        input.item.type,
        input.item.id,
        'REMOVED',
        input.note,
      ),
    onSuccess: () => done(t('admin.moderation.first_paid.removed')),
    onError: () => onToast(t('admin.moderation.first_paid.error'), 'error'),
  });

  const items = data?.items ?? [];
  if (items.length === 0) return null;

  return (
    <section className="space-y-2" aria-labelledby="first-paid-review">
      <div>
        <h2
          id="first-paid-review"
          className="text-base font-semibold text-white"
        >
          {t('admin.moderation.first_paid.title')}
        </h2>
        <p className="text-sm text-white/60">
          {t('admin.moderation.first_paid.subtitle', { count: data?.needed })}
        </p>
      </div>
      <ul className="space-y-2">
        {items.map((item) => {
          const media = item.media[0];
          return (
            <li key={`${item.type}:${item.id}`}>
              <AdminListRow
                avatar={
                  <MediaThumb
                    src={media?.thumbnailUrl ?? media?.url}
                    video={media?.type === 'video'}
                    shape={item.type === 'STORY' ? 'STORY' : 'POST'}
                  />
                }
                title={`@${item.profile.username}`}
                subtitle={item.caption ?? undefined}
                meta={[
                  t(`admin.audit.targets.${item.type}`, {
                    defaultValue: item.type,
                  }),
                  formatCents(item.priceCents, i18n.language),
                  formatDay(item.createdAt, i18n.language),
                  t('admin.moderation.first_paid.progress', {
                    passed: item.passedByStaff,
                    count: data?.needed,
                  }),
                ].join(' · ')}
                primaryAction={
                  <div className={BUTTON_PAIR}>
                    <Button
                      size="md"
                      variant="outline"
                      onClick={() => setViewing(item)}
                    >
                      {t('admin.moderation.first_paid.view')}
                    </Button>
                    <Button
                      size="md"
                      variant="outline"
                      onClick={() => setRemoving(item)}
                    >
                      {t('admin.moderation.first_paid.remove')}
                    </Button>
                    <Button
                      size="md"
                      onClick={() => approve.mutate(item)}
                      isLoading={
                        approve.isPending && approve.variables?.id === item.id
                      }
                    >
                      {t('admin.moderation.first_paid.approve')}
                    </Button>
                  </div>
                }
              />
            </li>
          );
        })}
      </ul>

      <Dialog
        isOpen={viewing !== null}
        onClose={() => setViewing(null)}
        title={
          viewing
            ? t('admin.moderation.first_paid.view_title', {
                username: viewing.profile.username,
              })
            : ''
        }
        maxWidth="md"
      >
        {viewing && (
          <div className="space-y-3">
            {viewing.caption && (
              <p className="whitespace-pre-wrap text-sm text-white/80">
                {viewing.caption}
              </p>
            )}
            <ul className="space-y-3">
              {viewing.media.map((m) => (
                <li key={m.url}>
                  {m.type === 'video' ? (
                    <video
                      src={m.url}
                      poster={m.thumbnailUrl ?? undefined}
                      controls
                      muted
                      playsInline
                      className="max-h-[60vh] w-full rounded-xl bg-black object-contain"
                    />
                  ) : (
                    <img
                      src={m.url}
                      alt=""
                      className="max-h-[60vh] w-full rounded-xl bg-black object-contain"
                    />
                  )}
                </li>
              ))}
            </ul>
            <div className={BUTTON_PAIR}>
              <Button
                size="md"
                onClick={() => approve.mutate(viewing)}
                isLoading={approve.isPending}
              >
                {t('admin.moderation.first_paid.approve')}
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        isOpen={removing !== null}
        onClose={() => {
          setRemoving(null);
          setReason('');
        }}
        title={
          removing
            ? t('admin.moderation.first_paid.ask_remove', {
                username: removing.profile.username,
              })
            : ''
        }
        maxWidth="md"
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (removing && reason.trim()) {
              remove.mutate({ item: removing, note: reason.trim() });
            }
          }}
        >
          <Textarea
            label={t('admin.moderation.first_paid.reason')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
          />
          <div className={BUTTON_PAIR}>
            <Button
              type="submit"
              variant="danger"
              size="md"
              disabled={!reason.trim()}
              isLoading={remove.isPending}
            >
              {t('admin.moderation.first_paid.remove')}
            </Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
