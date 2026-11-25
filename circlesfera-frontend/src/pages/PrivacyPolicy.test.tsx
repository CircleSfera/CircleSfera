import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import en from '../locales/en.json';
import es from '../locales/es.json';
import { renderWithProviders } from '../test/test-utils';
import PrivacyPolicy from './PrivacyPolicy';

const SECTION_COUNT = 9;

describe('PrivacyPolicy', () => {
  it('shows every section of the policy', async () => {
    const { i18n } = renderWithProviders(<PrivacyPolicy />);

    for (let i = 1; i <= SECTION_COUNT; i++) {
      expect(
        (
          await screen.findAllByText(
            // The page shows the number of a section apart from its title.
            i18n!
              .t(`legal.privacy.sections.s${i}_title`)
              .replace(/^\d+\.\s*/, ''),
          )
        ).length,
      ).toBeGreaterThan(0);
    }
  });

  it.each([
    ['es', es],
    ['en', en],
  ])(
    'the %s policy has no unfilled placeholders and covers automated decisions',
    (_lang, locale) => {
      const sections = locale.legal.privacy.sections as Record<string, string>;
      const text = Object.values(sections).join('\n');

      expect(Object.keys(sections)).toHaveLength(SECTION_COUNT * 2);
      expect(text).not.toMatch(/\[[^\]]+\]|\{\{/);
      expect(text).toMatch(/72/);
      expect(text).toContain('legal@circlesfera.com');
    },
  );

  // Owner-approved wording, 2026-11-25 (BD-034): a founding creator with no
  // address gives Stripe the IP address of the connection, only to place
  // the VAT; Stripe's review of the platform no longer claims it never sees
  // an IP address.
  it('says what IP address a founding creator gives Stripe, and what Stripe does not see in its review', () => {
    expect(es.legal.privacy.sections.s2_content).toContain(
      '• Pagos: si compras un plan o una promoción, los identificadores de Stripe y el historial de pagos. Los datos de tu tarjeta los gestiona Stripe; nosotros no los vemos. Si eres creador fundador y Stripe no tiene tu dirección, al empezar tu año gratis le enviamos la dirección IP de tu conexión, solo para saber en qué país calcular el IVA.\n',
    );
    expect(es.legal.privacy.sections.s5_content).toContain(
      'para cumplir sus obligaciones como proveedor de pagos. En esa revisión no ve tu correo ni tus mensajes. No vendemos tus datos.',
    );
    expect(es.legal.privacy.sections.s5_content).not.toContain('dirección IP');
    expect(en.legal.privacy.sections.s2_content).toContain(
      'we send it the IP address of your connection, only to know which country to work out the VAT for.',
    );
    expect(en.legal.privacy.sections.s5_content).toContain(
      'In that review it does not see your email or your messages.',
    );
    expect(en.legal.privacy.sections.s5_content).not.toContain('IP address');
  });
});
