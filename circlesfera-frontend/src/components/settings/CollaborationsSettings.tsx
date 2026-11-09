import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { COLLABORATION_QUERY_KEYS } from '../../hooks/useCollaboration';
import {
  type CollaborationInvitation,
  collaborationsApi,
} from '../../services';
import { apiErrorMessage } from '../../utils/apiErrorMessage';
import { EmptyState } from '../ErrorEmptyStates';
import { Button } from '../ui';
import { BUTTON_PAIR } from '../ui/buttonWidth';
import SettingsSection from './SettingsSection';

/**
 * The invitations to co-author someone else's post or Frame. Accepting shows
 * it on the own profile and to the own followers; declining tells nobody.
 */
export default function CollaborationsSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['collabInvitations'],
    queryFn: () => collaborationsApi.invitations(),
  });
  const invitations = data?.data ?? [];

  const answered = () => {
    void queryClient.invalidateQueries({ queryKey: ['collabInvitations'] });
    for (const key of COLLABORATION_QUERY_KEYS) {
      void queryClient.invalidateQueries({ queryKey: [...key] });
    }
  };

  const accept = useMutation({
    mutationFn: (postId: string) => collaborationsApi.accept(postId),
    onSuccess: () => {
      toast.success(t('settings.collaborations.accepted'));
      answered();
    },
    onError: (error) => {
      toast.error(
        apiErrorMessage(error, t, 'settings.collaborations.accept_error'),
      );
      answered();
    },
  });

  const decline = useMutation({
    mutationFn: (postId: string) => collaborationsApi.leave(postId),
    onSuccess: answered,
    onError: (error) => {
      toast.error(
        apiErrorMessage(error, t, 'settings.collaborations.decline_error'),
      );
      answered();
    },
  });

  // One invitation is answered at a time.
  const answering = accept.isPending || decline.isPending;

  return (
    <div className="max-w-xl space-y-5">
      <SettingsSection
        title={t('settings.collaborations.title')}
        description={t('settings.collaborations.subtitle')}
        card={false}
      >
        {invitations.length === 0 ? (
          <EmptyState icon="posts" title={t('settings.collaborations.empty')} />
        ) : (
          <ul className="space-y-2">
            {invitations.map((invitation) => (
              <InvitationRow
                key={invitation.post.id}
                invitation={invitation}
                disabled={answering}
                accepting={
                  accept.isPending && accept.variables === invitation.post.id
                }
                declining={
                  decline.isPending && decline.variables === invitation.post.id
                }
                onAccept={() => accept.mutate(invitation.post.id)}
                onDecline={() => decline.mutate(invitation.post.id)}
              />
            ))}
          </ul>
        )}
      </SettingsSection>
    </div>
  );
}

function InvitationRow({
  invitation,
  disabled,
  accepting,
  declining,
  onAccept,
  onDecline,
}: {
  invitation: CollaborationInvitation;
  disabled: boolean;
  accepting: boolean;
  declining: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { t } = useTranslation();
  const { post } = invitation;
  const cover = post.media[0];
  const preview = cover?.thumbnailUrl ?? cover?.url;

  return (
    <li className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3">
      <Link
        to={`/p/${post.id}`}
        className="flex items-center gap-3 min-w-0"
        aria-label={t('settings.collaborations.view_post', {
          username: post.profile.username,
        })}
      >
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-white/5 shrink-0">
          {preview && (
            <img
              src={preview}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm text-white truncate">
            {t('settings.collaborations.invited_by', {
              username: post.profile.username,
            })}
          </p>
          {post.caption && (
            <p className="text-xs text-white/50 truncate">{post.caption}</p>
          )}
        </div>
      </Link>
      <div className={BUTTON_PAIR}>
        <Button
          onClick={onAccept}
          isLoading={accepting}
          disabled={disabled}
          variant="primary"
          className="min-h-11 text-sm font-semibold px-4"
        >
          {t('settings.collaborations.accept')}
        </Button>
        <Button
          onClick={onDecline}
          isLoading={declining}
          disabled={disabled}
          variant="outline"
          className="min-h-11 text-sm font-semibold px-4"
        >
          {t('settings.collaborations.decline')}
        </Button>
      </div>
    </li>
  );
}
