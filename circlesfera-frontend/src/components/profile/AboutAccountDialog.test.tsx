import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import AboutAccountDialog, {
  aboutAccountFromProfile,
} from './AboutAccountDialog';

describe('aboutAccountFromProfile', () => {
  it('returns null without a username', () => {
    expect(aboutAccountFromProfile(null)).toBeNull();
    expect(aboutAccountFromProfile({})).toBeNull();
  });

  it('maps joined, email and identity from nested user fields', () => {
    expect(
      aboutAccountFromProfile({
        username: 'alice',
        fullName: 'Alice Doe',
        user: {
          createdAt: '2026-01-15T00:00:00.000Z',
          emailVerified: '2026-01-16T00:00:00.000Z',
        },
        identityVerifiedAt: '2026-01-17T00:00:00.000Z',
      }),
    ).toEqual({
      username: 'alice',
      fullName: 'Alice Doe',
      avatar: undefined,
      joinedAt: '2026-01-15T00:00:00.000Z',
      emailConfirmed: true,
      identityVerified: true,
      accountType: null,
      signupCountry: null,
      strikeCount: 0,
      botLabeled: false,
      lastActiveBucket: undefined,
      accountStanding: undefined,
      verificationLevel: null,
    });
  });
});

describe('AboutAccountDialog', () => {
  const onClose = vi.fn();

  it('renders nothing when closed', () => {
    renderWithProviders(
      <AboutAccountDialog
        isOpen={false}
        onClose={onClose}
        account={{ username: 'alice' }}
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows mapped fields, country, strikes and the bot label', () => {
    const { i18n } = renderWithProviders(
      <AboutAccountDialog
        isOpen
        onClose={onClose}
        account={{
          username: 'alice',
          fullName: 'Alice Doe',
          joinedAt: '2026-01-01T00:00:00.000Z',
          emailConfirmed: true,
          identityVerified: false,
          accountType: 'CREATOR',
          signupCountry: 'ES',
          lastActiveBucket: 'today',
          accountStanding: 'ok',
          strikeCount: 2,
          botLabeled: true,
        }}
      />,
    );

    expect(
      screen.getByText(i18n!.t('profile.about.title')),
    ).toBeInTheDocument();
    expect(screen.getByText('Alice Doe')).toBeInTheDocument();
    expect(screen.getByText('@alice')).toBeInTheDocument();
    expect(screen.getByText('January 2026')).toBeInTheDocument();
    expect(screen.getByText(i18n!.t('profile.about.yes'))).toBeInTheDocument();
    expect(screen.getByText(i18n!.t('profile.about.no'))).toBeInTheDocument();
    expect(screen.getByText('creator')).toBeInTheDocument();
    expect(screen.getByText('ES')).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('profile.about.activity.today')),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('profile.about.in_good_standing')),
    ).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('profile.about.bot_label')),
    ).toBeInTheDocument();
  });

  it('marks a suspended account and closes from the dialog X', () => {
    const { i18n } = renderWithProviders(
      <AboutAccountDialog
        isOpen
        onClose={onClose}
        account={{
          username: 'alice',
          accountStanding: 'suspended',
        }}
      />,
    );

    expect(
      screen.getByText(i18n!.t('profile.about.suspended')),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows Spanish about title when locale is es', () => {
    const { i18n } = renderWithProviders(
      <AboutAccountDialog
        isOpen
        onClose={onClose}
        account={{ username: 'alice' }}
      />,
      { lng: 'es' },
    );

    expect(
      screen.getByText(i18n!.t('profile.about.title')),
    ).toBeInTheDocument();
    expect(i18n!.t('profile.about.title')).not.toBe('About this account');
    expect(screen.queryByText('About this account')).not.toBeInTheDocument();
  });
});
