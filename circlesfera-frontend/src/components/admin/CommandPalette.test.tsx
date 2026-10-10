import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../services';
import { renderWithProviders } from '../../test/test-utils';
import { CommandPalette } from './CommandPalette';

const permissions = { allows: (_key: string) => true };

vi.mock('../../stores/adminAuthStore', () => ({
  useAdminAuthStore: (
    selector: (s: { hasPermission: (key: string) => boolean }) => unknown,
  ) => selector({ hasPermission: (key) => permissions.allows(key) }),
}));

vi.mock('../../services', () => ({
  adminApi: {
    getUsers: vi.fn(),
  },
}));

const api = vi.mocked(adminApi);
const onClose = vi.fn();

function Where() {
  const location = useLocation();
  return (
    <output data-testid="where">{location.pathname + location.search}</output>
  );
}
const show = (isOpen = true) =>
  renderWithProviders(
    <>
      <CommandPalette isOpen={isOpen} onClose={onClose} />
      <Where />
    </>,
  );
const box = () => screen.getByRole('combobox');
const options = () =>
  screen.getAllByRole('option').map((option) => option.textContent);
const active = () =>
  screen
    .getAllByRole('option')
    .find((option) => option.getAttribute('aria-selected') === 'true')
    ?.textContent;
const type = (value: string) => fireEvent.change(box(), { target: { value } });
const press = (key: string) => fireEvent.keyDown(box(), { key });
const found = (id: string, over: object = {}) => ({
  id,
  email: `${id}@example.com`,
  profile: { username: `person_${id}`, fullName: `Person ${id}` },
  ...over,
});

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissions.allows = () => true;
    api.getUsers.mockResolvedValue({ data: { data: [] } } as never);
  });

  it('renders nothing when closed', () => {
    show(false);

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('opens a combobox and closes from the dialog control', () => {
    show();

    expect(box()).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('offers the quick actions first, then the other sections, each once', () => {
    show();

    const titles = options();
    expect(titles.slice(0, 5)).toEqual([
      'Quick action: Appeals',
      'Quick action: Spam review',
      'Quick action: Reports',
      'Quick action: AI Queue',
      'Quick action: Monetization',
    ]);
    expect(titles).toContain('Go to Users');
    expect(titles).not.toContain('Go to Reports');
    expect(new Set(titles).size).toBe(titles.length);
    expect(active()).toBe('Quick action: Appeals');
    expect(box()).toHaveAttribute('aria-activedescendant', 'quick-appeals');
  });

  it('leaves out the sections the operator cannot open', () => {
    permissions.allows = (key) => key === 'users.read';
    show();

    const titles = options();
    expect(titles).toContain('Go to Users');
    // Spam review opens with the same permission as the users section.
    expect(titles.filter((title) => title?.startsWith('Quick action'))).toEqual(
      ['Quick action: Spam review'],
    );
    expect(titles).not.toContain('Go to Posts');
  });

  it('narrows the list as it is typed, by name or by address, and says when nothing matches', () => {
    show();

    type('MONET');
    expect(options()).toEqual(['Quick action: Monetization']);
    type('spam-review');
    expect(options()).toEqual(['Quick action: Spam review']);

    type('zzzz');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('No results for "zzzz"')).toBeInTheDocument();
  });

  it('moves with the arrows within the list and opens the marked one with Enter', () => {
    show();

    press('ArrowUp');
    expect(active()).toBe('Quick action: Appeals');
    press('ArrowDown');
    press('ArrowDown');
    expect(active()).toBe('Quick action: Reports');
    press('ArrowUp');
    expect(active()).toBe('Quick action: Spam review');
    press('x');
    expect(active()).toBe('Quick action: Spam review');

    press('Enter');
    expect(screen.getByTestId('where')).toHaveTextContent('/spam-review');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stops at the last one, and goes back to the first when the text changes', () => {
    show();
    type('quick');
    expect(options()).toHaveLength(5);

    for (let i = 0; i < 9; i++) press('ArrowDown');
    expect(active()).toBe('Quick action: Monetization');

    type('quick a');
    expect(active()).toBe(options()[0]);
  });

  it('does nothing on Enter when nothing matches', () => {
    show();
    type('zzzz');
    press('ArrowDown');
    press('Enter');

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('where')).toHaveTextContent('/');
  });

  it('marks the one under the pointer and opens it on a press', () => {
    show();

    const users = screen.getByRole('option', { name: 'Go to Users' });
    fireEvent.mouseEnter(users);
    expect(active()).toBe('Go to Users');
    fireEvent.click(users);

    expect(screen.getByTestId('where')).toHaveTextContent('/users');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('looks for people from two characters and opens the record of the chosen one', async () => {
    api.getUsers.mockResolvedValue({
      data: {
        data: [
          found('a b'),
          found('2', { profile: null, email: 'person@example.com' }),
        ],
      },
    } as never);
    show();

    type('p');
    expect(api.getUsers).not.toHaveBeenCalled();
    type('person');
    await waitFor(() =>
      expect(api.getUsers).toHaveBeenCalledWith(1, 5, 'person'),
    );

    expect(
      await screen.findByRole('option', { name: '@person_a b — Person a b' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', {
        name: '@(no username) — person@example.com',
      }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('option', { name: '@person_a b — Person a b' }),
    );
    expect(screen.getByTestId('where')).toHaveTextContent(
      '/users?userId=a%20b',
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not look for people when the operator cannot read users', async () => {
    permissions.allows = (key) => key !== 'users.read';
    show();

    type('person');
    await waitFor(() =>
      expect(screen.getByText('No results for "person"')).toBeInTheDocument(),
    );
    expect(api.getUsers).not.toHaveBeenCalled();
  });

  it('starts empty each time it opens', () => {
    const view = show();
    type('monet');
    expect(box()).toHaveValue('monet');

    view.rerender(
      <>
        <CommandPalette isOpen={false} onClose={onClose} />
        <Where />
      </>,
    );
    view.rerender(
      <>
        <CommandPalette isOpen onClose={onClose} />
        <Where />
      </>,
    );
    expect(box()).toHaveValue('');
    expect(active()).toBe('Quick action: Appeals');
  });
});
