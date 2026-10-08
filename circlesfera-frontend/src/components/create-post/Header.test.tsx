import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createTestI18n, renderWithProviders } from '../../test/test-utils';
import Header from './Header';

describe('Header density', () => {
  it('uses the glass header with 44 px touch targets', () => {
    const i18n = createTestI18n('es');
    const { container } = renderWithProviders(
      <Header
        onBack={vi.fn()}
        onNext={vi.fn()}
        title={i18n.t('createPost.header.new_post')}
        nextLabel={i18n.t('createPost.header.next')}
        isPending={false}
        canNext
      />,
      { i18n },
    );

    const header = container.querySelector('header');
    expect(header?.className).toMatch(/min-h-13/);

    const back = screen.getByRole('button', {
      name: i18n.t('createPost.header.back'),
    });
    expect(back.className).toMatch(/min-h-11/);
    expect(back.className).toMatch(/min-w-11/);

    const next = screen.getByRole('button', {
      name: i18n.t('createPost.header.next'),
    });
    expect(next.className).toMatch(/min-h-11/);
  });

  it('keeps the share button at the same 44 px when sharing', () => {
    const i18n = createTestI18n('es');
    renderWithProviders(
      <Header
        onBack={vi.fn()}
        onNext={vi.fn()}
        title={i18n.t('createPost.header.new_post')}
        nextLabel={i18n.t('createPost.header.share')}
        isPending={false}
        canNext
      />,
      { i18n },
    );

    const share = screen.getByRole('button', {
      name: i18n.t('createPost.header.share'),
    });
    expect(share.className).toMatch(/min-h-11/);
    expect(share.className).toMatch(/from-brand-primary/);
  });
});
