import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import toast from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import catalog from '../../locales/en.json';
import { adminApi } from '../../services/admin.service';
import { renderWithProviders } from '../../test/test-utils';
import FirewallTab from './FirewallTab';
import WhitelistTab from './WhitelistTab';

vi.mock('../../services/admin.service', () => ({
  adminApi: {
    getWhitelist: vi.fn(),
    createWhitelist: vi.fn(),
    updateWhitelist: vi.fn(),
    deleteWhitelist: vi.fn(),
  },
}));
vi.mock('../../hooks/useDebouncedValue', () => ({
  useDebouncedValue: <T,>(value: T) => value,
}));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock('./FirewallRulesTab', () => ({
  default: ({ onToast }: { onToast: (m: string, t: string) => void }) => (
    <button type="button" onClick={() => onToast('from rules', 'success')}>
      rules view
    </button>
  ),
}));
vi.mock('./FirewallSignaturesTab', () => ({
  default: ({ onToast }: { onToast: (m: string, t: string) => void }) => (
    <button type="button" onClick={() => onToast('from signatures', 'error')}>
      signatures view
    </button>
  ),
}));

const api = vi.mocked(adminApi);
const en = (key: 'tab_rules' | 'tab_signatures') => catalog.admin.firewall[key];

const entry = (id: string, over: object = {}) => ({
  id,
  email: `${id}@example.com`,
  name: `Person ${id}`,
  status: 'VALID',
  createdAt: '2026-03-10T11:00:00Z',
  updatedAt: '2026-03-10T11:00:00Z',
  ...over,
});
const list = <T,>(rows: T[], pageNumber = 1, totalPages = 1) => ({
  data: {
    data: rows,
    meta: {
      total: rows.length * totalPages,
      page: pageNumber,
      limit: 10,
      totalPages,
    },
  },
});
const rowOf = (text: string) =>
  screen
    .getAllByText(text)
    .map((el) => el.closest('[role="button"]'))
    .find(Boolean) as HTMLElement;
const detail = () => screen.getByRole('region', { name: 'Detail' });

describe('WhitelistTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getWhitelist.mockResolvedValue(list([]) as never);
    api.createWhitelist.mockResolvedValue({} as never);
    api.updateWhitelist.mockResolvedValue({} as never);
    api.deleteWhitelist.mockResolvedValue({} as never);
  });

  it('says the list is empty and counts nobody', async () => {
    renderWithProviders(<WhitelistTab />);

    expect(await screen.findByText('No whitelist entries')).toBeInTheDocument();
    expect(api.getWhitelist).toHaveBeenCalledWith(1, 10, undefined);
    expect(screen.getByText('Total: 0 interested')).toBeInTheDocument();
  });

  it('lists each person with their state, and searches from the first page', async () => {
    api.getWhitelist.mockImplementation((pageNumber = 1, _limit, search) =>
      Promise.resolve(
        (search
          ? list([entry('found', { name: null, status: 'REGISTERED' })])
          : list([entry(`p${pageNumber}`)], pageNumber, 3)) as never,
      ),
    );
    renderWithProviders(<WhitelistTab />);

    await screen.findByText('Person p1');
    expect(screen.getByText('Total: 3 interested')).toBeInTheDocument();
    expect(
      within(rowOf('Person p1')).getByText('p1@example.com'),
    ).toBeInTheDocument();
    expect(within(rowOf('Person p1')).getByText('VALID')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByText('Person p2');
    expect(api.getWhitelist).toHaveBeenLastCalledWith(2, 10, undefined);

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search whitelist...' }),
      { target: { value: 'found' } },
    );
    await waitFor(() =>
      expect(api.getWhitelist).toHaveBeenLastCalledWith(1, 10, 'found'),
    );
    const row = await waitFor(() => rowOf('No name'));
    expect(within(row).getByText('found@example.com')).toBeInTheDocument();
    expect(within(row).getByText('REGISTERED')).toBeInTheDocument();
  });

  it('adds a person by email, with the name when given', async () => {
    renderWithProviders(<WhitelistTab />);
    await screen.findByText('No whitelist entries');

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Add to whitelist')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Email' }), {
      target: { value: '  new@example.com ' },
    });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), {
      target: { value: ' New Person ' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(api.createWhitelist).toHaveBeenCalledWith({
        email: 'new@example.com',
        name: 'New Person',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(toast.success).toHaveBeenCalledWith('Added to the whitelist');
    expect(api.getWhitelist).toHaveBeenCalledTimes(2);

    // The form starts empty the next time.
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(
      within(await screen.findByRole('dialog')).getByRole('textbox', {
        name: 'Email',
      }),
    ).toHaveValue('');
  });

  it('adds without a name, and adds nothing without an email', async () => {
    renderWithProviders(<WhitelistTab />);
    await screen.findByText('No whitelist entries');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const dialog = await screen.findByRole('dialog');

    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Email' }), {
      target: { value: '   ' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(api.createWhitelist).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Email' }), {
      target: { value: 'solo@example.com' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(api.createWhitelist).toHaveBeenCalledWith({
        email: 'solo@example.com',
        name: undefined,
      }),
    );
  });

  it('says so when a person cannot be added and keeps what was typed', async () => {
    api.createWhitelist.mockRejectedValue(new Error('duplicate'));
    renderWithProviders(<WhitelistTab />);
    await screen.findByText('No whitelist entries');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Email' }), {
      target: { value: 'dup@example.com' },
    });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Could not add to the whitelist',
      ),
    );
    expect(
      within(screen.getByRole('dialog')).getByRole('textbox', {
        name: 'Email',
      }),
    ).toHaveValue('dup@example.com');

    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('opens a person to edit and saves name, email and state', async () => {
    api.getWhitelist.mockResolvedValue(list([entry('a')]) as never);
    renderWithProviders(<WhitelistTab />);
    await screen.findByText('Person a');

    fireEvent.click(
      within(rowOf('Person a')).getByRole('button', { name: 'Edit' }),
    );
    const form = detail();
    expect(within(form).getByText('Edit Entry')).toBeInTheDocument();
    expect(within(form).getByRole('textbox', { name: 'Name' })).toHaveValue(
      'Person a',
    );
    expect(within(form).getByRole('textbox', { name: 'Email' })).toHaveValue(
      'a@example.com',
    );
    expect(within(form).getByRole('combobox', { name: 'Status' })).toHaveValue(
      'VALID',
    );

    fireEvent.change(within(form).getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Renamed' },
    });
    fireEvent.change(within(form).getByRole('combobox', { name: 'Status' }), {
      target: { value: 'REGISTERED' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(api.updateWhitelist).toHaveBeenCalledWith('a', {
        name: 'Renamed',
        email: 'a@example.com',
        status: 'REGISTERED',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByText('Edit Entry')).not.toBeInTheDocument(),
    );
    expect(toast.success).toHaveBeenCalledWith('Entry saved');
    expect(api.getWhitelist).toHaveBeenCalledTimes(2);
  });

  it('leaves the edit without saving, and says so when saving fails', async () => {
    api.updateWhitelist.mockRejectedValue(new Error('no'));
    api.getWhitelist.mockResolvedValue(
      list([entry('a', { name: null })]) as never,
    );
    renderWithProviders(<WhitelistTab />);
    await screen.findByText('No name');

    fireEvent.click(rowOf('No name'));
    expect(within(detail()).getByRole('textbox', { name: 'Name' })).toHaveValue(
      '',
    );
    fireEvent.click(within(detail()).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Edit Entry')).not.toBeInTheDocument();
    expect(api.updateWhitelist).not.toHaveBeenCalled();

    fireEvent.click(rowOf('No name'));
    fireEvent.change(within(detail()).getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Now named' },
    });
    fireEvent.click(within(detail()).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Could not save the entry'),
    );
    expect(within(detail()).getByText('Edit Entry')).toBeInTheDocument();
  });

  it('deletes a person only after confirming, and closes them if open', async () => {
    api.getWhitelist.mockResolvedValue(list([entry('a')]) as never);
    renderWithProviders(<WhitelistTab />);
    await screen.findByText('Person a');
    fireEvent.click(rowOf('Person a'));

    const remove = async () => {
      fireEvent.click(
        within(rowOf('Person a')).getByRole('button', { name: 'More actions' }),
      );
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
      return screen.findByRole('dialog');
    };

    fireEvent.click(
      within(await remove()).getByRole('button', { name: 'Cancel' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(api.deleteWhitelist).not.toHaveBeenCalled();

    const dialog = await remove();
    expect(within(dialog).getByText('Delete entry?')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(api.deleteWhitelist).toHaveBeenCalledWith('a'));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Entry deleted'),
    );
    expect(screen.queryByText('Edit Entry')).not.toBeInTheDocument();
  });

  it('says so when a person cannot be deleted', async () => {
    api.deleteWhitelist.mockRejectedValue(new Error('no'));
    api.getWhitelist.mockResolvedValue(list([entry('a')]) as never);
    renderWithProviders(<WhitelistTab />);
    await screen.findByText('Person a');

    fireEvent.click(
      within(rowOf('Person a')).getByRole('button', { name: 'More actions' }),
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Delete',
      }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Could not delete the entry'),
    );
    expect(screen.getByText('Person a')).toBeInTheDocument();
  });
});

describe('FirewallTab', () => {
  it('shows the rules first and switches to the signatures and back', () => {
    const onToast = vi.fn();
    renderWithProviders(<FirewallTab onToast={onToast} />);

    const rules = screen.getByRole('button', { name: en('tab_rules') });
    const signatures = screen.getByRole('button', {
      name: en('tab_signatures'),
    });
    expect(screen.getByText('rules view')).toBeInTheDocument();
    expect(rules).toHaveClass('border-brand-primary');
    expect(signatures).toHaveClass('border-transparent');
    fireEvent.click(screen.getByText('rules view'));
    expect(onToast).toHaveBeenLastCalledWith('from rules', 'success');

    fireEvent.click(signatures);
    expect(screen.queryByText('rules view')).not.toBeInTheDocument();
    expect(signatures).toHaveClass('border-brand-primary');
    fireEvent.click(screen.getByText('signatures view'));
    expect(onToast).toHaveBeenLastCalledWith('from signatures', 'error');

    fireEvent.click(rules);
    expect(screen.getByText('rules view')).toBeInTheDocument();
  });
});
