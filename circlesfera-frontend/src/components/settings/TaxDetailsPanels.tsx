import {
  loadConnectAndInitialize,
  type StripeConnectInstance,
} from '@stripe/connect-js/pure';
import {
  ConnectComponentsProvider,
  ConnectTaxRegistrations,
  ConnectTaxSettings,
} from '@stripe/react-connect-js';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { monetizationApi } from '../../services/monetization.service';
import { LoadingSpinner } from '../LoadingStates';
import { Button } from '../ui';

// The provider's panels speak the app's language.
export function panelsLocale(language: string | undefined): string {
  return language?.startsWith('es') ? 'es-ES' : 'en-GB';
}

// A colour of the app's theme, as index.css defines it.
function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

// The panels drawn in the app's dark theme. The font and the background come
// from the page around them.
export function panelsAppearance() {
  const primary = token('--brand-primary', '#884cff');
  const raised = token('--surface-raised', '#1c1c1c');
  const high = token('--surface-high', '#262626');
  return {
    overlays: 'dialog' as const,
    variables: {
      colorPrimary: primary,
      colorBackground: token('--surface-elevated', '#0a0a0a'),
      colorText: '#fafafa',
      colorSecondaryText: '#999999',
      colorBorder: high,
      colorDanger: token('--brand-secondary', '#ff5757'),
      actionPrimaryColorText: token('--brand-primary-text', '#a97eff'),
      buttonPrimaryColorBackground: primary,
      buttonPrimaryColorBorder: primary,
      buttonPrimaryColorText: token('--on-brand-primary', '#ffffff'),
      buttonSecondaryColorBackground: raised,
      buttonSecondaryColorBorder: high,
      buttonSecondaryColorText: '#fafafa',
      offsetBackgroundColor: raised,
      formBackgroundColor: raised,
      formHighlightColorBorder: primary,
      formAccentColor: primary,
      borderRadius: '12px',
    },
  };
}

/**
 * The provider's panels where a creator keeps the tax details of their own
 * payout account: where they are based, and where they are registered for
 * VAT. Loaded only where it is shown: it brings in the provider's script.
 */
export default function TaxDetailsPanels() {
  const { t, i18n } = useTranslation();
  const [connect, setConnect] = useState<StripeConnectInstance | null>(null);
  const [failed, setFailed] = useState(false);
  // A panel the provider draws says by itself when it fails afterwards.
  const [drawn, setDrawn] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new attempt starts again; the language is applied below.
  useEffect(() => {
    let current = true;
    setFailed(false);
    setConnect(null);
    setDrawn(false);
    monetizationApi
      .createTaxDetailsSession()
      .then(({ clientSecret, publishableKey }) => {
        if (!current) return;
        // The first secret is the one just received; the provider asks for
        // a new one when it expires.
        let first: string | null = clientSecret;
        setConnect(
          loadConnectAndInitialize({
            publishableKey,
            fetchClientSecret: async () => {
              if (first) {
                const secret = first;
                first = null;
                return secret;
              }
              return (await monetizationApi.createTaxDetailsSession())
                .clientSecret;
            },
            appearance: panelsAppearance(),
            locale: panelsLocale(i18n.language),
          }),
        );
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [attempt]);

  useEffect(() => {
    connect?.update({ locale: panelsLocale(i18n.language) });
  }, [connect, i18n.language]);

  if (failed) {
    return (
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-xs text-white/60 leading-relaxed" role="alert">
          {t('settings.monetization.tax.error')}
        </p>
        <Button
          type="button"
          variant="outline"
          size="md"
          onClick={() => setAttempt((n) => n + 1)}
          className="shrink-0"
        >
          {t('settings.monetization.tax.retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {!drawn ? (
        <div
          className="flex justify-center py-8"
          aria-label={t('settings.monetization.tax.loading')}
          role="status"
        >
          <LoadingSpinner size="sm" />
        </div>
      ) : null}
      {connect ? (
        <ConnectComponentsProvider connectInstance={connect}>
          <ConnectTaxSettings
            onLoaderStart={() => setDrawn(true)}
            onLoadError={() => {
              if (!drawn) setFailed(true);
            }}
          />
          <div className="mt-6">
            <ConnectTaxRegistrations />
          </div>
        </ConnectComponentsProvider>
      ) : null}
    </div>
  );
}
