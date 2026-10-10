import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi } from '../../services/auth.service';
import { renderWithProviders } from '../../test/test-utils';
import { ActiveSessionsSettings } from './ActiveSessionsSettings';

vi.mock('../../services/auth.service', () => ({
  authApi: {
    getSessions: vi.fn(),
    revokeSession: vi.fn(),
    revokeOtherSessions: vi.fn(),
  },
}));
vi.mock('../../utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const api = vi.mocked(authApi);
const session = (id: string, over: object = {}) => ({
  id,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  ipAddress: '203.0.113.7',
  createdAt: '2026-03-01T10:00:00Z',
  expiresAt: '2026-04-01T10:00:00Z',
  ...over,
});
const rows = () =>
  screen
    .getAllByText(/^IP: /)
    .map((el) => el.closest('.rounded-xl') as HTMLElement);
const show = () => renderWithProviders(<ActiveSessionsSettings />);

describe('ActiveSessionsSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getSessions.mockResolvedValue({ data: [] } as never);
    api.revokeSession.mockResolvedValue({} as never);
    api.revokeOtherSessions.mockResolvedValue({} as never);
  });

  it('says it is loading, then that there is nothing else open', async () => {
    show();

    expect(screen.getByText('Loading active sessions...')).toBeInTheDocument();
    expect(
      await screen.findByText('No additional active sessions at this time.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Log out other sessions' }),
    ).not.toBeInTheDocument();
  });

  it('takes an answer that is not a list as a failed load, not as no sessions', async () => {
    api.getSessions.mockResolvedValue({ data: { oops: true } } as never);
    show();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your sessions could not be loaded. Try again.',
    );
    expect(
      screen.queryByText('No additional active sessions at this time.'),
    ).not.toBeInTheDocument();
  });

  it('says so when the sessions could not be loaded', async () => {
    api.getSessions.mockRejectedValue(new Error('down'));
    show();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your sessions could not be loaded. Try again.',
    );
  });

  it('names each device from what its browser says', async () => {
    api.getSessions.mockResolvedValue({
      data: [
        session('1'),
        session('2', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17)' }),
        session('3', { userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile' }),
        session('4', { userAgent: 'Mozilla/5.0 (Windows NT 10.0)' }),
        session('5', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' }),
        session('6', { userAgent: 'curl/8.0' }),
        session('7', { userAgent: undefined, ipAddress: undefined }),
      ],
    } as never);
    show();

    await waitFor(() => expect(rows()).toHaveLength(7));
    const names = [
      'Mac desktop',
      'iPhone (Safari Mobile)',
      'Android device',
      'Windows desktop',
      'Linux desktop',
      'Web browser',
      'Device',
    ];
    rows().forEach((row, index) => {
      expect(within(row).getByText(names[index])).toBeInTheDocument();
    });
    expect(within(rows()[0]).getByText('IP: 203.0.113.7')).toBeInTheDocument();
    // An address that is not known is not made up.
    expect(within(rows()[6]).getByText('IP: —')).toBeInTheDocument();
  });

  it('marks the first session as this device and offers to close only the others', async () => {
    api.getSessions.mockResolvedValue({
      data: [session('1'), session('2')],
    } as never);
    show();

    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(within(rows()[0]).getByText('This device')).toBeInTheDocument();
    expect(within(rows()[0]).queryByRole('button')).toBeNull();
    expect(within(rows()[1]).queryByText('This device')).toBeNull();
    expect(
      within(rows()[1]).getByRole('button', { name: 'Log out this session' }),
    ).toBeInTheDocument();
  });

  it('closes one session and takes it off the list', async () => {
    api.getSessions.mockResolvedValue({
      data: [session('1'), session('2'), session('3')],
    } as never);
    show();

    await waitFor(() => expect(rows()).toHaveLength(3));
    fireEvent.click(within(rows()[1]).getByRole('button'));

    await waitFor(() => expect(api.revokeSession).toHaveBeenCalledWith('2'));
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(api.getSessions).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says so and keeps the session listed when it could not be closed', async () => {
    api.getSessions.mockResolvedValue({
      data: [session('1'), session('2')],
    } as never);
    api.revokeSession.mockRejectedValueOnce(new Error('no'));
    show();

    await waitFor(() => expect(rows()).toHaveLength(2));
    fireEvent.click(within(rows()[1]).getByRole('button'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The session could not be closed. Try again.',
    );
    expect(rows()).toHaveLength(2);

    // Trying again clears the message.
    fireEvent.click(within(rows()[1]).getByRole('button'));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('closes the other sessions at once and reads the list again', async () => {
    api.getSessions.mockResolvedValue({
      data: [session('1'), session('2'), session('3')],
    } as never);
    show();

    await waitFor(() => expect(rows()).toHaveLength(3));
    api.getSessions.mockResolvedValue({ data: [session('1')] } as never);
    fireEvent.click(
      screen.getByRole('button', { name: 'Log out other sessions' }),
    );

    await waitFor(() => expect(api.revokeOtherSessions).toHaveBeenCalled());
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(
      screen.queryByRole('button', { name: 'Log out other sessions' }),
    ).not.toBeInTheDocument();
  });

  it('does not offer to close the others over a list it could not read again', async () => {
    api.getSessions.mockResolvedValue({
      data: [session('1'), session('2')],
    } as never);
    show();

    await waitFor(() => expect(rows()).toHaveLength(2));
    api.getSessions.mockRejectedValue(new Error('down'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Log out other sessions' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your sessions could not be loaded. Try again.',
    );
    expect(screen.queryByText(/^IP: /)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Log out other sessions' }),
    ).not.toBeInTheDocument();
  });

  it('says so when the other sessions could not be closed', async () => {
    api.getSessions.mockResolvedValue({
      data: [session('1'), session('2')],
    } as never);
    api.revokeOtherSessions.mockRejectedValue(new Error('no'));
    show();

    await waitFor(() => expect(rows()).toHaveLength(2));
    const all = screen.getByRole('button', { name: 'Log out other sessions' });
    fireEvent.click(all);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The session could not be closed. Try again.',
    );
    await waitFor(() => expect(all).toBeEnabled());
    expect(rows()).toHaveLength(2);
  });
});
