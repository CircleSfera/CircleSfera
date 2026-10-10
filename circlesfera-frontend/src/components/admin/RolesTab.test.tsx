import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../services/admin.service';
import { adminAuthApi } from '../../services/admin-auth.service';
import { renderWithProviders } from '../../test/test-utils';
import RolesTab from './RolesTab';

vi.mock('../../services/admin.service', () => ({
  adminApi: {
    getOperatorRoles: vi.fn(),
    getOperators: vi.fn(),
    createOperator: vi.fn(),
    updateOperatorStatus: vi.fn(),
    replaceOperatorRoles: vi.fn(),
    resetOperatorMfa: vi.fn(),
    resetOperatorPassword: vi.fn(),
  },
}));
vi.mock('../../services/admin-auth.service', () => ({
  adminAuthApi: { stepUp: vi.fn() },
}));
vi.mock('../../hooks/useDebouncedValue', () => ({
  useDebouncedValue: <T,>(value: T) => value,
}));

const api = vi.mocked(adminApi);
const auth = vi.mocked(adminAuthApi);
const onToast = vi.fn();

const ROLES = [
  { id: 'arole_platform', name: 'Platform', description: 'Everything' },
  { id: 'arole_support', name: 'Support', description: null },
  { id: 'arole_finance', name: 'Finance', description: 'Money screens' },
];
const operator = (id: string, over: object = {}) => ({
  id,
  email: `${id}@circlesfera.test`,
  displayName: `Operator ${id}`,
  status: 'ACTIVE',
  totpEnabled: true,
  roles: [{ id: 'arole_support', name: 'Support' }],
  ...over,
});
const list = <T,>(rows: T[], pageNumber = 1, totalPages = 1) => ({
  data: {
    data: rows,
    meta: {
      total: rows.length * totalPages,
      page: pageNumber,
      limit: 15,
      totalPages,
    },
  },
});
const stepUpNeeded = {
  status: 401,
  data: { errorCode: 'ADMIN_STEP_UP_REQUIRED' },
};
const refused = { status: 400, data: {} };

const rowOf = (text: string) =>
  screen
    .getAllByText(text)
    .map((el) => el.closest('[role="button"]'))
    .find(Boolean) as HTMLElement;
const detail = () => screen.getByRole('region', { name: 'Detail' });
const show = () => renderWithProviders(<RolesTab onToast={onToast} />);
const open = async (name: string) => {
  fireEvent.click(await waitFor(() => rowOf(name)));
  return detail();
};
const createPanel = () =>
  screen
    .getByRole('heading', { name: 'New operator' })
    .closest('.glass-panel') as HTMLElement;
const fillNewOperator = (password = 'a-long-password') => {
  const panel = createPanel();
  fireEvent.change(within(panel).getByPlaceholderText('email'), {
    target: { value: 'new@circlesfera.test' },
  });
  fireEvent.change(within(panel).getByPlaceholderText('Display name'), {
    target: { value: 'New person' },
  });
  fireEvent.change(within(panel).getByPlaceholderText('Password (min 12)'), {
    target: { value: password },
  });
  return panel;
};

describe('RolesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getOperatorRoles.mockResolvedValue({ data: ROLES } as never);
    api.getOperators.mockResolvedValue(list([]) as never);
    api.createOperator.mockResolvedValue({ data: { id: 'new' } } as never);
    api.updateOperatorStatus.mockResolvedValue({} as never);
    api.replaceOperatorRoles.mockResolvedValue({} as never);
    api.resetOperatorMfa.mockResolvedValue({} as never);
    api.resetOperatorPassword.mockResolvedValue({} as never);
    auth.stepUp.mockResolvedValue({} as never);
  });

  it('says when there are no operators, and when the list could not be loaded', async () => {
    const first = show();
    expect(await screen.findByText('No operators yet')).toBeInTheDocument();
    first.unmount();

    api.getOperators.mockRejectedValue(new Error('no'));
    show();
    expect(
      await screen.findByText('Could not load operators'),
    ).toBeInTheDocument();
  });

  it('lists each operator with its state and roles', async () => {
    api.getOperators.mockResolvedValue(
      list([
        operator('a', {
          roles: [
            { id: 'arole_support', name: 'Support' },
            { id: 'arole_finance', name: 'Finance' },
          ],
        }),
        operator('b', { status: 'DISABLED' }),
      ]) as never,
    );
    show();

    const row = await waitFor(() => rowOf('Operator a'));
    expect(within(row).getByText('a@circlesfera.test')).toBeInTheDocument();
    expect(within(row).getByText('Support, Finance')).toBeInTheDocument();
    expect(within(row).getByText('active')).toBeInTheDocument();
    expect(
      within(rowOf('Operator b')).getByText('disabled'),
    ).toBeInTheDocument();
  });

  it('asks for the list by search, state and page', async () => {
    api.getOperators.mockResolvedValue(list([operator('a')], 1, 3) as never);
    show();
    await waitFor(() => rowOf('Operator a'));
    expect(api.getOperators).toHaveBeenLastCalledWith(
      1,
      15,
      undefined,
      undefined,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() =>
      expect(api.getOperators).toHaveBeenLastCalledWith(
        2,
        15,
        undefined,
        undefined,
      ),
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), {
      target: { value: 'DISABLED' },
    });
    await waitFor(() =>
      expect(api.getOperators).toHaveBeenLastCalledWith(
        1,
        15,
        undefined,
        'DISABLED',
      ),
    );

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search by email or name…' }),
      { target: { value: 'ana' } },
    );
    await waitFor(() =>
      expect(api.getOperators).toHaveBeenLastCalledWith(
        1,
        15,
        'ana',
        'DISABLED',
      ),
    );
  });

  it('shows an operator with its second factor and its roles marked', async () => {
    api.getOperators.mockResolvedValue(
      list([operator('a'), operator('b', { totpEnabled: false })]) as never,
    );
    show();

    const pane = await open('Operator a');
    expect(
      within(pane).getByRole('heading', { name: 'Operator a' }),
    ).toBeInTheDocument();
    expect(within(pane).getByText('MFA enrolled')).toBeInTheDocument();
    expect(within(pane).getByRole('button', { name: 'Support' })).toHaveClass(
      'text-white',
    );
    expect(within(pane).getByRole('button', { name: 'Finance' })).toHaveClass(
      'text-white/50',
    );
    expect(
      within(pane).getByRole('button', { name: 'Platform' }),
    ).toHaveAttribute('title', 'Everything');
    expect(
      within(pane).getByRole('button', { name: 'Support' }),
    ).toHaveAttribute('title', 'Support');

    await open('Operator b');
    expect(
      within(detail()).getByText('MFA enrollment pending'),
    ).toBeInTheDocument();
  });

  it('adds and removes a role, and never leaves an operator without one', async () => {
    api.getOperators.mockResolvedValue(list([operator('a')]) as never);
    show();
    const pane = await open('Operator a');

    fireEvent.click(within(pane).getByRole('button', { name: 'Finance' }));
    await waitFor(() =>
      expect(api.replaceOperatorRoles).toHaveBeenCalledWith('a', [
        'arole_support',
        'arole_finance',
      ]),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Roles updated', 'success'),
    );

    api.replaceOperatorRoles.mockClear();
    fireEvent.click(within(pane).getByRole('button', { name: 'Support' }));
    expect(api.replaceOperatorRoles).not.toHaveBeenCalled();
  });

  it('removes one of several roles', async () => {
    api.getOperators.mockResolvedValue(
      list([
        operator('a', {
          roles: [
            { id: 'arole_support', name: 'Support' },
            { id: 'arole_finance', name: 'Finance' },
          ],
        }),
      ]) as never,
    );
    show();
    const pane = await open('Operator a');

    fireEvent.click(within(pane).getByRole('button', { name: 'Support' }));
    await waitFor(() =>
      expect(api.replaceOperatorRoles).toHaveBeenCalledWith('a', [
        'arole_finance',
      ]),
    );
  });

  it('disables an active operator and enables a disabled one', async () => {
    api.getOperators.mockResolvedValue(
      list([operator('a'), operator('b', { status: 'DISABLED' })]) as never,
    );
    show();

    fireEvent.click(
      within(await open('Operator a')).getByRole('button', { name: 'Disable' }),
    );
    await waitFor(() =>
      expect(api.updateOperatorStatus).toHaveBeenCalledWith('a', 'DISABLED'),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Operator disabled', 'success'),
    );

    fireEvent.click(
      within(await open('Operator b')).getByRole('button', { name: 'Enable' }),
    );
    await waitFor(() =>
      expect(api.updateOperatorStatus).toHaveBeenCalledWith('b', 'ACTIVE'),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Operator enabled', 'success'),
    );
  });

  it('resets the second factor of an operator', async () => {
    api.getOperators.mockResolvedValue(list([operator('a')]) as never);
    show();

    fireEvent.click(
      within(await open('Operator a')).getByRole('button', {
        name: 'Reset MFA',
      }),
    );
    await waitFor(() => expect(api.resetOperatorMfa).toHaveBeenCalledWith('a'));
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('MFA reset', 'success'),
    );
  });

  it('sets a new password only from twelve characters, and empties the field after', async () => {
    api.getOperators.mockResolvedValue(list([operator('a')]) as never);
    show();
    const pane = await open('Operator a');

    const field = within(pane).getByPlaceholderText('New password (min 12)');
    const set = within(pane).getByRole('button', { name: 'Set password' });
    fireEvent.change(field, { target: { value: 'elevenchars' } });
    expect(set).toBeDisabled();
    fireEvent.change(field, { target: { value: 'twelve-chars' } });
    fireEvent.click(set);

    await waitFor(() =>
      expect(api.resetOperatorPassword).toHaveBeenCalledWith(
        'a',
        'twelve-chars',
      ),
    );
    await waitFor(() => expect(field).toHaveValue(''));
    expect(onToast).toHaveBeenCalledWith('Password updated', 'success');
  });

  it('says which change was refused', async () => {
    api.getOperators.mockResolvedValue(list([operator('a')]) as never);
    api.updateOperatorStatus.mockRejectedValue(refused);
    api.replaceOperatorRoles.mockRejectedValue(refused);
    api.resetOperatorMfa.mockRejectedValue(refused);
    api.resetOperatorPassword.mockRejectedValue(refused);
    show();
    const pane = await open('Operator a');

    fireEvent.click(within(pane).getByRole('button', { name: 'Disable' }));
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Could not update status', 'error'),
    );
    fireEvent.click(within(pane).getByRole('button', { name: 'Finance' }));
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Could not update roles', 'error'),
    );
    fireEvent.click(within(pane).getByRole('button', { name: 'Reset MFA' }));
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Could not reset MFA', 'error'),
    );
    fireEvent.change(
      within(pane).getByPlaceholderText('New password (min 12)'),
      {
        target: { value: 'twelve-chars' },
      },
    );
    fireEvent.click(within(pane).getByRole('button', { name: 'Set password' }));
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Could not reset password', 'error'),
    );
    expect(screen.queryByPlaceholderText('000000')).not.toBeInTheDocument();
  });

  it('creates an operator once every field is in, and opens it', async () => {
    api.getOperators.mockResolvedValue(list([operator('new')]) as never);
    show();
    await waitFor(() => rowOf('Operator new'));
    fireEvent.click(screen.getByRole('button', { name: 'New operator' }));

    const panel = createPanel();
    const create = within(panel).getByRole('button', { name: 'Create' });
    expect(create).toBeDisabled();
    fillNewOperator('short');
    expect(create).toBeDisabled();
    fillNewOperator();
    expect(create).toBeEnabled();

    // The role it starts with cannot be the only one removed.
    fireEvent.click(within(panel).getByRole('button', { name: 'Platform' }));
    expect(create).toBeEnabled();
    fireEvent.click(within(panel).getByRole('button', { name: 'Support' }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Platform' }));
    fireEvent.click(create);

    await waitFor(() =>
      expect(api.createOperator).toHaveBeenCalledWith({
        email: 'new@circlesfera.test',
        password: 'a-long-password',
        displayName: 'New person',
        roleIds: ['arole_support'],
      }),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Operator created', 'success'),
    );
    await waitFor(() =>
      expect(
        within(detail()).getByRole('heading', { name: 'Operator new' }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('heading', { name: 'New operator' }),
    ).not.toBeInTheDocument();
  });

  it('closes the new operator form on Cancel, and says so when creating fails', async () => {
    api.createOperator.mockRejectedValue(refused);
    show();
    await screen.findByText('No operators yet');

    fireEvent.click(screen.getByRole('button', { name: 'New operator' }));
    fireEvent.click(
      within(createPanel()).getByRole('button', { name: 'Cancel' }),
    );
    expect(
      screen.queryByRole('heading', { name: 'New operator' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'New operator' }));
    fireEvent.click(
      within(fillNewOperator()).getByRole('button', { name: 'Create' }),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        'Could not create operator',
        'error',
      ),
    );
    expect(
      screen.getByRole('heading', { name: 'New operator' }),
    ).toBeInTheDocument();
  });

  it('asks for the authenticator code when the server wants it, then repeats the change', async () => {
    api.getOperators.mockResolvedValue(list([operator('a')]) as never);
    api.updateOperatorStatus.mockRejectedValueOnce(stepUpNeeded);
    show();
    const pane = await open('Operator a');

    fireEvent.click(within(pane).getByRole('button', { name: 'Disable' }));
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        'Confirm with your authenticator code',
        'error',
      ),
    );
    expect(onToast).toHaveBeenCalledTimes(1);

    const code = await screen.findByPlaceholderText('000000');
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    fireEvent.change(code, { target: { value: '12a34' } });
    expect(code).toHaveValue('1234');
    expect(confirm).toBeDisabled();
    fireEvent.change(code, { target: { value: '1234567' } });
    expect(code).toHaveValue('123456');
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(auth.stepUp).toHaveBeenCalledWith({ totpCode: '123456' }),
    );
    await waitFor(() =>
      expect(api.updateOperatorStatus).toHaveBeenCalledTimes(2),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Verified', 'success'),
    );
    expect(onToast).toHaveBeenCalledWith('Operator disabled', 'success');
    await waitFor(() =>
      expect(screen.queryByPlaceholderText('000000')).not.toBeInTheDocument(),
    );
  });

  it('keeps asking when the code is wrong, and drops the change on Cancel', async () => {
    api.getOperators.mockResolvedValue(list([operator('a')]) as never);
    api.resetOperatorMfa.mockRejectedValueOnce(stepUpNeeded);
    auth.stepUp.mockRejectedValue(new Error('no'));
    show();
    const pane = await open('Operator a');

    fireEvent.click(within(pane).getByRole('button', { name: 'Reset MFA' }));
    const code = await screen.findByPlaceholderText('000000');
    fireEvent.change(code, { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Step-up failed', 'error'),
    );
    expect(api.resetOperatorMfa).toHaveBeenCalledTimes(1);
    expect(screen.getByPlaceholderText('000000')).toBeInTheDocument();

    const prompt = screen
      .getByText('Enter your authenticator code to confirm this action.')
      .closest('.glass-panel') as HTMLElement;
    fireEvent.click(within(prompt).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByPlaceholderText('000000')).not.toBeInTheDocument();
  });
});
