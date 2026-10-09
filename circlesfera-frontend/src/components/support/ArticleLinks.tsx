import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { HelpArticleLine } from '../../services/helpCentre.service';

/** Articles of the help centre, as a list of links to each one. */
export function ArticleLinks({ articles }: { articles: HelpArticleLine[] }) {
  return (
    <ul className="glass-panel divide-y divide-white/8 overflow-hidden rounded-3xl">
      {articles.map((article) => (
        <li key={article.slug}>
          <Link
            to={`/help/${article.slug}`}
            className="flex min-h-14 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/4 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary/50 sm:px-5"
          >
            <span className="min-w-0 flex-1 text-base font-semibold text-white/90">
              {article.title}
            </span>
            <ChevronRight
              size={18}
              className="shrink-0 text-white/30"
              aria-hidden
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
