import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

export const FAQ_KEYS = [
  'free',
  'verify',
  'control',
  'mobile',
  'plans',
  'support',
] as const;

/**
 * Accordion FAQ — used on /faq.
 */
export function ProductFaqList() {
  const { t } = useTranslation();

  return (
    <div className="glass-panel rounded-xl overflow-hidden divide-y divide-white/8">
      {FAQ_KEYS.map((key) => (
        <FAQItem
          key={key}
          question={t(`landing.faq.items.${key}.q`)}
          answer={t(`landing.faq.items.${key}.a`)}
        />
      ))}
    </div>
  );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();
  const buttonId = useId();

  return (
    <div>
      <button
        type="button"
        id={buttonId}
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="w-full min-h-12 px-4 sm:px-5 py-4 text-left flex justify-between items-center gap-3 hover:bg-white/4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary/50"
      >
        <span className="font-semibold text-sm sm:text-base text-white/90">
          {question}
        </span>
        <ChevronDown
          className={`w-5 h-5 text-white/45 shrink-0 transition-transform motion-reduce:transition-none ${isOpen ? 'rotate-180 text-brand-primary' : ''}`}
          aria-hidden
        />
      </button>
      {isOpen && (
        <section
          id={panelId}
          aria-labelledby={buttonId}
          className="px-4 sm:px-5 pb-4 text-sm sm:text-base text-white/55 leading-relaxed"
        >
          {answer}
        </section>
      )}
    </div>
  );
}
