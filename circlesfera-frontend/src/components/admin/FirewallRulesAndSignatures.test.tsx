import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../services/admin.service';
import { renderWithProviders } from '../../test/test-utils';
import FirewallRulesTab from './FirewallRulesTab';
import FirewallSignaturesTab from './FirewallSignaturesTab';

vi.mock('../../services/admin.service', () => ({
  adminApi: {
    getFirewallRules: vi.fn(),
    createFirewallRule: vi.fn(),
    updateFirewallRule: vi.fn(),
    deleteFirewallRule: vi.fn(),
    getFirewallSignatures: vi.fn(),
    addFirewallSignature: vi.fn(),
    deleteFirewallSignature: vi.fn(),
  },
}));
vi.mock('../../hooks/useDebouncedValue', () => ({
  useDebouncedValue: <T,>(value: T) => value,
}));

const api = vi.mocked(adminApi);
const onToast = vi.fn();

const list = <T,>(rows: T[], pageNumber = 1, totalPages = 1) => ({
  data: {
    data: rows,
    meta: {
      total: rows.length * totalPages,
      page: pageNumber,
      limit: 20,
      totalPages,
    },
  },
});
const rowOf = (text: string) =>
  screen
    .getAllByText(text)
    .map((el) => el.closest('[data-admin-row]'))
    .find(Boolean) as HTMLElement;
const detail = () => screen.getByRole('region', { name: 'Detail' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FirewallRulesTab', () => {
  const rule = (id: string, over: object = {}) => ({
    id,
    keyword: `word-${id}`,
    action: 'FLAG',
    isActive: true,
    createdBy: 'staff',
    createdAt: '2026-03-10T11:00:00Z',
    updatedAt: '2026-03-10T11:00:00Z',
    ...over,
  });
  const show = (lng: 'en' | 'es' = 'en') =>
    renderWithProviders(<FirewallRulesTab onToast={onToast} />, { lng });

  beforeEach(() => {
    api.getFirewallRules.mockResolvedValue(list([]) as never);
    api.createFirewallRule.mockResolvedValue({} as never);
    api.updateFirewallRule.mockResolvedValue({} as never);
    api.deleteFirewallRule.mockResolvedValue({} as never);
  });

  it('says there are no rules, with no page controls', async () => {
    show();

    expect(await screen.findByText('No static rules')).toBeInTheDocument();
    expect(api.getFirewallRules).toHaveBeenCalledWith(1, 20, '');
    expect(
      screen.queryByRole('button', { name: 'Next page' }),
    ).not.toBeInTheDocument();
  });

  it('lists each rule with what it does, and searches from the first page', async () => {
    api.getFirewallRules.mockImplementation((pageNumber = 1, _limit, search) =>
      Promise.resolve(
        (search
          ? list([rule('found', { action: 'BLOCK' })])
          : list(
              [
                rule(`p${pageNumber}`),
                rule(`m${pageNumber}`, { action: 'MUTE' }),
              ],
              pageNumber,
              3,
            )) as never,
      ),
    );
    show();

    await screen.findByText('word-p1');
    expect(within(rowOf('word-p1')).getByText('Sends to review')).toHaveClass(
      'text-yellow-400',
    );
    expect(within(rowOf('word-m1')).getByText('Hides from others')).toHaveClass(
      'text-brand-blue',
    );
    expect(
      within(rowOf('word-p1')).getByText(/^Added on /),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByText('word-p2');
    expect(api.getFirewallRules).toHaveBeenLastCalledWith(2, 20, '');

    fireEvent.change(screen.getByRole('textbox', { name: 'Search rules' }), {
      target: { value: 'casino' },
    });
    await waitFor(() =>
      expect(api.getFirewallRules).toHaveBeenLastCalledWith(1, 20, 'casino'),
    );
    expect(
      within(await waitFor(() => rowOf('word-found'))).getByText('Blocks'),
    ).toHaveClass('text-red-400');
  });

  it('adds a rule with its keyword trimmed and the chosen action', async () => {
    show();
    await screen.findByText('No static rules');

    fireEvent.click(screen.getByRole('button', { name: 'New rule' }));
    const form = detail();
    expect(
      within(form).getByRole('heading', { name: 'New rule' }),
    ).toBeInTheDocument();
    const save = within(form).getByRole('button', { name: 'Save rule' });
    expect(save).toBeDisabled();
    fireEvent.change(
      within(form).getByRole('textbox', { name: 'Keyword or phrase' }),
      { target: { value: '   ' } },
    );
    expect(save).toBeDisabled();

    fireEvent.change(
      within(form).getByRole('textbox', { name: 'Keyword or phrase' }),
      { target: { value: '  spamcasino.com ' } },
    );
    expect(within(form).getByRole('combobox', { name: 'Action' })).toHaveValue(
      'FLAG',
    );
    fireEvent.change(within(form).getByRole('combobox', { name: 'Action' }), {
      target: { value: 'BLOCK' },
    });
    fireEvent.click(save);

    await waitFor(() =>
      expect(api.createFirewallRule).toHaveBeenCalledWith({
        keyword: 'spamcasino.com',
        action: 'BLOCK',
      }),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Rule added', 'success'),
    );
    expect(
      screen.queryByRole('heading', { name: 'New rule' }),
    ).not.toBeInTheDocument();
    expect(api.getFirewallRules).toHaveBeenCalledTimes(2);
  });

  it('starts a new rule empty after one was cancelled', async () => {
    show();
    await screen.findByText('No static rules');

    fireEvent.click(screen.getByRole('button', { name: 'New rule' }));
    fireEvent.change(
      within(detail()).getByRole('textbox', { name: 'Keyword or phrase' }),
      { target: { value: 'half typed' } },
    );
    fireEvent.click(within(detail()).getByRole('button', { name: 'Cancel' }));
    expect(
      screen.queryByRole('heading', { name: 'New rule' }),
    ).not.toBeInTheDocument();
    expect(api.createFirewallRule).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'New rule' }));
    expect(
      within(detail()).getByRole('textbox', { name: 'Keyword or phrase' }),
    ).toHaveValue('');
  });

  it('says so when a rule cannot be added and keeps the form', async () => {
    api.createFirewallRule.mockRejectedValue(new Error('no'));
    show();
    await screen.findByText('No static rules');
    fireEvent.click(screen.getByRole('button', { name: 'New rule' }));
    fireEvent.change(
      within(detail()).getByRole('textbox', { name: 'Keyword or phrase' }),
      { target: { value: 'word' } },
    );

    fireEvent.click(
      within(detail()).getByRole('button', { name: 'Save rule' }),
    );

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Error adding rule', 'error'),
    );
    expect(
      within(detail()).getByRole('textbox', { name: 'Keyword or phrase' }),
    ).toHaveValue('word');
  });

  it('opens a rule and changes what it does, except to what it already does', async () => {
    api.getFirewallRules.mockResolvedValue(list([rule('a')]) as never);
    show();
    await screen.findByText('word-a');

    fireEvent.click(rowOf('word-a'));
    const open = detail();
    expect(
      within(open).getByRole('heading', { name: 'word-a' }),
    ).toBeInTheDocument();
    const sends = within(open).getByRole('button', {
      name: 'Send to the review queue',
    });
    expect(sends).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(sends);
    expect(api.updateFirewallRule).not.toHaveBeenCalled();

    fireEvent.click(
      within(open).getByRole('button', { name: 'Refuse the publication' }),
    );
    await waitFor(() =>
      expect(api.updateFirewallRule).toHaveBeenCalledWith('a', {
        action: 'BLOCK',
      }),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Rule updated', 'success'),
    );

    fireEvent.click(
      within(open).getByRole('button', {
        name: 'Publish, hidden from others',
      }),
    );
    await waitFor(() =>
      expect(api.updateFirewallRule).toHaveBeenLastCalledWith('a', {
        action: 'MUTE',
      }),
    );
  });

  it('says a rule is off in its row and switches it on and off from its record', async () => {
    api.getFirewallRules.mockResolvedValue(
      list([rule('on'), rule('off', { isActive: false })]) as never,
    );
    show();
    await screen.findByText('word-on');

    expect(rowOf('word-off')).toHaveTextContent(/^.*Off · Added on /);
    expect(rowOf('word-on')).not.toHaveTextContent('Off ·');

    fireEvent.click(rowOf('word-off'));
    expect(
      within(detail()).getByText('The rule is kept but not applied.'),
    ).toBeInTheDocument();
    fireEvent.click(
      within(detail()).getByRole('button', { name: 'Switch on' }),
    );
    await waitFor(() =>
      expect(api.updateFirewallRule).toHaveBeenCalledWith('off', {
        isActive: true,
      }),
    );

    fireEvent.click(rowOf('word-on'));
    fireEvent.click(
      within(detail()).getByRole('button', { name: 'Switch off' }),
    );
    await waitFor(() =>
      expect(api.updateFirewallRule).toHaveBeenLastCalledWith('on', {
        isActive: false,
      }),
    );
  });

  it.each([
    ['BLOCK', 'Refuse the publication', 'Send to the review queue'],
    ['MUTE', 'Publish, hidden from others', 'Send to the review queue'],
  ])(
    'marks the %s choice on a rule that already does that',
    async (action, held, free) => {
      api.updateFirewallRule.mockRejectedValue(new Error('no'));
      api.getFirewallRules.mockResolvedValue(
        list([rule('a', { action })]) as never,
      );
      show();
      await screen.findByText('word-a');
      fireEvent.click(rowOf('word-a'));

      expect(
        within(detail()).getByRole('button', { name: held }),
      ).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(within(detail()).getByRole('button', { name: free }));

      await waitFor(() =>
        expect(onToast).toHaveBeenCalledWith('Error updating rule', 'error'),
      );
      expect(api.updateFirewallRule).toHaveBeenCalledWith('a', {
        action: 'FLAG',
      });
    },
  );

  it('deletes the open rule only after confirming, then goes back to the list', async () => {
    api.getFirewallRules.mockResolvedValue(list([rule('a')]) as never);
    show();
    await screen.findByText('word-a');
    fireEvent.click(rowOf('word-a'));

    fireEvent.click(within(detail()).getByRole('button', { name: 'Delete' }));
    let dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Delete this rule?')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(api.deleteFirewallRule).not.toHaveBeenCalled();

    fireEvent.click(within(detail()).getByRole('button', { name: 'Delete' }));
    dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(api.deleteFirewallRule).toHaveBeenCalledWith('a'),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Rule deleted', 'success'),
    );
    expect(
      screen.queryByRole('heading', { name: 'word-a' }),
    ).not.toBeInTheDocument();
  });

  it('says so when a rule cannot be deleted', async () => {
    api.deleteFirewallRule.mockRejectedValue(new Error('no'));
    api.getFirewallRules.mockResolvedValue(list([rule('a')]) as never);
    show();
    await screen.findByText('word-a');
    fireEvent.click(rowOf('word-a'));

    fireEvent.click(within(detail()).getByRole('button', { name: 'Delete' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Delete',
      }),
    );

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Error deleting rule', 'error'),
    );
    expect(
      within(detail()).getByRole('heading', { name: 'word-a' }),
    ).toBeInTheDocument();
  });

  it('goes back to the list from an open rule, by button or Escape', async () => {
    api.getFirewallRules.mockResolvedValue(list([rule('a')]) as never);
    show();
    await screen.findByText('word-a');

    fireEvent.click(rowOf('word-a'));
    fireEvent.click(within(detail()).getByRole('button', { name: 'Back' }));
    expect(
      screen.queryByRole('heading', { name: 'word-a' }),
    ).not.toBeInTheDocument();

    fireEvent.click(rowOf('word-a'));
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'word-a' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('shows the rule and its form in English to staff who use English, and in Spanish to the rest', async () => {
    api.getFirewallRules.mockResolvedValue(list([rule('a')]) as never);
    const { unmount } = show('en');
    await screen.findByText('word-a');
    fireEvent.click(rowOf('word-a'));
    for (const text of ['What it does', 'State', 'Switch off']) {
      expect(within(detail()).getByText(text)).toBeInTheDocument();
    }
    expect(detail()).not.toHaveTextContent(/Qué hace|Estado|Desactivar/);
    unmount();

    show('es');
    await screen.findByText('word-a');
    fireEvent.click(screen.getByRole('button', { name: 'Nueva regla' }));
    const form = screen.getByRole('region', { name: 'Detalle' });
    expect(
      within(form).getByRole('textbox', { name: 'Palabra clave o frase' }),
    ).toBeInTheDocument();
    expect(
      within(form).getByRole('option', {
        name: 'Rechazar la publicación',
      }),
    ).toBeInTheDocument();
  });
});

describe('FirewallSignaturesTab', () => {
  const signature = (id: string, over: object = {}) => ({
    id: `${id}-0000-1111`,
    textPreview: `Preview ${id}`,
    category: 'spam',
    createdAt: '2026-03-10T11:00:00Z',
    ...over,
  });
  const show = () =>
    renderWithProviders(<FirewallSignaturesTab onToast={onToast} />);

  beforeEach(() => {
    api.getFirewallSignatures.mockResolvedValue(list([]) as never);
    api.addFirewallSignature.mockResolvedValue({} as never);
    api.deleteFirewallSignature.mockResolvedValue({} as never);
  });

  it('says there are no signatures and offers to add the first', async () => {
    show();

    expect(await screen.findByText('No signatures')).toBeInTheDocument();
    expect(api.getFirewallSignatures).toHaveBeenCalledWith(1, 20);

    fireEvent.click(screen.getByRole('button', { name: 'Add signature' }));
    expect(
      within(detail()).getByRole('heading', { name: 'New signature' }),
    ).toBeInTheDocument();
  });

  it('lists each signature with its text and its category in words, and pages', async () => {
    api.getFirewallSignatures.mockImplementation((pageNumber = 1) =>
      Promise.resolve(
        list(
          [
            signature(`p${pageNumber}`),
            signature(`t${pageNumber}`, {
              textPreview: undefined,
              text: `Full text ${pageNumber}`,
              category: 'hate',
            }),
            signature(`n${pageNumber}`, { textPreview: null }),
          ],
          pageNumber,
          2,
        ) as never,
      ),
    );
    show();

    await screen.findByText('Preview p1');
    const first = rowOf('Preview p1');
    expect(within(first).getByText('Spam')).toBeInTheDocument();
    expect(within(first).getByText(/^Added on /)).toBeInTheDocument();
    expect(first).not.toHaveTextContent('p1-0000');
    expect(within(rowOf('Full text 1')).getByText('Hate')).toBeInTheDocument();
    expect(rowOf('Signature with no stored text')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('Preview p2')).toBeInTheDocument();
    expect(api.getFirewallSignatures).toHaveBeenLastCalledWith(2, 20);
  });

  it('adds a signature with its text trimmed and the chosen category', async () => {
    show();
    await screen.findByText('No signatures');

    fireEvent.click(screen.getByRole('button', { name: 'New signature' }));
    const form = detail();
    const submit = within(form).getByRole('button', {
      name: 'Create signature',
    });
    expect(submit).toBeDisabled();
    fireEvent.change(
      within(form).getByRole('textbox', { name: 'Source text' }),
      {
        target: { value: '  Earn free money  ' },
      },
    );
    expect(
      within(form).getByRole('combobox', { name: 'Category' }),
    ).toHaveValue('SPAM');
    fireEvent.change(within(form).getByRole('combobox', { name: 'Category' }), {
      target: { value: 'SCAM' },
    });
    fireEvent.click(submit);

    await waitFor(() =>
      expect(api.addFirewallSignature).toHaveBeenCalledWith(
        'Earn free money',
        'SCAM',
      ),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Signature added', 'success'),
    );
    expect(
      screen.queryByRole('heading', { name: 'New signature' }),
    ).not.toBeInTheDocument();
    expect(api.getFirewallSignatures).toHaveBeenCalledTimes(2);
  });

  it('cancels a new signature, and says so when one cannot be added', async () => {
    api.addFirewallSignature.mockRejectedValue(new Error('no'));
    show();
    await screen.findByText('No signatures');

    fireEvent.click(screen.getByRole('button', { name: 'New signature' }));
    fireEvent.change(
      within(detail()).getByRole('textbox', { name: 'Source text' }),
      { target: { value: 'half' } },
    );
    fireEvent.click(within(detail()).getByRole('button', { name: 'Cancel' }));
    expect(
      screen.queryByRole('heading', { name: 'New signature' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'New signature' }));
    const text = within(detail()).getByRole('textbox', { name: 'Source text' });
    expect(text).toHaveValue('');
    fireEvent.change(text, { target: { value: 'again' } });
    fireEvent.click(
      within(detail()).getByRole('button', { name: 'Create signature' }),
    );

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        'The signature could not be added',
        'error',
      ),
    );
    expect(
      within(detail()).getByRole('heading', { name: 'New signature' }),
    ).toBeInTheDocument();
  });

  it('opens a signature with its whole id and deletes it after confirming', async () => {
    api.getFirewallSignatures.mockResolvedValue(
      list([signature('a'), signature('n', { textPreview: null })]) as never,
    );
    show();
    await screen.findByText('Preview a');

    fireEvent.click(rowOf('Signature with no stored text'));
    expect(
      within(detail()).getByText('Signature with no stored text'),
    ).toBeInTheDocument();

    fireEvent.click(rowOf('Preview a'));
    const open = detail();
    expect(within(open).getByText('a-0000-1111')).toBeInTheDocument();
    expect(within(open).getByText('Spam')).toBeInTheDocument();

    fireEvent.click(within(open).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText('Delete this signature?'),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(api.deleteFirewallSignature).toHaveBeenCalledWith('a-0000-1111'),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Signature deleted', 'success'),
    );
    expect(screen.queryByText('a-0000-1111')).not.toBeInTheDocument();
  });

  it('deletes from the row without opening, cancels, and says so on failure', async () => {
    api.deleteFirewallSignature.mockRejectedValue(new Error('no'));
    api.getFirewallSignatures.mockResolvedValue(
      list([signature('a')]) as never,
    );
    show();
    await screen.findByText('Preview a');

    fireEvent.click(
      within(rowOf('Preview a')).getByRole('button', { name: 'More actions' }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(screen.queryByText('a-0000-1111')).not.toBeInTheDocument();
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(api.deleteFirewallSignature).not.toHaveBeenCalled();

    fireEvent.click(
      within(rowOf('Preview a')).getByRole('button', { name: 'More actions' }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Delete',
      }),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        'The signature could not be deleted',
        'error',
      ),
    );
    expect(screen.getByText('Preview a')).toBeInTheDocument();
  });
});
