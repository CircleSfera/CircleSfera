import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { followsApi } from '../../services';
import { renderWithProviders } from '../../test/test-utils';
import ChatDetailsModal from './ChatDetailsModal';

vi.mock('../../services', () => ({
  followsApi: {
    restriction: vi.fn(),
    restrict: vi.fn(),
    unrestrict: vi.fn(),
  },
}));
vi.mock('react-hot-toast', () => {
  const fn = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { toast: fn, default: fn };
});

const api = vi.mocked(followsApi);
const open = (person: object = { username: 'ana', name: 'Ana' }) =>
  renderWithProviders(
    <ChatDetailsModal
      isOpen
      person={person as never}
      isEncrypted
      onClose={vi.fn()}
      onDeleteForMe={vi.fn()}
    />,
  );

describe('ChatDetailsModal restricting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.restriction.mockResolvedValue({
      data: { restricted: false },
    } as never);
    api.restrict.mockResolvedValue({ data: { restricted: true } } as never);
    api.unrestrict.mockResolvedValue({
      data: { restricted: false },
    } as never);
  });

  it('restricts the person, saying what it does, and then offers to unrestrict', async () => {
    open();

    const restrict = await screen.findByRole('button', {
      name: /^Restrict.*They won't be told\./,
    });
    await waitFor(() => expect(restrict).toBeEnabled());
    fireEvent.click(restrict);

    await waitFor(() => expect(api.restrict).toHaveBeenCalledWith('ana'));
    expect(toast.success).toHaveBeenCalledWith(
      "ana is restricted. They won't be told.",
    );
    expect(
      await screen.findByRole('button', { name: /^Unrestrict/ }),
    ).toBeInTheDocument();
  });

  it('unrestricts someone already restricted', async () => {
    api.restriction.mockResolvedValue({ data: { restricted: true } } as never);
    open();

    const unrestrict = await screen.findByRole('button', {
      name: /^Unrestrict/,
    });
    await waitFor(() => expect(unrestrict).toBeEnabled());
    fireEvent.click(unrestrict);
    await waitFor(() => expect(api.unrestrict).toHaveBeenCalledWith('ana'));
  });

  it('offers nothing to restrict for someone unavailable, and asks nothing', () => {
    open({ username: '', name: 'Unavailable', unavailable: true });
    expect(
      screen.queryByRole('button', { name: /Restrict/ }),
    ).not.toBeInTheDocument();
    expect(api.restriction).not.toHaveBeenCalled();
  });

  it('says so when the restriction could not be changed', async () => {
    api.restrict.mockRejectedValue(new Error('down'));
    open();
    const restrict = await screen.findByRole('button', { name: /^Restrict/ });
    await waitFor(() => expect(restrict).toBeEnabled());
    fireEvent.click(restrict);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The restriction could not be changed. Try again.',
      ),
    );
  });
});
