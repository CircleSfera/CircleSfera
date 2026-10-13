import { Film, Image as ImageIcon, Megaphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CreatorPost } from '../../services/creator.service';
import { Button } from '../ui';
import { CreatorRow } from './CreatorPieces';
import { postFacts } from './creatorWords';

interface Props {
  post: CreatorPost;
  onOpen: (post: CreatorPost) => void;
  onPromote: (post: CreatorPost) => void;
}

// A post of the profile, wherever the area lists one: it opens its statistics
// and its one visible action promotes it.
export default function CreatorPostRow({ post, onOpen, onPromote }: Props) {
  const { t, i18n } = useTranslation();
  const title = post.caption || t('creator.post.untitled');

  return (
    <CreatorRow
      media={
        post.media?.[0] ? (
          <img
            src={post.media[0].url}
            className="w-full h-full object-cover"
            alt=""
          />
        ) : post.type === 'FRAME' ? (
          <Film size={20} aria-hidden />
        ) : (
          <ImageIcon size={20} aria-hidden />
        )
      }
      title={title}
      facts={postFacts(post, t, i18n.language)}
      onOpen={() => onOpen(post)}
      openLabel={t('creator.post.statistics_of', { title })}
      action={
        <Button
          variant="ghost"
          size="compact"
          className="min-h-11 min-w-11 gap-1.5 shrink-0"
          aria-label={t('creator.post.promote_this', { title })}
          onClick={() => onPromote(post)}
        >
          <Megaphone size={16} aria-hidden />
          <span className="hidden sm:inline">{t('creator.post.promote')}</span>
        </Button>
      }
    />
  );
}
