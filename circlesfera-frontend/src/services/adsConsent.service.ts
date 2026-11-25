import type {
  AdChoice,
  AdConsentSource,
  AdConsentStatus,
} from '@circlesfera/shared';
import { AD_CONSENT_TEXT_VERSION } from '@circlesfera/shared';
import { toAppLocale } from '../utils/appLocale';
import { apiClient } from './api';

// The person's answer to "How should your ads be chosen?" (PD-084). The
// server keeps every answer with the version and language of the texts shown,
// as proof, and enforces the rules (no one under 18 gets personalised ads).
export const adsConsentApi = {
  status: () =>
    apiClient
      .get<AdConsentStatus>('users/me/ads-consent')
      .then((response) => response.data),
  answer: (choice: AdChoice, source: AdConsentSource, language: string) =>
    apiClient
      .put<AdConsentStatus>('users/me/ads-consent', {
        choice,
        source,
        // The texts this build shows, in the language they were shown in.
        textVersion: AD_CONSENT_TEXT_VERSION,
        locale: toAppLocale(language),
      })
      .then((response) => response.data),
};

export const ADS_CONSENT_QUERY_KEY = ['ads-consent'] as const;
