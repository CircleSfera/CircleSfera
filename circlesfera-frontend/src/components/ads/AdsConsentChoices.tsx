import type { AdChoice } from '@circlesfera/shared';
import { Check, ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

// The two answers in the order the spec gives them (PD-084, section 3).
const OPTIONS: { choice: AdChoice; key: 'personalised' | 'general' }[] = [
  { choice: 'PERSONALISED', key: 'personalised' },
  { choice: 'GENERAL', key: 'general' },
];

interface AdsConsentChoicesProps {
  onChoose: (choice: AdChoice) => void;
  // The answer in force, in Settings. On the screen after sign-up nothing is
  // chosen: undefined.
  selected?: AdChoice | null;
  disabled?: boolean;
}

/**
 * The two answers to "How should your ads be chosen?", drawn exactly alike:
 * the same size, colour, weight and kind of control, one under the other on
 * a phone and side by side on a wider screen. Neither is pre-selected, and
 * neither needs a step more than the other. Under them, "What this means"
 * opens the plain explanation and the data used, in place.
 */
export default function AdsConsentChoices({
  onChoose,
  selected,
  disabled = false,
}: AdsConsentChoicesProps) {
  const { t } = useTranslation();
  const [explained, setExplained] = useState(false);
  const explanationId = useId();
  const inSettings = selected !== undefined;

  return (
    <div className="space-y-4">
      {/* auto-rows-fr: both answers as tall as the taller, stacked or not. */}
      <fieldset
        className="grid auto-rows-fr gap-3 md:grid-cols-2"
        disabled={disabled}
      >
        <legend className="sr-only">{t('adsConsent.options_label')}</legend>
        {OPTIONS.map(({ choice, key }) => {
          const isSelected = inSettings && selected === choice;
          return (
            <button
              key={choice}
              type="button"
              data-testid={`ads-consent-${key}`}
              onClick={() => onChoose(choice)}
              // Settings says which answer is in force; the first screen
              // has none, so it says nothing.
              aria-pressed={inSettings ? isSelected : undefined}
              className={`relative flex flex-col justify-start w-full min-h-24 rounded-2xl border p-4 pr-12 text-left transition-colors bg-white/5 hover:bg-white/10 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 ${
                isSelected ? 'border-brand-primary' : 'border-white/15'
              }`}
            >
              <span className="block text-base font-semibold text-white leading-snug">
                {t(`adsConsent.${key}.label`)}
              </span>
              <span className="block mt-1 text-sm text-white/65 leading-relaxed">
                {t(`adsConsent.${key}.hint`)}
              </span>
              {isSelected ? (
                <span
                  className="absolute top-4 right-4 flex items-center justify-center w-6 h-6 rounded-full bg-brand-primary text-white"
                  aria-hidden
                >
                  <Check size={14} />
                </span>
              ) : null}
            </button>
          );
        })}
      </fieldset>

      <div>
        <button
          type="button"
          onClick={() => setExplained((open) => !open)}
          aria-expanded={explained}
          aria-controls={explanationId}
          className="inline-flex items-center gap-1 min-h-11 text-sm font-medium text-brand-primary-text underline underline-offset-4"
        >
          {t('adsConsent.what_this_means')}
          <ChevronDown
            size={16}
            aria-hidden
            className={`transition-transform ${explained ? 'rotate-180' : ''}`}
          />
        </button>
        {explained ? (
          <AdsConsentExplanation
            id={explanationId}
            onClose={() => setExplained(false)}
          />
        ) : null}
      </div>
    </div>
  );
}

function AdsConsentExplanation({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const general = ['topic', 'city', 'language', 'time', 'interests'];
  const personalised = ['activity', 'audiences'];
  const never = ['sensitive', 'minors'];

  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="mt-2 rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4 text-sm text-white/75 leading-relaxed"
    >
      <h2 id={`${id}-title`} className="text-base font-semibold text-white">
        {t('adsConsent.explain.title')}
      </h2>
      <p>{t('adsConsent.explain.intro')}</p>
      <div>
        <h3 className="font-semibold text-white">
          {t('adsConsent.explain.general_title')}
        </h3>
        <p className="mt-1">{t('adsConsent.explain.general_text')}</p>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          {general.map((item) => (
            <li key={item}>{t(`adsConsent.explain.general_items.${item}`)}</li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="font-semibold text-white">
          {t('adsConsent.explain.personalised_title')}
        </h3>
        <p className="mt-1">{t('adsConsent.explain.personalised_text')}</p>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          {personalised.map((item) => (
            <li key={item}>
              {t(`adsConsent.explain.personalised_items.${item}`)}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="font-semibold text-white">
          {t('adsConsent.explain.never_title')}
        </h3>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          {never.map((item) => (
            <li key={item}>{t(`adsConsent.explain.never_items.${item}`)}</li>
          ))}
        </ul>
      </div>
      <p>{t('adsConsent.explain.change')}</p>
      <button
        type="button"
        onClick={onClose}
        className="min-h-11 px-4 rounded-xl border border-white/15 bg-white/5 text-sm font-medium text-white hover:bg-white/10"
      >
        {t('adsConsent.explain.close')}
      </button>
    </section>
  );
}
