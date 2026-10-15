import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

/** A hashtag on a story: it opens the page of the hashtag. */
export function HashtagSticker({ tag }: { tag: string }) {
  const { t } = useTranslation();
  return (
    <Link
      to={`/explore/tags/${encodeURIComponent(tag)}`}
      aria-label={t('interactive.hashtag.open', { tag })}
      className="inline-flex min-h-11 items-center rounded-xl bg-white px-3 py-1.5 shadow-[0_6px_20px_rgba(0,0,0,0.35)]"
    >
      <span className="text-lg font-black tracking-tight text-transparent bg-clip-text bg-linear-to-r from-brand-primary to-brand-blue">
        #{tag.toUpperCase()}
      </span>
    </Link>
  );
}
