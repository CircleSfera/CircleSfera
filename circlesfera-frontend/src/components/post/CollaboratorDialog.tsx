import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { COLLABORATION_QUERY_KEYS } from '../../hooks/useCollaboration';
import { collaborationsApi } from '../../services';
import { apiErrorMessage } from '../../utils/apiErrorMessage';
import UserAvatar from '../UserAvatar';
import { Button, Input } from '../ui';
import { Dialog } from '../ui/Dialog';

interface CollaboratorDialogProps {
  postId: string;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * The author's view of its post's one collaborator: invite a Profile by its
 * username, see whether it answered, or remove it. Only a public post that
 * is not paid can have one; the server says so when it is refused.
 */
export default function CollaboratorDialog({
  postId,
  isOpen,
  onClose,
}: CollaboratorDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');

  const queryKey = ['postCollaborator', postId];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => collaborationsApi.get(postId),
    enabled: isOpen,
  });
  const collaborator = data?.data ?? null;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey });
    void queryClient.invalidateQueries({ queryKey: ['post', postId] });
    for (const key of COLLABORATION_QUERY_KEYS) {
      void queryClient.invalidateQueries({ queryKey: [...key] });
    }
  };

  const invite = useMutation({
    mutationFn: (name: string) => collaborationsApi.invite(postId, name),
    onSuccess: () => {
      setUsername('');
      toast.success(t('post.collab.invited'));
      refresh();
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, t, 'post.collab.invite_error')),
  });

  const remove = useMutation({
    mutationFn: () => collaborationsApi.remove(postId),
    onSuccess: () => {
      toast.success(t('post.collab.removed'));
      refresh();
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, t, 'post.collab.remove_error')),
  });

  const name = username.trim().replace(/^@/, '');

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={t('post.collab.title')}
      maxWidth="md"
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-white/60">{t('post.collab.explain')}</p>

        {isLoading ? null : collaborator ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <div className="flex items-center gap-3 min-w-0">
              <UserAvatar
                src={collaborator.profile.avatar || undefined}
                thumbnailUrl={collaborator.profile.thumbnailUrl}
                standardUrl={collaborator.profile.standardUrl}
                alt={collaborator.profile.username || ''}
                size="md"
                className="w-10 h-10 rounded-full object-cover shrink-0"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                  @{collaborator.profile.username}
                </p>
                <p className="text-xs text-white/50">
                  {collaborator.status === 'ACCEPTED'
                    ? t('post.collab.status_accepted')
                    : t('post.collab.status_pending')}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 text-sm font-semibold px-4 shrink-0"
              onClick={() => remove.mutate()}
              isLoading={remove.isPending}
              disabled={remove.isPending}
            >
              {collaborator.status === 'ACCEPTED'
                ? t('post.collab.remove')
                : t('post.collab.withdraw')}
            </Button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (name) invite.mutate(name);
            }}
          >
            <Input
              label={t('post.collab.username_label')}
              placeholder={t('post.collab.username_placeholder')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={64}
              autoCapitalize="none"
              autoCorrect="off"
            />
            <Button
              type="submit"
              variant="primary"
              className="min-h-11"
              isLoading={invite.isPending}
              disabled={!name || invite.isPending}
            >
              {t('post.collab.invite')}
            </Button>
          </form>
        )}
      </div>
    </Dialog>
  );
}
