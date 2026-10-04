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
            i18n!.t(`legal.privacy.sections.s${i}_title`),
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
});
