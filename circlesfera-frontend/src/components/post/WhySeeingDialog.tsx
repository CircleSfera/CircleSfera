import { useQuery } from '@tanstack/react-query';
import {
  Clock,
  Hash,
  Heart,
  type LucideIcon,
  Megaphone,
  MessageCircle,
  Sparkles,
  TrendingUp,
  User,
  UserCheck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { type PostWhyReason, postsApi } from '../../services/posts.service';
import { countryName } from '../../utils/countries';
import { Button } from '../ui';
import { Dialog } from '../ui/Dialog';

interface Props {
  postId: string;
  isOpen: boolean;
  onClose: () => void;
}

const ICONS: Record<PostWhyReason['code'], LucideIcon> = {
  own: User,
  following: UserCheck,
  engaged_with_author: MessageCircle,
  liked_similar_tags: Hash,
  similar_content: Heart,
  popular: TrendingUp,
  new: Clock,
  promoted: Megaphone,
};

/**
 * Why a post or a Frame is shown to the viewer: the reasons the server finds
 * true for them, in words, and how recommendations work in general. The app
 * never guesses a reason.
 */
export default function WhySeeingDialog({ postId, isOpen, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['post-why', postId],
    queryFn: () => postsApi.getWhy(postId).then((res) => res.data),
    enabled: isOpen,
    staleTime: 0,
  });
  const list = (items: string[]) =>
    new Intl.ListFormat(i18n.language, {
      style: 'long',
      type: 'conjunction',
    }).format(items);

  const sentence = (reason: PostWhyReason): string => {
    switch (reason.code) {
      case 'following':
      case 'engaged_with_author':
        return t(`post.why_seeing.${reason.code}`, {
          username: reason.username,
        });
      case 'liked_similar_tags':
        return t('post.why_seeing.liked_similar_tags', {
          tags: list(reason.tags.map((tag) => `#${tag}`)),
        });
      case 'promoted': {
        const paid = t('post.why.paid_by', { username: reason.username });
        const where = reason.countries.length
          ? t('post.why.countries', {
              list: list(
                reason.countries.map((c) => countryName(c, i18n.language)),
              ),
            })
          : t('post.why.everywhere');
        return `${paid} ${where}`;
      }
      default:
        return t(`post.why_seeing.${reason.code}`);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={t('post.why_seeing.title')}
    >
      <div className="space-y-4 text-sm text-white/80 leading-relaxed">
        {isLoading ? (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-11 rounded-xl bg-white/5 animate-pulse"
              />
            ))}
          </div>
        ) : isError || !data ? (
          <div className="space-y-3">
            <p>{t('post.why_seeing.load_failed')}</p>
            <Button
              variant="secondary"
              onClick={() => void refetch()}
              className="min-h-11 button-alone text-sm font-semibold"
            >
              {t('post.why_seeing.retry')}
            </Button>
          </div>
        ) : (
          <>
            {data.reasons.length > 0 ? (
              <>
                <p className="text-white/60">{t('post.why_seeing.intro')}</p>
                <ul className="space-y-2">
                  {data.reasons.map((reason) => {
                    const Icon = ICONS[reason.code] ?? Sparkles;
                    return (
                      <li
                        key={reason.code}
                        className="flex items-start gap-3 rounded-xl bg-white/5 border border-white/5 px-3 py-2.5 min-h-11"
                      >
                        <Icon
                          size={18}
                          className="shrink-0 mt-0.5 text-brand-primary-text"
                          aria-hidden="true"
                        />
                        <span>{sentence(reason)}</span>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <p>{t('post.why_seeing.none')}</p>
            )}
            <p className="text-white/60">{t('post.why_seeing.how')}</p>
            <Link
              to="/help/how-your-feed-works"
              onClick={onClose}
              className="inline-flex min-h-11 items-center font-semibold text-brand-primary-text underline underline-offset-2"
            >
              {t('post.why_seeing.how_link')}
            </Link>
            <p className="text-white/60">{t('post.why_seeing.control')}</p>
          </>
        )}
      </div>
    </Dialog>
  );
}
