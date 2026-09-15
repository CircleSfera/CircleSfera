import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import SettingsShell from './SettingsShell';

describe('SettingsShell i18n', () => {
  it('titles the profile section from the EN catalog', () => {
    const { i18n } = renderWithProviders(
      <SettingsShell section="profile">
        <p>body</p>
      </SettingsShell>,
    );

    expect(
      screen.getByRole('heading', {
        name: i18n!.t('settings.tabs.profile.label'),
      }),
    ).toBeInTheDocument();
    expect(i18n!.t('settings.tabs.profile.label')).toBe('Profile');
    expect(screen.queryByText('Perfil')).not.toBeInTheDocument();
  });

  it('uses Spanish section titles when locale is es', () => {
    const { i18n } = renderWithProviders(
      <SettingsShell section="profile">
        <p>body</p>
      </SettingsShell>,
      { lng: 'es' },
    );

    expect(
      screen.getByRole('heading', {
        name: i18n!.t('settings.tabs.profile.label'),
      }),
    ).toBeInTheDocument();
    expect(i18n!.t('settings.tabs.profile.label')).toBe('Perfil');
    expect(screen.queryByText('Profile')).not.toBeInTheDocument();
  });
});
