import type { LucideIcon } from 'lucide-react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import SEO from '../common/SEO';
import { SegmentedControl } from '../ui/SegmentedControl';
import { MarketingCTA } from './MarketingCTA';
import { MarketingPage } from './MarketingPage';
import { MarketingPageHeader } from './MarketingPageHeader';

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
  sections: LegalSection[];
}

const DOCUMENTS = [
  { to: '/privacy', label: 'common.footer.privacy' },
  { to: '/terms', label: 'common.footer.terms' },
  { to: '/guidelines', label: 'common.footer.guidelines' },
] as const;

// Section titles carry their own number ("1. Acceptable use"); the page
// shows the number on its own.
function plainTitle(title: string) {
  const parts = title.split('. ');
  return parts.length > 1 ? parts.slice(1).join('. ') : title;
}

const number = (index: number) => String(index + 1).padStart(2, '0');

/**
 * A policy page: which document this is and the way to the other two, its
 * sections listed beside the text on desktop and in a picker on a phone,
 * and where to ask about it.
 */
export function LegalDocumentLayout({
  seoTitle,
  headerTitle,
  badgeKey,
  quoteKey,
  sections,
}: LegalDocumentLayoutProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  return (
    <MarketingPage>
      <SEO title={seoTitle} />
      <div className="mx-auto w-full max-w-6xl px-4 pb-14 sm:px-6 sm:pb-20">
        <MarketingPageHeader
          className="pt-12 pb-8 sm:pt-20 sm:pb-10"
          align="center"
          eyebrow={t(badgeKey)}
          title={headerTitle}
          description={t(quoteKey)}
        />

        <div className="flex justify-center">
          <SegmentedControl
            id="legalDocumentPill"
            label={t('landing.footer.legal')}
            value={pathname}
            items={DOCUMENTS.map(({ to, label }) => ({
              value: to,
              to,
              label: t(label),
            }))}
            className="[&_a]:px-4 sm:[&_a]:px-6"
          />
        </div>

        <div className="mt-10 grid gap-8 sm:mt-14 lg:grid-cols-[18rem_1fr] lg:gap-12">
          <aside>
            <label className="relative block lg:hidden">
              <span className="sr-only">{t('legal.toc_label')}</span>
              <select
                className="h-12 w-full appearance-none rounded-full border border-white/10 bg-surface-elevated pl-5 pr-12 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"
                defaultValue=""
                onChange={(event) => {
                  if (event.target.value) {
                    window.location.hash = event.target.value;
                  }
                }}
              >
                <option value="" disabled>
                  {t('legal.toc_label')}
                </option>
                {sections.map((section, index) => (
                  <option key={section.id} value={section.id}>
                    {number(index)} · {plainTitle(section.title)}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={18}
                className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-white/50"
                aria-hidden
              />
            </label>

            <nav
              aria-label={t('legal.toc_label')}
              className="hidden rounded-3xl glass-panel p-3 lg:block"
            >
              <p className="px-3 pb-2 pt-1 text-xs font-bold uppercase tracking-[0.14em] text-white/40">
                {t('legal.toc_label')}
              </p>
              {sections.map((section, index) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="group flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-semibold text-white/60 transition-colors hover:bg-white/8 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"
                >
                  <span className="text-xs font-bold tabular-nums text-brand-primary">
                    {number(index)}
                  </span>
                  <span className="truncate">{plainTitle(section.title)}</span>
                </a>
              ))}
            </nav>
          </aside>

          <div className="min-w-0 space-y-4">
            {sections.map((section, index) => (
              <section
                id={section.id}
                key={section.id}
                className="scroll-mt-24 rounded-3xl glass-panel p-6 sm:p-8"
              >
                <div className="flex items-center gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-primary/15 text-brand-primary">
                    <section.icon size={22} strokeWidth={1.75} aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold tabular-nums text-white/40">
                      {number(index)}
                    </p>
                    <h2 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                      {plainTitle(section.title)}
                    </h2>
                  </div>
                </div>
                <p className="mt-5 max-w-prose whitespace-pre-line text-base leading-relaxed text-white/70">
                  {section.content}
                </p>
              </section>
            ))}

            <section className="rounded-3xl border border-brand-primary/25 bg-brand-primary/8 p-6 sm:p-8">
              <h2 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                {t('legal.help_title')}
              </h2>
              <p className="mt-2 max-w-prose text-base leading-relaxed text-white/70">
                {t('legal.help_desc')}
              </p>
              <MarketingCTA
                to="/support"
                variant="secondary"
                size="lg"
                className="mt-5 px-8"
              >
                {t('common.footer.support')}
              </MarketingCTA>
            </section>
          </div>
        </div>
      </div>
    </MarketingPage>
  );
}
