import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import SEO from '../common/SEO';

/** The policy pages and the form to report illegal content, in their order. */
export const LEGAL_DOCUMENTS = [
  { to: '/privacy', label: 'common.footer.privacy' },
  { to: '/terms', label: 'common.footer.terms' },
  { to: '/guidelines', label: 'common.footer.guidelines' },
  { to: '/report-illegal-content', label: 'common.footer.report_illegal' },
] as const;

/** Where the back arrow goes when the page was opened directly. */
export const LEGAL_BACK_FALLBACK = '/';

/** The way between the legal pages: one chip each, as wide as its name. */
export function LegalDocumentChips({
  centered = false,
}: {
  centered?: boolean;
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  return (
    <nav
      aria-label={t('landing.footer.legal')}
      className={`flex flex-wrap gap-2 ${centered ? 'justify-center' : ''}`}
    >
      {LEGAL_DOCUMENTS.map(({ to, label }) => {
        const current = pathname === to;
        return (
          <Link
            key={to}
            to={to}
            replace
            aria-current={current ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold transition-colors ${
              current
                ? 'bg-white text-black'
                : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            {t(label)}
          </Link>
        );
      })}
    </nav>
  );
}

interface LegalSubscreenProps {
  title: string;
  seoTitle: string;
  seoDescription?: string;
  children: ReactNode;
}

/**
 * A legal page for someone signed in: a screen of the app, like one of the
 * settings, with a bar that goes back and names the page, and no bars of
 * the app around it.
 */
export function LegalSubscreen({
  title,
  seoTitle,
  seoDescription,
  children,
}: LegalSubscreenProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  // Back to where the person came from; a page opened on its own goes to
  // the start of the app.
  const back = () => {
    if (location.key !== 'default') navigate(-1);
    else navigate(LEGAL_BACK_FALLBACK);
  };

  return (
    <div className="flex min-h-dvh w-full flex-col text-white">
      <SEO title={seoTitle} description={seoDescription} />
      <header className="sticky top-0 z-30 border-b border-white/10 bg-surface-base/90 backdrop-blur-md pt-safe">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-2 px-2 sm:px-4">
          <button
            type="button"
            onClick={back}
            aria-label={t('common.back')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/10"
          >
            <ArrowLeft size={22} aria-hidden />
          </button>
          <h1 className="truncate text-base font-bold">{title}</h1>
        </div>
      </header>
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] pt-4 sm:px-6">
        {children}
      </div>
    </div>
  );
}
