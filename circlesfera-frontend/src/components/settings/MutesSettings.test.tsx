import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { followsApi } from '../../services';
import { renderWithProviders } from '../../test/test-utils';
import MutesSettings from './MutesSettings';

vi.mock('../../services', () => ({
  followsApi: {
    getBlocked: vi.fn(),
    getMuted: vi.fn(),
    unblock: vi.fn(),
    unmute: vi.fn(),
  },
}));
vi.mock('react-hot-toast', () => {
  const fn = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { toast: fn, default: fn };
});
vi.mock('../modals/MuteDurationModal', () => ({
  default: ({
    username,
    onClose,
    onMuted,
  }: {
    username: string;
    onClose: () => void;
    onMuted: (duration: string) => void;
  }) => (
    <div data-testid="duration">
      duration for {username}
      <button type="button" onClick={() => onMuted('24h')}>
        choose a day
      </button>
      <button type="button" onClick={onClose}>
        close duration
      </button>
    </div>
  ),
}));

const api = vi.mocked(followsApi);
const person = (username: string | null, over: object = {}) => ({
  id: `id-${username}`,
  username,
  fullName: null,
  avatar: null,
  ...over,
});
const muted = (username: string | null, expiresAt: string | null) => ({
  createdAt: '2026-03-01T10:00:00Z',
  expiresAt,
  profile: person(username),
});
const rowOf = (name: string) =>
  screen.getByText(name).closest('li') as HTMLElement;
const show = () => renderWithProviders(<MutesSettings />);

describe('MutesSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getBlocked.mockResolvedValue({ data: [] } as never);
    api.getMuted.mockResolvedValue({ data: [] } as never);
    api.unblock.mockResolvedValue({} as never);
    api.unmute.mockResolvedValue({} as never);
  });

  it('says when nobody is blocked or muted', async () => {
    show();

    expect(await screen.findByText('No blocked users')).toBeInTheDocument();
    expect(screen.getByText('No muted users')).toBeInTheDocument();
  });

  it('lists blocked accounts and unblocks one, reading the list again', async () => {
    api.getBlocked.mockResolvedValue({
      data: [person('eva', { fullName: 'Eva Sanz' }), person('leo')],
    } as never);
    show();

    const row = await waitFor(() => rowOf('eva'));
    expect(within(row).getByText('Eva Sanz')).toBeInTheDocument();
    api.getBlocked.mockResolvedValue({ data: [person('leo')] } as never);
    fireEvent.click(within(row).getByRole('button', { name: 'Unblock' }));

    await waitFor(() => expect(api.unblock).toHaveBeenCalledWith('eva'));
    await waitFor(() =>
      expect(screen.queryByText('eva')).not.toBeInTheDocument(),
    );
    expect(rowOf('leo')).toBeTruthy();
    expect(api.getBlocked).toHaveBeenCalledTimes(2);
  });

  it('shows as busy only the account being unblocked', async () => {
    api.getBlocked.mockResolvedValue({
      data: [person('eva'), person('leo')],
    } as never);
    let finish: (value: unknown) => void = () => {};
    api.unblock.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }) as never,
    );
    show();

    const eva = await waitFor(() => rowOf('eva'));
    fireEvent.click(within(eva).getByRole('button'));
    await waitFor(() =>
      expect(within(eva).getByRole('button')).toHaveAttribute(
        'aria-busy',
        'true',
      ),
    );
    const other = within(rowOf('leo')).getByRole('button');
    expect(other).toBeDisabled();
    expect(other).not.toHaveAttribute('aria-busy', 'true');
    finish({});
    await waitFor(() => expect(other).toBeEnabled());
  });

  it('says so when an account could not be unblocked or unmuted', async () => {
    api.getBlocked.mockResolvedValue({ data: [person('eva')] } as never);
    api.getMuted.mockResolvedValue({ data: [muted('leo', null)] } as never);
    api.unblock.mockRejectedValue(new Error('no'));
    api.unmute.mockRejectedValue(new Error('no'));
    show();

    fireEvent.click(
      within(await waitFor(() => rowOf('eva'))).getByRole('button', {
        name: 'Unblock',
      }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The account could not be unblocked. Try again.',
      ),
    );
    fireEvent.click(
      within(rowOf('leo')).getByRole('button', { name: 'Unmute' }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The account could not be unmuted. Try again.',
      ),
    );
    expect(rowOf('eva')).toBeTruthy();
    expect(rowOf('leo')).toBeTruthy();
  });

  it('shows until when each account is muted', async () => {
    api.getMuted.mockResolvedValue({
      data: [
        muted('eva', null),
        muted('leo', '2026-04-01T18:30:00Z'),
        muted('ada', 'not a date'),
      ],
    } as never);
    show();

    expect(
      within(await waitFor(() => rowOf('eva'))).getByText('Forever'),
    ).toBeInTheDocument();
    expect(within(rowOf('leo')).getByText(/^Until .*2026/)).toBeInTheDocument();
    expect(within(rowOf('ada')).getByText('Forever')).toBeInTheDocument();
  });

  it('unmutes an account, reading the list again', async () => {
    api.getMuted.mockResolvedValue({ data: [muted('eva', null)] } as never);
    show();

    const row = await waitFor(() => rowOf('eva'));
    api.getMuted.mockResolvedValue({ data: [] } as never);
    fireEvent.click(within(row).getByRole('button', { name: 'Unmute' }));

    await waitFor(() => expect(api.unmute).toHaveBeenCalledWith('eva'));
    expect(await screen.findByText('No muted users')).toBeInTheDocument();
  });

  it('changes how long an account stays muted', async () => {
    api.getMuted.mockResolvedValue({ data: [muted('eva', null)] } as never);
    show();

    const row = await waitFor(() => rowOf('eva'));
    fireEvent.click(within(row).getByRole('button', { name: 'Duration' }));
    expect(screen.getByTestId('duration')).toHaveTextContent(
      'duration for eva',
    );
    fireEvent.click(screen.getByRole('button', { name: 'close duration' }));
    expect(screen.queryByTestId('duration')).not.toBeInTheDocument();
    expect(api.getMuted).toHaveBeenCalledTimes(1);

    fireEvent.click(within(row).getByRole('button', { name: 'Duration' }));
    fireEvent.click(screen.getByRole('button', { name: 'choose a day' }));
    expect(screen.queryByTestId('duration')).not.toBeInTheDocument();
    await waitFor(() => expect(api.getMuted).toHaveBeenCalledTimes(2));
  });

  it('shows an account with no name as unknown and does nothing with it', async () => {
    api.getBlocked.mockResolvedValue({ data: [person(null)] } as never);
    api.getMuted.mockResolvedValue({
      data: [{ ...muted(null, null), profile: person(null, { id: 'm' }) }],
    } as never);
    show();

    await waitFor(() => expect(screen.getAllByText('Unknown')).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Unblock' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unmute' }));
    fireEvent.click(screen.getByRole('button', { name: 'Duration' }));

    expect(api.unblock).not.toHaveBeenCalled();
    expect(api.unmute).not.toHaveBeenCalled();
    expect(screen.queryByTestId('duration')).not.toBeInTheDocument();
  });
});
