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

// A solid colour: another colour at the given opacity over a solid
// surface, as the app's see-through fills look on it. Both are #rrggbb.
export function overSurface(
  surface: string,
  amount: number,
  colour = '#ffffff',
): string {
  const channel = (i: number) => {
    const from = Number.parseInt(surface.slice(1 + i * 2, 3 + i * 2), 16);
    const to = Number.parseInt(colour.slice(1 + i * 2, 3 + i * 2), 16);
    return Math.round(from + (to - from) * amount)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

// The panel drawn on the solid surface of the dialog that holds it, with the
// app's tokens: one surface for its body, its highlighted rows and its
// fields, so no box shows inside it; the app's subtle border, text, brand
// colours, radii and font.
export function panelsAppearance() {
  const surface = token('--surface-elevated', '#0a0a0a');
  const primary = token('--brand-primary', '#884cff');
  const radius = token('--radius-md', '12px');
  const danger = token('--brand-secondary', '#ff5757');
  const accent = token('--brand-accent', '#ff7657');
  const success = token('--close-friends', '#22c55e');
  return {
    overlays: 'dialog' as const,
    variables: {
      fontFamily: '"Inter", system-ui, Avenir, Helvetica, Arial, sans-serif',
      colorPrimary: primary,
      colorBackground: surface,
      offsetBackgroundColor: surface,
      formBackgroundColor: surface,
      colorBorder: token('--glass-border', 'rgba(255, 255, 255, 0.08)'),
      colorText: '#ffffff',
      colorSecondaryText: 'rgba(255, 255, 255, 0.6)',
      formPlaceholderTextColor: overSurface(surface, 0.4),
      colorDanger: danger,
      actionPrimaryColorText: token('--brand-primary-text', '#a97eff'),
      actionSecondaryColorText: 'rgba(255, 255, 255, 0.7)',
      buttonPrimaryColorBackground: primary,
      buttonPrimaryColorBorder: primary,
      buttonPrimaryColorText: token('--on-brand-primary', '#ffffff'),
      // The app's secondary button: white at 10% with an 8% edge.
      buttonSecondaryColorBackground: overSurface(surface, 0.1),
      buttonSecondaryColorBorder: overSurface(surface, 0.08),
      buttonSecondaryColorText: '#ffffff',
      // The app's buttons are 44 px tall.
      buttonPaddingY: '12px',
      buttonPaddingX: '16px',
      // Badges tinted like the app's: the colour at 15% on the surface.
      badgeSuccessColorBackground: overSurface(surface, 0.15, success),
      badgeSuccessColorBorder: overSurface(surface, 0.3, success),
      badgeSuccessColorText: success,
      badgeWarningColorBackground: overSurface(surface, 0.15, accent),
      badgeWarningColorBorder: overSurface(surface, 0.3, accent),
      badgeWarningColorText: accent,
      badgeDangerColorBackground: overSurface(surface, 0.15, danger),
      badgeDangerColorBorder: overSurface(surface, 0.3, danger),
      badgeDangerColorText: danger,
      badgeNeutralColorBackground: overSurface(surface, 0.1),
      badgeNeutralColorBorder: overSurface(surface, 0.12),
      badgeNeutralColorText: 'rgba(255, 255, 255, 0.7)',
      formHighlightColorBorder: primary,
      formAccentColor: primary,
      overlayBackdropColor: 'rgba(0, 0, 0, 0.6)',
      borderRadius: radius,
      buttonBorderRadius: radius,
      formBorderRadius: radius,
      badgeBorderRadius: token('--radius-sm', '8px'),
      overlayBorderRadius: token('--radius-lg', '16px'),
    },
  };
}

/**
 * One of the provider's panels where a creator keeps the tax details of
 * their own payout account: where they are based, or where they are
 * registered for VAT. Shown in a dialog of the settings, and loaded only
 * there: it brings in the provider's script. onChange runs when the creator
 * saves something in it.
 */
export default function TaxDetailsPanels({
  panel,
  onChange,
}: {
  panel: 'settings' | 'registrations';
  onChange?: () => void;
}) {
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
    <div>
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
          {panel === 'settings' ? (
            <ConnectTaxSettings
              onLoaderStart={() => setDrawn(true)}
              onLoadError={() => {
                if (!drawn) setFailed(true);
              }}
              onTaxSettingsUpdated={() => onChange?.()}
            />
          ) : (
            <ConnectTaxRegistrations
              onLoaderStart={() => setDrawn(true)}
              onLoadError={() => {
                if (!drawn) setFailed(true);
              }}
              onAfterTaxRegistrationAdded={() => onChange?.()}
              onAfterTaxRegistrationExpired={() => onChange?.()}
            />
          )}
        </ConnectComponentsProvider>
      ) : null}
    </div>
  );
}
