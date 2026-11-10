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
    unlockOperator: vi.fn(),
    sendOperatorEnrolmentLink: vi.fn(),
    issueOperatorEnrolmentCode: vi.fn(),
    setOperatorAccessExpiry: vi.fn(),
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
  {
    id: 'arole_external_reviewer',
    name: 'EXTERNAL_REVIEWER',
    description: 'Reads the review area only',
  },
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
    .map((el) => el.closest('[data-admin-row]'))
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
const fillNewOperator = () => {
  const panel = createPanel();
  fireEvent.change(within(panel).getByLabelText('Email'), {
    target: { value: 'new@circlesfera.test' },
  });
  fireEvent.change(within(panel).getByLabelText('Display name'), {
    target: { value: 'New person' },
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
    api.unlockOperator.mockResolvedValue({} as never);
    api.sendOperatorEnrolmentLink.mockResolvedValue({
      data: { sent: true },
    } as never);
    api.issueOperatorEnrolmentCode.mockResolvedValue({
      data: { code: 'ABCD-EFGH-JKMN', expiresInHours: 24 },
    } as never);
    auth.stepUp.mockResolvedValue({} as never);
    api.setOperatorAccessExpiry.mockResolvedValue({} as never);
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
    expect(within(row).getByText('Active')).toBeInTheDocument();
    expect(
      within(rowOf('Operator b')).getByText('Disabled'),
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
    expect(
      within(pane).getByText('Two-step verification set up'),
    ).toBeInTheDocument();
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
      within(detail()).getByText('Two-step verification not set up yet'),
    ).toBeInTheDocument();
  });

  it('shows the reference that tells an operator apart without its address', async () => {
    api.getOperators.mockResolvedValue(
      list([
        operator('3f9c1a7e-52d4-4b8a-9e61-0c2d7f4a8b13', {
          displayName: 'Operator a',
        }),
      ]) as never,
    );
    show();

    const pane = await open('Operator a');
    expect(within(pane).getByText('Reference 3f9c1a7e')).toBeInTheDocument();
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

  it('resets the access of an operator', async () => {
    api.getOperators.mockResolvedValue(list([operator('a')]) as never);
    show();

    fireEvent.click(
      within(await open('Operator a')).getByRole('button', {
        name: 'Reset access',
      }),
    );
    await waitFor(() => expect(api.resetOperatorMfa).toHaveBeenCalledWith('a'));
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        'Access reset: we sent a link to choose a new password and authenticator',
        'success',
      ),
    );
  });

  it('offers the set-up of the authenticator only to an active operator without one', async () => {
    api.getOperators.mockResolvedValue(
      list([
        operator('a'),
        operator('b', { totpEnabled: false }),
        operator('c', { totpEnabled: false, status: 'DISABLED' }),
      ]) as never,
    );
    show();

    expect(
      within(await open('Operator a')).queryByRole('button', {
        name: 'Create a code',
      }),
    ).not.toBeInTheDocument();
    expect(
      within(await open('Operator c')).queryByRole('button', {
        name: 'Create a code',
      }),
    ).not.toBeInTheDocument();
    expect(
      within(await open('Operator b')).getByRole('button', {
        name: 'Send the link again',
      }),
    ).toBeInTheDocument();
  });

  it('says when an operator still has no password of its own', async () => {
    api.getOperators.mockResolvedValue(
      list([
        operator('a', { ownPassword: true }),
        operator('b', { ownPassword: false }),
      ]) as never,
    );
    show();

    expect(
      within(await open('Operator a')).queryByText(/No password of their own/),
    ).toBeNull();
    expect(
      within(await open('Operator b')).getByText(/No password of their own/),
    ).toBeInTheDocument();
  });

  it('offers someone who had access only a code, never a link to their email', async () => {
    api.getOperators.mockResolvedValue(
      list([
        operator('a', {
          totpEnabled: false,
          lastLoginAt: '2026-11-01T10:00:00.000Z',
        }),
        operator('b', { totpEnabled: false, ownPassword: true }),
      ]) as never,
    );
    show();

    for (const name of ['Operator a', 'Operator b']) {
      const pane = await open(name);
      expect(
        within(pane).queryByRole('button', { name: 'Send the link again' }),
      ).toBeNull();
      expect(
        within(pane).getByRole('button', { name: 'Create a code' }),
      ).toBeInTheDocument();
      expect(within(pane).getByText(/give it in person/)).toBeInTheDocument();
    }
  });

  it('after resetting someone who had access, says to give them a code', async () => {
    api.getOperators.mockResolvedValue(
      list([
        operator('a', { lastLoginAt: '2026-11-01T10:00:00.000Z' }),
      ]) as never,
    );
    api.resetOperatorMfa.mockResolvedValue({} as never);
    show();
    const pane = await open('Operator a');

    fireEvent.click(within(pane).getByRole('button', { name: 'Reset access' }));

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        expect.stringMatching(/^Access reset\. Create a code/),
        'success',
      ),
    );
  });

  it('sends the set-up link again', async () => {
    api.getOperators.mockResolvedValue(
      list([operator('b', { totpEnabled: false })]) as never,
    );
    show();

    fireEvent.click(
      within(await open('Operator b')).getByRole('button', {
        name: 'Send the link again',
      }),
    );

    await waitFor(() =>
      expect(api.sendOperatorEnrolmentLink).toHaveBeenCalledWith('b'),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        'Link sent to their email',
        'success',
      ),
    );
  });

  it('shows a new set-up code once, for the operator it was made for, and copies it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    api.getOperators.mockResolvedValue(
      list([
        operator('b', { totpEnabled: false }),
        operator('d', { totpEnabled: false }),
      ]) as never,
    );
    show();
    const panel = await open('Operator b');

    fireEvent.click(
      within(panel).getByRole('button', { name: 'Create a code' }),
    );

    expect(
      await within(detail()).findByText('ABCD-EFGH-JKMN'),
    ).toBeInTheDocument();
    expect(api.issueOperatorEnrolmentCode).toHaveBeenCalledWith('b');
    fireEvent.click(
      within(detail()).getByRole('button', { name: 'Copy code' }),
    );
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('ABCD-EFGH-JKMN'),
    );

    // Another operator never sees it.
    await open('Operator d');
    expect(screen.queryByText('ABCD-EFGH-JKMN')).not.toBeInTheDocument();
  });

  it('clears a lockout without asking for a password', async () => {
    api.getOperators.mockResolvedValue(list([operator('a')]) as never);
    show();
    const pane = await open('Operator a');

    expect(
      within(pane).queryByPlaceholderText(/password/i),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(pane).getByRole('button', { name: 'Unlock account' }),
    );

    await waitFor(() => expect(api.unlockOperator).toHaveBeenCalledWith('a'));
    expect(onToast).toHaveBeenCalledWith('Lockout cleared', 'success');
  });

  it('says which change was refused', async () => {
    api.getOperators.mockResolvedValue(list([operator('a')]) as never);
    api.updateOperatorStatus.mockRejectedValue(refused);
    api.replaceOperatorRoles.mockRejectedValue(refused);
    api.resetOperatorMfa.mockRejectedValue(refused);
    api.unlockOperator.mockRejectedValue(refused);
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
    fireEvent.click(within(pane).getByRole('button', { name: 'Reset access' }));
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        'Could not reset two-step verification',
        'error',
      ),
    );
    fireEvent.click(
      within(pane).getByRole('button', { name: 'Unlock account' }),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        'Could not clear the lockout',
        'error',
      ),
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
    fireEvent.change(within(panel).getByLabelText('Email'), {
      target: { value: 'new@circlesfera.test' },
    });
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

    fireEvent.click(within(pane).getByRole('button', { name: 'Reset access' }));
    const code = await screen.findByPlaceholderText('000000');
    fireEvent.change(code, { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('That code is not right', 'error'),
    );
    expect(api.resetOperatorMfa).toHaveBeenCalledTimes(1);
    expect(screen.getByPlaceholderText('000000')).toBeInTheDocument();

    const prompt = screen
      .getByText('Enter your authenticator code to confirm this action.')
      .closest('.glass-panel') as HTMLElement;
    fireEvent.click(within(prompt).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByPlaceholderText('000000')).not.toBeInTheDocument();
  });
  describe('external reviewers', () => {
    const reviewer = (over: object = {}) =>
      operator('rev', {
        totpEnabled: false,
        externalReviewer: true,
        accessExpiresAt: '2026-12-05T00:00:00.000Z',
        roles: [{ id: 'arole_external_reviewer', name: 'EXTERNAL_REVIEWER' }],
        ...over,
      });

    it('creates one with the day its access ends, the role alone', async () => {
      show();
      fireEvent.click(
        await screen.findByRole('button', { name: 'New operator' }),
      );
      const panel = fillNewOperator();
      expect(within(panel).queryByLabelText('Access ends on')).toBeNull();

      fireEvent.click(
        within(panel).getByRole('button', { name: 'External reviewer' }),
      );
      const day = within(panel).getByLabelText('Access ends on');
      expect(day).toHaveAttribute('type', 'date');
      expect(
        within(panel).getByText(/needs no CircleSfera account/),
      ).toBeInTheDocument();
      fireEvent.change(day, { target: { value: '2026-12-20' } });
      fireEvent.click(within(panel).getByRole('button', { name: 'Create' }));

      await waitFor(() =>
        expect(api.createOperator).toHaveBeenCalledWith({
          email: 'new@circlesfera.test',
          displayName: 'New person',
          roleIds: ['arole_external_reviewer'],
          accessExpiresAt: new Date(2026, 11, 20).toISOString(),
        }),
      );
    });

    it('cannot be created without a day its access ends', async () => {
      show();
      fireEvent.click(
        await screen.findByRole('button', { name: 'New operator' }),
      );
      const panel = fillNewOperator();
      fireEvent.click(
        within(panel).getByRole('button', { name: 'External reviewer' }),
      );
      fireEvent.change(within(panel).getByLabelText('Access ends on'), {
        target: { value: '' },
      });
      expect(
        within(panel).getByRole('button', { name: 'Create' }),
      ).toBeDisabled();
    });

    it('shows a reviewer without the authenticator actions, and extends the access', async () => {
      api.getOperators.mockResolvedValue(list([reviewer()]) as never);
      show();
      const pane = await open('Operator rev');

      expect(
        within(pane).getByText(
          /External reviewer: signs in without an authenticator/,
        ),
      ).toBeInTheDocument();
      expect(within(pane).getByText(/Access ends on .+\./)).toBeInTheDocument();
      expect(
        within(pane).queryByRole('button', {
          name: 'Reset access',
        }),
      ).toBeNull();
      expect(
        within(pane).getByRole('button', { name: 'Disable' }),
      ).toBeInTheDocument();
      expect(
        within(pane).queryByRole('button', { name: 'Remove end date' }),
      ).toBeNull();

      fireEvent.change(within(pane).getByLabelText('Access ends on'), {
        target: { value: '2027-01-15' },
      });
      fireEvent.click(
        within(pane).getByRole('button', { name: 'Save end date' }),
      );
      await waitFor(() =>
        expect(api.setOperatorAccessExpiry).toHaveBeenCalledWith(
          'rev',
          new Date(2027, 0, 15).toISOString(),
        ),
      );
      await waitFor(() =>
        expect(onToast).toHaveBeenCalledWith('Access end saved', 'success'),
      );
    });

    it('offers a reviewer the access link only until it has set its password, and a code always', async () => {
      api.getOperators.mockResolvedValue(
        list([
          reviewer({ ownPassword: true }),
          operator('fresh', {
            ...reviewer(),
            id: 'fresh',
            displayName: 'Operator fresh',
            ownPassword: false,
          }),
        ]) as never,
      );
      show();

      const withPassword = await open('Operator rev');
      expect(
        within(withPassword).queryByRole('button', {
          name: 'Send the link again',
        }),
      ).toBeNull();
      // A forgotten password is recovered with a code given in person.
      expect(
        within(withPassword).getByRole('button', { name: 'Create a code' }),
      ).toBeInTheDocument();
      const pane = await open('Operator fresh');
      expect(
        within(pane).getByRole('button', { name: 'Send the link again' }),
      ).toBeInTheDocument();
      expect(
        within(pane).getByText(/No password of their own/),
      ).toBeInTheDocument();
    });

    it('never carries a day typed for one operator over to the next', async () => {
      api.getOperators.mockResolvedValue(
        list([operator('a'), operator('b')]) as never,
      );
      show();
      const first = await open('Operator a');
      fireEvent.change(within(first).getByLabelText('Access ends on'), {
        target: { value: '2027-01-15' },
      });

      const second = await open('Operator b');
      expect(within(second).getByLabelText('Access ends on')).toHaveValue('');
    });

    it("lets a member of staff's end be removed, and says when saving fails", async () => {
      api.getOperators.mockResolvedValue(
        list([
          operator('a', { accessExpiresAt: '2026-12-05T00:00:00.000Z' }),
          operator('b'),
        ]) as never,
      );
      show();
      const pane = await open('Operator a');

      fireEvent.click(
        within(pane).getByRole('button', { name: 'Remove end date' }),
      );
      await waitFor(() =>
        expect(api.setOperatorAccessExpiry).toHaveBeenCalledWith('a', null),
      );

      api.setOperatorAccessExpiry.mockRejectedValueOnce(refused);
      fireEvent.click(
        within(pane).getByRole('button', { name: 'Save end date' }),
      );
      await waitFor(() =>
        expect(onToast).toHaveBeenCalledWith(
          'The access end could not be saved',
          'error',
        ),
      );

      const other = await open('Operator b');
      expect(
        within(other).getByText('Access has no end date.'),
      ).toBeInTheDocument();
    });
  });
});
