import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/test-utils';
import Notifications from './Notifications';

vi.mock('../services', () => ({
  notificationsApi: {
    getAll: vi.fn(),
    markAllAsRead: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../components/notifications/PendingFollowRequests', () => ({
  default: () => null,
}));

import { notificationsApi } from '../services';

// Notices are created and rendered at the same frozen instant, so the
// relative time never depends on how long the test takes.
const NOW = new Date('2026-11-03T12:00:00.000Z');

const notice = (overrides: Record<string, unknown>) => ({
  id: 'n-1',
  recipientId: 'p-1',
  senderId: 'p-2',
  sender: { username: 'ana', avatar: null },
  read: false,
  createdAt: NOW.toISOString(),
  ...overrides,
});

const show = (items: object[]) =>
  vi.mocked(notificationsApi.getAll).mockResolvedValue({
    data: { data: items },
  } as never);

describe('Notifications written for the reader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows payment notices, which the server writes in the reader language', async () => {
    show([
      notice({
        type: 'PAYMENT',
        content: 'te ha enviado una propina de 12,50 €',
      }),
    ]);

    renderWithProviders(<Notifications />, { lng: 'es' });

    expect(
      await screen.findByText('te ha enviado una propina de 12,50 €'),
    ).toBeInTheDocument();
  });

  it.each([
    ['en', 'now'],
    ['es', 'ahora'],
  ] as const)('a fresh notice reads "just now" in %s', async (lng, label) => {
    show([notice({ type: 'FOLLOW', content: '' })]);

    renderWithProviders(<Notifications />, { lng });

    expect(await screen.findByText(label)).toBeInTheDocument();
  });

  it('older notices show the date in the reader language', async () => {
    show([
      notice({
        type: 'FOLLOW',
        content: '',
        createdAt: '2026-03-05T10:00:00.000Z',
      }),
    ]);

    renderWithProviders(<Notifications />, { lng: 'es' });

    expect(await screen.findByText(/5 mar/)).toBeInTheDocument();
  });

  it('a bot label notice links to the bot label appeal', async () => {
    show([
      notice({
        type: 'MODERATION',
        sender: null,
        senderId: null,
        content: 'Tras una revisión del equipo, tu cuenta se ha marcado…',
        targetType: 'account_bot_label',
      }),
    ]);

    const { i18n } = renderWithProviders(<Notifications />);

    expect(
      await screen.findByRole('link', {
        name: i18n!.t('notifications.appeal_cta'),
      }),
    ).toHaveAttribute('href', '/accounts/appeals?targetType=BOT_LABEL');
  });

  it('shows an answer of support as coming from Support, with the way to the request', async () => {
    show([
      notice({
        type: 'SYSTEM',
        senderId: null,
        sender: null,
        content: 'ha respondido a tu solicitud «Me han cobrado dos veces»',
        targetType: 'support_ticket',
        targetId: 't-1',
      }),
    ]);

    renderWithProviders(<Notifications />, { lng: 'es' });

    expect(
      await screen.findByText(
        'ha respondido a tu solicitud «Me han cobrado dos veces»',
      ),
    ).toBeInTheDocument();
    const from = screen.getByRole('link', { name: 'Soporte' });
    expect(from).toHaveAttribute('href', '/support/requests/t-1');
    for (const link of screen.getAllByRole('link', {
      name: 'Ver la solicitud',
    })) {
      expect(link).toHaveAttribute('href', '/support/requests/t-1');
    }
    // Nobody unknown: the notice does not come from a profile.
    expect(screen.queryByText('Desconocido')).not.toBeInTheDocument();
    // Nor is its picture described as an unknown person's.
    expect(document.body.innerHTML).not.toContain('Desconocido');
  });
});
