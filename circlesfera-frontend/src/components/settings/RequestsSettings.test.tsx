import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { followsApi } from '../../services';
import { renderWithProviders } from '../../test/test-utils';
import RequestsSettings from './RequestsSettings';

vi.mock('../../services', () => ({
  followsApi: {
    getPending: vi.fn(),
    acceptRequest: vi.fn(),
    rejectRequest: vi.fn(),
  },
}));
vi.mock('react-hot-toast', () => {
  const fn = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { toast: fn, default: fn };
});

const api = vi.mocked(followsApi);
const person = (username: string | null, over: object = {}) => ({
  id: `id-${username}`,
  username,
  fullName: null,
  avatar: null,
  ...over,
});
const rowOf = (name: string) =>
  screen.getByText(name).closest('li') as HTMLElement;
const confirm = (name: string) =>
  within(rowOf(name)).getByRole('button', { name: 'Confirm' });
const remove = (name: string) =>
  within(rowOf(name)).getByRole('button', { name: 'Delete' });
const show = async (people: object[]) => {
  api.getPending.mockResolvedValue({ data: people } as never);
  const view = renderWithProviders(<RequestsSettings />);
  await waitFor(() => expect(api.getPending).toHaveBeenCalled());
  return view;
};

describe('RequestsSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.acceptRequest.mockResolvedValue({} as never);
    api.rejectRequest.mockResolvedValue({} as never);
  });

  it('says so when nobody is waiting', async () => {
    await show([]);

    expect(
      await screen.findByText('No pending requests at the moment'),
    ).toBeInTheDocument();
  });

  it('lists who asks, by name when they have one, with a way to their profile', async () => {
    await show([person('ana', { fullName: 'Ana Ruiz' }), person('leo')]);

    expect(await screen.findByText('Ana Ruiz')).toBeInTheDocument();
    expect(screen.getByText('@ana')).toBeInTheDocument();
    expect(screen.getByText('leo')).toBeInTheDocument();
    expect(within(rowOf('Ana Ruiz')).getByRole('link')).toHaveAttribute(
      'href',
      '/ana',
    );
  });

  it('confirms a request, asks for the list again and for the own profile', async () => {
    const { queryClient } = await show([person('ana'), person('leo')]);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    await screen.findByText('@ana');

    api.getPending.mockResolvedValue({ data: [person('leo')] } as never);
    fireEvent.click(confirm('@ana'));

    await waitFor(() => expect(api.acceptRequest).toHaveBeenCalledWith('ana'));
    await waitFor(() =>
      expect(screen.queryByText('@ana')).not.toBeInTheDocument(),
    );
    // The follower count of the own profile changed.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['myProfile'] });
    expect(screen.getByText('@leo')).toBeInTheDocument();
  });

  it('deletes a request and asks for the list again', async () => {
    await show([person('ana')]);
    await screen.findByText('@ana');

    api.getPending.mockResolvedValue({ data: [] } as never);
    fireEvent.click(remove('@ana'));

    await waitFor(() => expect(api.rejectRequest).toHaveBeenCalledWith('ana'));
    expect(
      await screen.findByText('No pending requests at the moment'),
    ).toBeInTheDocument();
    expect(api.acceptRequest).not.toHaveBeenCalled();
  });

  it('shows the wait on the request being answered, and holds the others', async () => {
    let answer: (value: unknown) => void = () => {};
    api.acceptRequest.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }) as never,
    );
    await show([person('ana'), person('leo')]);
    await screen.findByText('@ana');

    fireEvent.click(confirm('@ana'));

    await waitFor(() => expect(confirm('@ana')).toBeDisabled());
    expect(confirm('@ana')).toHaveAttribute('aria-busy', 'true');
    // The other request waits its turn, without looking as if it were sent.
    expect(confirm('@leo')).toBeDisabled();
    expect(confirm('@leo')).not.toHaveAttribute('aria-busy', 'true');
    expect(remove('@leo')).toBeDisabled();
    fireEvent.click(confirm('@leo'));
    expect(api.acceptRequest).toHaveBeenCalledTimes(1);

    answer({});
    await waitFor(() => expect(confirm('@leo')).toBeEnabled());
  });

  it('says so when a request could not be confirmed, and keeps it', async () => {
    api.acceptRequest.mockRejectedValue(new Error('down'));
    await show([person('ana')]);
    await screen.findByText('@ana');

    fireEvent.click(confirm('@ana'));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The request could not be confirmed. Try again.',
      ),
    );
    expect(screen.getByText('@ana')).toBeInTheDocument();
    expect(confirm('@ana')).toBeEnabled();
  });

  it('says so when a request could not be deleted, and keeps it', async () => {
    api.rejectRequest.mockRejectedValue(new Error('down'));
    await show([person('ana')]);
    await screen.findByText('@ana');

    fireEvent.click(remove('@ana'));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The request could not be deleted. Try again.',
      ),
    );
    expect(screen.getByText('@ana')).toBeInTheDocument();
  });

  it('does nothing for a request whose account has no username', async () => {
    await show([person(null, { id: 'gone', fullName: 'Left' })]);
    await screen.findByText('Left');

    fireEvent.click(confirm('Left'));
    fireEvent.click(remove('Left'));

    expect(api.acceptRequest).not.toHaveBeenCalled();
    expect(api.rejectRequest).not.toHaveBeenCalled();
  });
});
