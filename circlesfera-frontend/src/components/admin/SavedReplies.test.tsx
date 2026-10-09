import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../services/admin.service';
import { renderWithProviders } from '../../test/test-utils';
import { SavedReplies } from './SavedReplies';

vi.mock('../../services/admin.service', () => ({
  adminApi: {
    getSavedReplies: vi.fn(),
    createSavedReply: vi.fn(),
    updateSavedReply: vi.fn(),
    deleteSavedReply: vi.fn(),
  },
}));

const reply = (overrides: Record<string, unknown>) => ({
  id: 'r-1',
  title: 'Refund',
  body: 'Hello {{name}}, your refund is on its way.',
  shared: false,
  updatedAt: '2026-09-01T10:00:00.000Z',
  ...overrides,
});
const mine = reply({});
const shared = reply({ id: 'r-2', title: 'Opening hours', shared: true });

describe('SavedReplies', () => {
  const onInsert = vi.fn();
  const onToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminApi.getSavedReplies).mockResolvedValue({
      data: [shared, mine],
    } as never);
    for (const call of ['createSavedReply', 'updateSavedReply'] as const) {
      vi.mocked(adminApi[call]).mockResolvedValue({ data: mine } as never);
    }
    vi.mocked(adminApi.deleteSavedReply).mockResolvedValue({
      data: { deleted: true },
    } as never);
  });

  // Renders and opens the panel once the replies are there.
  const manage = async (leadsTeam: boolean) => {
    const { i18n } = renderWithProviders(
      <SavedReplies
        leadsTeam={leadsTeam}
        onInsert={onInsert}
        onToast={onToast}
      />,
    );
    const t = (key: string, values?: Record<string, string>) =>
      i18n!.t(`admin.support.saved_replies.${key}`, values);
    await screen.findByRole('combobox', { name: t('insert') });
    fireEvent.click(screen.getByRole('button', { name: t('manage') }));
    return { t, panel: within(await screen.findByRole('dialog')) };
  };

  it('hands the text of the chosen reply to the reply box, as it is stored', async () => {
    const { i18n } = renderWithProviders(
      <SavedReplies leadsTeam={false} onInsert={onInsert} onToast={onToast} />,
    );
    const selector = await screen.findByRole('combobox', {
      name: i18n!.t('admin.support.saved_replies.insert'),
    });

    fireEvent.change(selector, { target: { value: 'r-1' } });

    expect(onInsert).toHaveBeenCalledWith(mine.body);
    // Ready to insert another one.
    expect(selector).toHaveValue('');
  });

  it('offers no selector when there is nothing saved, and says how to start', async () => {
    vi.mocked(adminApi.getSavedReplies).mockResolvedValue({
      data: [],
    } as never);
    const { i18n } = renderWithProviders(
      <SavedReplies leadsTeam={false} onInsert={onInsert} onToast={onToast} />,
    );
    const t = (key: string) => i18n!.t(`admin.support.saved_replies.${key}`);

    fireEvent.click(await screen.findByRole('button', { name: t('manage') }));

    expect(await screen.findByText(t('empty'))).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: t('insert') })).toBeNull();
  });

  it('lets an agent change and delete their own reply, and only read a shared one', async () => {
    const { t, panel } = await manage(false);

    expect(panel.getByText(t('kind_shared'))).toBeInTheDocument();
    expect(panel.getByText(t('kind_personal'))).toBeInTheDocument();
    expect(
      panel.queryByRole('button', {
        name: t('edit_named', { title: 'Opening hours' }),
      }),
    ).toBeNull();
    expect(
      panel.queryByRole('button', {
        name: t('delete_named', { title: 'Opening hours' }),
      }),
    ).toBeNull();

    // Deleting asks once more before it happens.
    fireEvent.click(
      panel.getByRole('button', {
        name: t('delete_named', { title: 'Refund' }),
      }),
    );
    expect(adminApi.deleteSavedReply).not.toHaveBeenCalled();
    fireEvent.click(panel.getByRole('button', { name: t('delete_confirm') }));

    await waitFor(() =>
      expect(adminApi.deleteSavedReply).toHaveBeenCalledWith('r-1'),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(t('toast_deleted'), 'success'),
    );
  });

  it('writes a new personal reply; an agent is not offered to share it', async () => {
    const { t, panel } = await manage(false);

    fireEvent.click(panel.getByRole('button', { name: t('new') }));
    expect(panel.queryByRole('checkbox')).toBeNull();
    // The three placeholders are shown as they must be typed.
    expect(
      panel.getByText(/\{\{name\}\}.*\{\{subject\}\}.*\{\{reference\}\}/),
    ).toBeInTheDocument();
    const save = panel.getByRole('button', { name: t('save') });
    expect(save).toBeDisabled();
    fireEvent.change(panel.getByLabelText(t('field_title')), {
      target: { value: '  Payout dates  ' },
    });
    fireEvent.change(panel.getByLabelText(t('field_body')), {
      target: { value: '  Payouts go out on Mondays.  ' },
    });
    fireEvent.click(save);

    await waitFor(() =>
      expect(adminApi.createSavedReply).toHaveBeenCalledWith({
        title: 'Payout dates',
        body: 'Payouts go out on Mondays.',
      }),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(t('toast_saved'), 'success'),
    );
  });

  it('lets who leads the team share a new reply and change a shared one', async () => {
    const { t, panel } = await manage(true);

    fireEvent.click(
      panel.getByRole('button', {
        name: t('edit_named', { title: 'Opening hours' }),
      }),
    );
    // Whose a reply is does not change once written.
    expect(panel.queryByRole('checkbox')).toBeNull();
    fireEvent.change(panel.getByLabelText(t('field_title')), {
      target: { value: 'Hours' },
    });
    fireEvent.click(panel.getByRole('button', { name: t('save') }));
    await waitFor(() =>
      expect(adminApi.updateSavedReply).toHaveBeenCalledWith('r-2', {
        title: 'Hours',
        body: shared.body,
      }),
    );

    fireEvent.click(await panel.findByRole('button', { name: t('new') }));
    fireEvent.change(panel.getByLabelText(t('field_title')), {
      target: { value: 'For all' },
    });
    fireEvent.change(panel.getByLabelText(t('field_body')), {
      target: { value: 'Text' },
    });
    fireEvent.click(panel.getByRole('checkbox'));
    fireEvent.click(panel.getByRole('button', { name: t('save') }));

    await waitFor(() =>
      expect(adminApi.createSavedReply).toHaveBeenCalledWith({
        title: 'For all',
        body: 'Text',
        shared: true,
      }),
    );
  });

  it('says so when saving fails, and keeps what was written', async () => {
    vi.mocked(adminApi.createSavedReply).mockRejectedValue(new Error('down'));
    const { t, panel } = await manage(false);

    fireEvent.click(panel.getByRole('button', { name: t('new') }));
    fireEvent.change(panel.getByLabelText(t('field_title')), {
      target: { value: 'Title' },
    });
    fireEvent.change(panel.getByLabelText(t('field_body')), {
      target: { value: 'Text' },
    });
    fireEvent.click(panel.getByRole('button', { name: t('save') }));

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(expect.any(String), 'error'),
    );
    expect(panel.getByLabelText(t('field_title'))).toHaveValue('Title');
  });
});
