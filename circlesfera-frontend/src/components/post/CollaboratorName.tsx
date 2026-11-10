import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Post } from '../../types';

interface CollaboratorNameProps {
  post: Pick<Post, 'collaborator'>;
  className?: string;
}

/**
 * "and <collaborator>" next to the author's name, on a post two Profiles
 * made together. Nothing while the collaborator has not accepted.
 */
export default function CollaboratorName({
  post,
  className = '',
}: CollaboratorNameProps) {
  const { t } = useTranslation();
  const username = post.collaborator?.username;
  if (!username) return null;
  return (
    <span className={`flex items-center gap-1 min-w-0 shrink ${className}`}>
      <span className="text-white/60 shrink-0">{t('post.collab.and')}</span>
      <Link
        to={`/${username}`}
        className="truncate hover:opacity-80 transition-opacity"
        aria-label={t('common.view_profile', { username })}
      >
        {username}
      </Link>
    </span>
  );
}
