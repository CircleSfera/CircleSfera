import type { BusinessPlace } from '@circlesfera/shared';
import { Briefcase, Mail, MapPin, Phone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

interface BusinessDetailsProps {
  category?: string | null;
  email?: string | null;
  phone?: string | null;
  place?: BusinessPlace | null;
}

const ACTION_CLASS =
  'h-11 px-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-white transition-colors hover:bg-white/10';

/**
 * How a Business Profile presents itself: its kind of business, its address
 * linked to the place's page, and buttons to call or email it. The server
 * sends them only for a Business Profile; nothing shows when none is set.
 */
export default function BusinessDetails({
  category,
  email,
  phone,
  place,
}: BusinessDetailsProps) {
  const { t } = useTranslation();
  if (!category && !email && !phone && !place) return null;

  return (
    <div className="mt-3 space-y-3">
      {(category || place) && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs md:text-sm font-medium">
          {category && (
            <span className="flex items-center gap-2 text-zinc-300">
              <Briefcase
                size={16}
                className="text-brand-primary-text"
                aria-hidden="true"
              />
              {t(`profile.business.categories.${category}`)}
            </span>
          )}
          {place && (
            <Link
              to={`/explore/places/${place.id}`}
              className="min-h-11 flex items-center gap-2 text-zinc-300 hover:text-white transition-colors"
            >
              <MapPin
                size={16}
                className="text-brand-secondary shrink-0"
                aria-hidden="true"
              />
              <span className="underline decoration-white/10 underline-offset-4">
                {place.fullName || place.name}
              </span>
            </Link>
          )}
        </div>
      )}
      {(phone || email) && (
        <div className="flex flex-wrap gap-2">
          {phone && (
            <a
              href={`tel:${phone}`}
              className={ACTION_CLASS}
              aria-label={t('profile.business.call_aria', { phone })}
            >
              <Phone size={16} aria-hidden="true" />
              {t('profile.business.call')}
            </a>
          )}
          {email && (
            <a
              href={`mailto:${email}`}
              className={ACTION_CLASS}
              aria-label={t('profile.business.email_aria', { email })}
            >
              <Mail size={16} aria-hidden="true" />
              {t('profile.business.email')}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
