import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SEO from '../common/SEO';
import { MarketingPage } from './MarketingPage';

export interface LegalSection {
  id: string;
  title: string;
  content: string;
  icon: LucideIcon;
}

interface LegalDocumentLayoutProps {
  seoTitle: string;
  headerTitle: string;
  badgeKey: string;
  quoteKey: string;
  lastUpdatedKey: string;
  sections: LegalSection[];
}

export function LegalDocumentLayout({
  seoTitle,
  headerTitle,
  badgeKey,
  quoteKey,
  lastUpdatedKey,
  sections,
}: LegalDocumentLayoutProps) {
  const { t } = useTranslation();

  const scrollTo = (id: string) => {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const tocLabel = (title: string) => {
    const parts = title.split('. ');
    return parts.length > 1 ? parts.slice(1).join('. ') : title;
  };

  return (
    <MarketingPage>
      <SEO title={seoTitle} />
      <div className="mx-auto max-w-6xl px-4 sm:px-5 py-16 sm:py-24 w-full">
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-20">
          <aside className="lg:w-72 shrink-0">
            <div className="lg:sticky lg:top-24 space-y-8">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-white/50 mb-4">
                  {t(badgeKey)}
                </p>
                <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white leading-[1.05]">
                  {headerTitle}
                </h1>
              </div>

              <label className="block lg:hidden">
                <span className="sr-only">
                  {t('legal.toc_label', 'Jump to section')}
                </span>
                <select
                  className="w-full h-14 rounded-2xl bg-black border border-white/10 text-sm text-white px-4 focus:outline-none focus-visible:border-white/30"
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) scrollTo(e.target.value);
                  }}
                >
                  <option value="" disabled>
                    {t('legal.toc_label', 'Jump to section')}
                  </option>
                  {sections.map((s) => (
                    <option
                      key={s.id}
                      value={s.id}
                      className="bg-black text-white"
                    >
                      {tocLabel(s.title)}
                    </option>
                  ))}
                </select>
              </label>

              <nav
                className="hidden lg:block space-y-1 bg-black border border-white/10 rounded-3xl p-3"
                aria-label={t('legal.toc_label', 'Jump to section')}
              >
                {sections.map((section) => (
                  <button
                    type="button"
                    key={section.id}
                    onClick={() => scrollTo(section.id)}
                    className="flex items-center gap-3 w-full min-h-12 px-4 rounded-2xl hover:bg-white/5 transition-colors text-left group focus:outline-none"
                  >
                    <section.icon
                      size={16}
                      className="text-white/40 group-hover:text-white shrink-0 transition-colors"
                    />
                    <span className="text-sm font-semibold text-white/50 group-hover:text-white truncate transition-colors">
                      {tocLabel(section.title)}
                    </span>
                    <ChevronRight
                      size={14}
                      className="ml-auto opacity-0 group-hover:opacity-100 text-white shrink-0 transition-opacity"
                    />
                  </button>
                ))}
              </nav>

              <p className="hidden lg:block text-sm text-white/40 leading-relaxed font-medium">
                {t(quoteKey)}
              </p>
            </div>
          </aside>

          <main className="flex-1 min-w-0 pb-10 pt-4">
            {sections.map((section, index) => (
              <section
                id={section.id}
                key={section.id}
                className={`scroll-mt-32 py-10 ${
                  index > 0 ? 'border-t border-white/10' : ''
                }`}
              >
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                    <section.icon
                      size={18}
                      className="text-white"
                      aria-hidden
                    />
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight pt-1">
                    {section.title}
                  </h2>
                </div>
                <p className="text-base sm:text-lg text-white/50 leading-relaxed font-medium">
                  {section.content}
                </p>
              </section>
            ))}

            <p className="pt-16 text-center text-xs uppercase tracking-widest text-white/30 font-bold">
              {t(lastUpdatedKey)}
            </p>
          </main>
        </div>
      </div>
    </MarketingPage>
  );
}
