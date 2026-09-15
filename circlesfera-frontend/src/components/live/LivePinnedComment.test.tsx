import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import LivePinnedComment from './LivePinnedComment';

describe('LivePinnedComment', () => {
  it('labels pin state from the catalog', () => {
    const { i18n } = renderWithProviders(
      <LivePinnedComment
        pinnedComment={{
          commentId: 'c1',
          message: 'Hello live',
          username: 'alice',
        }}
        canUnpin
        onUnpin={vi.fn()}
      />,
    );

    expect(
      screen.getByText(new RegExp(i18n!.t('live.pinned'))),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n!.t('live.unpin') }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Fijado')).not.toBeInTheDocument();
  });

  it('uses Spanish pin labels', () => {
    const { i18n } = renderWithProviders(
      <LivePinnedComment
        pinnedComment={{
          commentId: 'c1',
          message: 'Hola',
          username: 'alice',
        }}
        canUnpin
        onUnpin={vi.fn()}
      />,
      { lng: 'es' },
    );

    expect(i18n!.t('live.pinned')).toBe('Fijado');
    expect(
      screen.getByText(new RegExp(i18n!.t('live.pinned'))),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n!.t('live.unpin') }),
    ).toBeInTheDocument();
  });
});
