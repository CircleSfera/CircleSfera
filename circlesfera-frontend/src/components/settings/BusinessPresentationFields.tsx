import {
  BUSINESS_CATEGORIES,
  BUSINESS_CONTACT_EMAIL_MAX,
  BUSINESS_CONTACT_PHONE_PATTERN,
} from '@circlesfera/shared';
import { MapPin, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import LocationSubScreen, {
  type PlaceSelection,
} from '../create-post/LocationSubScreen';
import { Input } from '../ui';

/** A phone number as the server takes it: the digits after a +. */
export function normalizeContactPhone(value: string): string {
  return value.replace(/[\s().-]/g, '');
}

export function isValidContactPhone(value: string): boolean {
  return BUSINESS_CONTACT_PHONE_PATTERN.test(normalizeContactPhone(value));
}

interface BusinessPresentationFieldsProps {
  category: string;
  onCategoryChange: (value: string) => void;
  email: string;
  onEmailChange: (value: string) => void;
  phone: string;
  onPhoneChange: (value: string) => void;
  /** The address shown, or empty when there is none. */
  placeLabel: string;
  onPlaceSelect: (selection: PlaceSelection) => void;
  onPlaceClear: () => void;
}

/**
 * The details a Business Profile presents itself with: its category, its
 * contact email and phone, and its address chosen with the place search.
 */
export default function BusinessPresentationFields({
  category,
  onCategoryChange,
  email,
  onEmailChange,
  phone,
  onPhoneChange,
  placeLabel,
  onPlaceSelect,
  onPlaceClear,
}: BusinessPresentationFieldsProps) {
  const { t } = useTranslation();
  const [choosingPlace, setChoosingPlace] = useState(false);
  const phoneInvalid = phone.trim() !== '' && !isValidContactPhone(phone);

  return (
    <div className="p-4 space-y-4">
      <p className="text-sm text-white/60">
        {t('settings.profile.business.hint')}
      </p>

      <div className="space-y-1.5">
        <label
          htmlFor="businessCategory"
          className="block text-xs font-bold text-gray-400/80 uppercase tracking-widest mb-1 px-0.5"
        >
          {t('settings.profile.business.category')}
        </label>
        <select
          id="businessCategory"
          value={category}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"
        >
          <option value="">{t('settings.profile.business.no_category')}</option>
          {BUSINESS_CATEGORIES.map((key) => (
            <option key={key} value={key}>
              {t(`profile.business.categories.${key}`)}
            </option>
          ))}
        </select>
      </div>

      <Input
        id="contactEmail"
        label={t('settings.profile.business.email')}
        type="email"
        inputMode="email"
        autoComplete="email"
        maxLength={BUSINESS_CONTACT_EMAIL_MAX}
        value={email}
        onChange={(e) => onEmailChange(e.target.value)}
        placeholder={t('settings.profile.business.email_placeholder')}
      />

      <div className="space-y-1.5">
        <Input
          id="contactPhone"
          label={t('settings.profile.business.phone')}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
          placeholder="+34 600 000 000"
          aria-invalid={phoneInvalid}
          aria-describedby="contactPhone-hint"
        />
        <p
          id="contactPhone-hint"
          className={`text-xs ${phoneInvalid ? 'text-brand-secondary' : 'text-white/40'}`}
        >
          {t('settings.profile.business.phone_hint')}
        </p>
      </div>

      <div className="space-y-1.5">
        <span className="block text-xs font-bold text-gray-400/80 uppercase tracking-widest mb-1 px-0.5">
          {t('settings.profile.business.address')}
        </span>
        {placeLabel ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setChoosingPlace(true)}
              className="min-h-12 flex flex-1 min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-left text-sm text-white"
            >
              <MapPin
                size={16}
                className="shrink-0 text-brand-secondary"
                aria-hidden
              />
              <span className="truncate">{placeLabel}</span>
            </button>
            <button
              type="button"
              onClick={onPlaceClear}
              aria-label={t('settings.profile.business.remove_address')}
              className="h-11 w-11 shrink-0 flex items-center justify-center rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setChoosingPlace(true)}
            className="min-h-12 w-full flex items-center gap-2 rounded-xl border border-dashed border-white/15 px-4 text-sm font-semibold text-white/80 hover:bg-white/5"
          >
            <MapPin size={16} aria-hidden />
            {t('settings.profile.business.add_address')}
          </button>
        )}
      </div>

      {choosingPlace && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/70 md:items-center md:p-6">
          <div className="relative flex w-full flex-col overflow-hidden md:h-[min(640px,90vh)] md:max-w-md md:rounded-2xl">
            <LocationSubScreen
              currentLocation={placeLabel}
              onClose={() => setChoosingPlace(false)}
              onSelect={(selection) => {
                onPlaceSelect(selection);
                setChoosingPlace(false);
              }}
              onClear={
                placeLabel
                  ? () => {
                      onPlaceClear();
                      setChoosingPlace(false);
                    }
                  : undefined
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
