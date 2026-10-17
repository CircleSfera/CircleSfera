import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import toast from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import AppealsSettings from './AppealsSettings';

vi.mock('../../services/appeals.service', () => ({
  createAppeal: vi.fn(),
  getMyAppeals: vi.fn(),
  getMyStrikes: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

import {
  type Appeal,
  createAppeal,
  getMyAppeals,
  getMyStrikes,
  type ProfileStrike,
} from '../../services/appeals.service';

const strike = (overrides: Partial<ProfileStrike>): ProfileStrike => ({
  id: 'strike-1',
  kind: 'STRIKE',
  reason: 'HARASSMENT',
  consequence: 'NONE',
  createdAt: '2026-09-01T00:00:00.000Z',
  expiresAt: '2026-11-30T00:00:00.000Z',
  revokedAt: null,
  status: 'ACTIVE',
  ...overrides,
});

describe('AppealsSettings profile standing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getMyAppeals).mockResolvedValue([]);
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('shows an empty standing when the Profile has no warnings or strikes', async () => {
    vi.mocked(getMyStrikes).mockResolvedValue([]);
    const { i18n } = renderWithProviders(<AppealsSettings />);

    expect(
      await screen.findByText(i18n!.t('settings.appeals.strikes_empty')),
    ).toBeInTheDocument();
  });

  it('counts only active strikes, not warnings or expired ones', async () => {
    vi.mocked(getMyStrikes).mockResolvedValue([
      strike({ id: 's-1' }),
      strike({ id: 's-2', kind: 'WARNING' }),
      strike({ id: 's-3', status: 'EXPIRED' }),
      strike({
        id: 's-4',
        status: 'REVOKED',
        revokedAt: '2026-09-10T00:00:00.000Z',
      }),
    ]);
    const { i18n } = renderWithProviders(<AppealsSettings />);

    expect(await screen.findByTestId('active-strike-count')).toHaveTextContent(
      i18n!.t('settings.appeals.strikes_active_count', { count: 1 }),
    );
    expect(screen.getAllByTestId('strike-row')).toHaveLength(4);
    expect(
      screen.getByText(i18n!.t('settings.appeals.strike_status_revoked')),
    ).toBeInTheDocument();
    // Only active records can be appealed.
    expect(
      screen.getAllByRole('button', {
        name: i18n!.t('settings.appeals.strike_appeal'),
      }),
    ).toHaveLength(2);
  });

  it('shows the consequence a strike caused', async () => {
    vi.mocked(getMyStrikes).mockResolvedValue([
      strike({ consequence: 'SUSPENDED' }),
    ]);
    const { i18n } = renderWithProviders(<AppealsSettings />);

    expect(
      await screen.findByText(
        i18n!.t('settings.appeals.strike_consequence_suspended'),
      ),
    ).toBeInTheDocument();
  });

  it('appealing a strike files a STRIKE appeal about that record', async () => {
    vi.mocked(getMyStrikes).mockResolvedValue([strike({ id: 'strike-9' })]);
    vi.mocked(createAppeal).mockResolvedValue({ id: 'appeal-1' } as never);
    const { i18n } = renderWithProviders(<AppealsSettings />);

    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n!.t('settings.appeals.strike_appeal'),
      }),
    );
    fireEvent.change(
      screen.getByLabelText(i18n!.t('settings.appeals.reason')),
      { target: { value: 'I did not harass anyone in that thread' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('settings.appeals.submit') }),
    );

    await waitFor(() => {
      expect(createAppeal).toHaveBeenCalled();
    });
    expect(vi.mocked(createAppeal).mock.calls[0][0]).toEqual({
      targetType: 'STRIKE',
      targetId: 'strike-9',
      reason: 'I did not harass anyone in that thread',
    });
  });

  it('hides the appeal action while an appeal about the strike is pending', async () => {
    vi.mocked(getMyStrikes).mockResolvedValue([strike({ id: 'strike-9' })]);
    vi.mocked(getMyAppeals).mockResolvedValue([
      {
        id: 'appeal-1',
        userId: 'u-1',
        targetType: 'STRIKE',
        targetId: 'strike-9',
        reason: 'Pending review of this strike',
        status: 'PENDING',
        adminNotes: null,
        createdAt: '2026-09-02T00:00:00.000Z',
        updatedAt: '2026-09-02T00:00:00.000Z',
      },
    ]);
    const { i18n } = renderWithProviders(<AppealsSettings />);

    await screen.findAllByTestId('strike-row');
    await waitFor(() => {
      expect(
        screen.queryByRole('button', {
          name: i18n!.t('settings.appeals.strike_appeal'),
        }),
      ).not.toBeInTheDocument();
    });
  });
});

describe('AppealsSettings form and list', () => {
  const appeal = (overrides: Partial<Appeal>): Appeal =>
    ({
      id: 'appeal-1',
      userId: 'u-1',
      targetType: 'POST_REMOVAL',
      targetId: null,
      reason: 'The post broke no rule',
      status: 'PENDING',
      adminNotes: null,
      createdAt: '2026-09-02T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
      ...overrides,
    }) as Appeal;
  const show = (path = '/settings/appeals') => {
    const view = renderWithProviders(<AppealsSettings />, {
      routerProps: { initialEntries: [path], useTransitions: false },
    });
    const tr = (key: string) => view.i18n!.t(`settings.appeals.${key}`);
    return {
      tr,
      t: (key: string) => view.i18n!.t(key),
      type: () => screen.getByLabelText(tr('type')) as HTMLSelectElement,
      target: () => screen.getByLabelText(tr('target_id')) as HTMLInputElement,
      reason: () => screen.getByLabelText(tr('reason')) as HTMLTextAreaElement,
      submit: () => screen.getByRole('button', { name: tr('submit') }),
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getMyAppeals).mockResolvedValue([]);
    vi.mocked(getMyStrikes).mockResolvedValue([]);
    vi.mocked(createAppeal).mockResolvedValue({ id: 'appeal-new' } as never);
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('says there are no appeals yet', async () => {
    const { tr } = show();

    expect(await screen.findByText(tr('empty'))).toBeInTheDocument();
  });

  it('opens on what a notice points at, and does not let its identifier be changed', async () => {
    const { tr, type, target } = show(
      '/settings/appeals?targetType=RESTRICTION&targetId=%20restriction-7%20',
    );

    await waitFor(() => expect(type()).toHaveValue('RESTRICTION'));
    expect(target()).toHaveValue('restriction-7');
    expect(target()).toHaveAttribute('readonly');
    expect(
      screen.getByText(tr('target_id_from_notification')),
    ).toBeInTheDocument();
  });

  it('ignores a kind it does not know, and keeps the identifier', async () => {
    const { type, target } = show(
      '/settings/appeals?targetType=SOMETHING_ELSE&targetId=post-3',
    );

    await waitFor(() => expect(target()).toHaveValue('post-3'));
    expect(type()).toHaveValue('POST_REMOVAL');
  });

  it('takes the kind alone, and leaves the identifier to the person', async () => {
    const { type, target } = show('/settings/appeals?targetType=ACCOUNT_BAN');

    await waitFor(() => expect(type()).toHaveValue('ACCOUNT_BAN'));
    expect(target()).toHaveValue('');
    expect(target()).not.toHaveAttribute('readonly');
  });

  it('sends what the person chose and wrote, trimmed, then clears the form and reads the list again', async () => {
    const { tr, type, target, reason, submit } = show();
    await screen.findByText(tr('empty'));

    fireEvent.change(type(), { target: { value: 'BOT_LABEL' } });
    fireEvent.change(target(), { target: { value: '  profile-4  ' } });
    fireEvent.change(reason(), { target: { value: '  I am a person  ' } });
    fireEvent.click(submit());

    await waitFor(() => expect(createAppeal).toHaveBeenCalled());
    expect(vi.mocked(createAppeal).mock.calls[0][0]).toEqual({
      targetType: 'BOT_LABEL',
      targetId: 'profile-4',
      reason: 'I am a person',
    });
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(tr('created')),
    );
    expect(target()).toHaveValue('');
    expect(reason()).toHaveValue('');
    await waitFor(() => expect(getMyAppeals).toHaveBeenCalledTimes(2));
  });

  it('sends no identifier when none is given', async () => {
    const { reason, submit } = show();

    fireEvent.change(reason(), { target: { value: 'About my account' } });
    fireEvent.click(submit());

    await waitFor(() => expect(createAppeal).toHaveBeenCalled());
    expect(vi.mocked(createAppeal).mock.calls[0][0]).toEqual({
      targetType: 'POST_REMOVAL',
      targetId: undefined,
      reason: 'About my account',
    });
  });

  it('does not send an appeal with no reason, also when the form is sent without its button', async () => {
    const { tr, reason, submit } = show();

    expect(submit()).toBeDisabled();
    fireEvent.change(reason(), { target: { value: '   ' } });
    expect(submit()).toBeDisabled();
    fireEvent.submit(reason().closest('form')!);

    expect(toast.error).toHaveBeenCalledWith(tr('reason_required'));
    expect(createAppeal).not.toHaveBeenCalled();
  });

  it('says so and keeps what was written when the appeal cannot be sent', async () => {
    vi.mocked(createAppeal).mockRejectedValue(new Error('no'));
    const { tr, reason, submit } = show();

    fireEvent.change(reason(), { target: { value: 'Please look again' } });
    fireEvent.click(submit());

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(tr('error')));
    expect(reason()).toHaveValue('Please look again');
    expect(getMyAppeals).toHaveBeenCalledTimes(1);
  });

  it('says why the server refused: past the six months, or already appealed', async () => {
    const view = show();
    for (const [status, code] of [
      [400, 'APPEAL_WINDOW_CLOSED'],
      [409, 'APPEAL_ALREADY_MADE'],
    ] as const) {
      vi.mocked(toast.error).mockClear();
      vi.mocked(createAppeal).mockRejectedValueOnce({
        status,
        data: { errorCode: code },
      });
      fireEvent.change(view.reason(), {
        target: { value: 'Please look again' },
      });
      fireEvent.click(view.submit());
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          view.t(`errors.codes.${code}`),
        ),
      );
    }
  });

  it('counts the reason and warns near its limit', () => {
    const { reason } = show();

    fireEvent.change(reason(), { target: { value: 'a'.repeat(449) } });
    expect(screen.getByText('449/500')).not.toHaveClass('text-brand-secondary');

    fireEvent.change(reason(), { target: { value: 'a'.repeat(450) } });
    expect(screen.getByText('450/500')).toHaveClass('text-brand-secondary');
  });

  it('lists each appeal with its kind, its state, what it is about and the answer of the team', async () => {
    vi.mocked(getMyAppeals).mockResolvedValue([
      appeal({ id: 'a-1', targetId: 'post-1234567890' }),
      appeal({
        id: 'a-2',
        targetType: 'ACCOUNT_BAN',
        status: 'APPROVED',
        adminNotes: 'Restored after review',
      }),
      appeal({ id: 'a-3', targetType: 'BOT_LABEL', status: 'REJECTED' }),
      appeal({ id: 'a-4', targetType: 'STRIKE' }),
      appeal({ id: 'a-5', targetType: 'RESTRICTION' }),
    ]);
    const { tr } = show();

    const rows = (await screen.findAllByText('The post broke no rule')).map(
      (reason) => reason.closest('li')!,
    );
    const said = (row: HTMLElement, text: string) =>
      within(row).getByText(text);
    expect(rows).toHaveLength(5);

    said(rows[0], tr('type_post'));
    said(rows[0], tr('status_pending'));
    // Only the start of the identifier.
    said(rows[0], '#post-123');
    expect(within(rows[0]).queryByText(tr('admin_notes'))).toBeNull();

    said(rows[1], tr('type_ban'));
    said(rows[1], tr('status_approved'));
    said(rows[1], tr('admin_notes'));
    said(rows[1], 'Restored after review');
    expect(within(rows[1]).queryByText(/^#/)).toBeNull();

    said(rows[2], tr('type_bot_label'));
    said(rows[2], tr('status_rejected'));
    said(rows[3], tr('type_strike'));
    said(rows[4], tr('type_restriction'));
  });
});
