import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import { CommandPalette } from './CommandPalette';

vi.mock('../../stores/adminAuthStore', () => ({
  useAdminAuthStore: (
    selector: (s: { hasPermission: (key: string) => boolean }) => unknown,
  ) => selector({ hasPermission: () => true }),
}));

vi.mock('../../services', () => ({
  adminApi: {
    getUsers: vi.fn().mockResolvedValue({ data: { data: [] } }),
  },
}));

describe('CommandPalette', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    renderWithProviders(<CommandPalette isOpen={false} onClose={onClose} />);

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('opens a combobox and closes from the dialog control', () => {
    renderWithProviders(<CommandPalette isOpen onClose={onClose} />);

    expect(screen.getByRole('combobox')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
