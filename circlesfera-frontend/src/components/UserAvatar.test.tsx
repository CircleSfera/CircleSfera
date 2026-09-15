import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/test-utils';
import UserAvatar from './UserAvatar';

const CLOUDINARY = 'https://res.cloudinary.com/demo/image/upload/v1/sample.jpg';

describe('UserAvatar', () => {
  it('puts the passed alt on the real image', () => {
    renderWithProviders(<UserAvatar src="/uploads/alice.jpg" alt="alice" />);

    expect(screen.getByAltText('alice')).toBeInTheDocument();
  });

  it('keeps the Cloudinary blur placeholder decorative', () => {
    const { container } = renderWithProviders(
      <UserAvatar src={CLOUDINARY} alt="alice" />,
    );

    const images = container.querySelectorAll('img');
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute('alt', '');
    expect(images[0]).toHaveAttribute('aria-hidden');
    expect(images[1]).toHaveAttribute('alt', 'alice');
  });

  it('labels the profile button from the catalog', () => {
    const { i18n } = renderWithProviders(
      <UserAvatar alt="alice" onClick={vi.fn()} />,
    );

    expect(i18n!.t('common.view_profile', { username: 'alice' })).toBe(
      "View alice's profile",
    );
    expect(
      screen.getByRole('button', {
        name: i18n!.t('common.view_profile', { username: 'alice' }),
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Ver perfil de alice' }),
    ).not.toBeInTheDocument();
  });

  it('uses the Spanish profile button label', () => {
    const { i18n } = renderWithProviders(
      <UserAvatar alt="alice" onClick={vi.fn()} />,
      { lng: 'es' },
    );

    expect(i18n!.t('common.view_profile', { username: 'alice' })).toBe(
      'Ver perfil de alice',
    );
    expect(
      screen.getByRole('button', {
        name: i18n!.t('common.view_profile', { username: 'alice' }),
      }),
    ).toBeInTheDocument();
  });
});
