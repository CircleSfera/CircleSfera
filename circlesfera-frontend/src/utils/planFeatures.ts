import type { TFunction } from 'i18next';

// The name of a plan feature in the reader's language. Plans carry feature
// keys (for example `priority_support`); a key the app has no text for yet is
// shown as plain words.
export function planFeatureLabel(feature: string, t: TFunction): string {
  return t(`pricingPage.features.${feature}`, {
    defaultValue: feature.replace(/_/g, ' '),
  });
}
