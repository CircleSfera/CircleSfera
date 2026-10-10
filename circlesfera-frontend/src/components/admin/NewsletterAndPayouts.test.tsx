import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../services/admin.service';
import { renderWithProviders } from '../../test/test-utils';
import NewsletterTab from './NewsletterTab';
import PayoutsTab from './PayoutsTab';

vi.mock('../../services/admin.service', () => ({
  adminApi: {
    sendBroadcast: vi.fn(),
    getPayouts: vi.fn(),
    getPayoutStats: vi.fn(),
  },
}));
vi.mock('../../hooks/useDebouncedValue', () => ({
  useDebouncedValue: <T,>(value: T) => value,
}));
vi.mock('./StatCard', () => ({
  default: ({ label, value }: { label: string; value: number }) => (
    <p>
      figure {label}: {value}
    </p>
  ),
}));
vi.mock('../index', () => ({ UserAvatar: () => null }));

beforeEach(() => vi.clearAllMocks());

describe('NewsletterTab', () => {
  const onToast = vi.fn();
  const fill = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(new RegExp(label)), {
      target: { value },
    });
  const send = () => screen.getByRole('button', { name: 'Send Broadcast' });
  const fillRequired = () => {
    fill('Email Subject', 'News');
    fill('Main Title', 'A new feature');
    fill('Message Content', 'It is here.');
  };

  it.each([
    [
      'the subject',
      () => {
        fill('Main Title', 'T');
        fill('Message Content', 'C');
      },
    ],
    [
      'the title',
      () => {
        fill('Email Subject', 'S');
        fill('Message Content', 'C');
      },
    ],
    [
      'the content',
      () => {
        fill('Email Subject', 'S');
        fill('Main Title', 'T');
      },
    ],
  ])('asks for %s before anything is sent', (_what, fillRest) => {
    renderWithProviders(<NewsletterTab onToast={onToast} />);
    fillRest();

    fireEvent.click(send());

    expect(onToast).toHaveBeenCalledWith(
      'Please complete the required fields',
      'error',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(adminApi.sendBroadcast).not.toHaveBeenCalled();
  });

  it('asks again before writing to every account, and sends nothing when the answer is no', async () => {
    renderWithProviders(<NewsletterTab onToast={onToast} />);
    fillRequired();

    fireEvent.click(send());
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/ALL active users/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(adminApi.sendBroadcast).not.toHaveBeenCalled();
  });

  it('sends the message once confirmed, says so and empties the form', async () => {
    vi.mocked(adminApi.sendBroadcast).mockResolvedValue({} as never);
    renderWithProviders(<NewsletterTab onToast={onToast} />);
    fillRequired();
    fill('Button Text', 'See it');
    fill('Button URL', 'https://circlesfera.com/new');

    fireEvent.click(send());
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Send',
      }),
    );

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        'Newsletter sent successfully',
        'success',
      ),
    );
    expect(adminApi.sendBroadcast).toHaveBeenCalledWith({
      subject: 'News',
      title: 'A new feature',
      content: 'It is here.',
      buttonText: 'See it',
      buttonUrl: 'https://circlesfera.com/new',
    });
    expect(screen.getByLabelText(/Email Subject/)).toHaveValue('');
    expect(send()).toBeEnabled();
  });

  it('keeps what was written and says so when the message could not be sent', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(adminApi.sendBroadcast).mockRejectedValue(new Error('down'));
    renderWithProviders(<NewsletterTab onToast={onToast} />);
    fillRequired();

    fireEvent.click(send());
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Send',
      }),
    );

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        'Failed to send newsletter',
        'error',
      ),
    );
    expect(screen.getByLabelText(/Email Subject/)).toHaveValue('News');
  });

  it('says it is sending and takes no second press meanwhile', async () => {
    vi.mocked(adminApi.sendBroadcast).mockReturnValue(new Promise(() => {}));
    renderWithProviders(<NewsletterTab onToast={onToast} />);
    fillRequired();

    fireEvent.click(send());
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Send',
      }),
    );

    expect(
      await screen.findByRole('button', { name: 'Sending...' }),
    ).toBeDisabled();
  });

  it('shows the message as it will arrive, with its button only when it has text and address', () => {
    renderWithProviders(<NewsletterTab onToast={onToast} />);

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByText('Subject: (No subject)')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Email Title' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Your message content will appear here...'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Content' }));
    fillRequired();
    fill('Button Text', 'See it');
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByText('Subject: News')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'A new feature' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('See it')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Content' }));
    fill('Button URL', 'https://circlesfera.com/new');
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByText('See it')).toBeInTheDocument();
  });
});

describe('PayoutsTab', () => {
  let where = '';
  function Where() {
    where = useLocation().search;
    return null;
  }
  const payout = (id: string, over: object = {}) => ({
    id,
    status: 'paid',
    amountCents: 12550,
    currency: 'EUR',
    arrivalDate: '2026-03-05T00:00:00Z',
    failureReason: null,
    user: {
      email: `${id}@example.com`,
      profile: { fullName: `Person ${id}`, username: id, avatar: null },
    },
    ...over,
  });
  const page = (rows: object[], pageNumber = 1, totalPages = 1) => ({
    data: {
      data: rows,
      meta: { total: rows.length, page: pageNumber, limit: 20, totalPages },
    },
  });
  const show = (path = '/admin/payouts') =>
    renderWithProviders(
      <>
        <Where />
        <PayoutsTab />
      </>,
      { routerProps: { initialEntries: [path], useTransitions: false } },
    );

  beforeEach(() => {
    where = '';
    vi.mocked(adminApi.getPayoutStats).mockResolvedValue({
      data: { paid: 5, pending: 2, failed: 1, total: 8 },
    } as never);
    vi.mocked(adminApi.getPayouts).mockResolvedValue(
      page([payout('ana')]) as never,
    );
  });

  it('shows the three figures and each withdrawal with its amount, date and state', async () => {
    show();

    expect(await screen.findByText('Person ana')).toBeInTheDocument();
    expect(screen.getByText('@ana')).toBeInTheDocument();
    expect(screen.getByText('figure Paid: 5')).toBeInTheDocument();
    expect(screen.getByText('figure Pending: 2')).toBeInTheDocument();
    expect(screen.getByText('figure Failed: 1')).toBeInTheDocument();
    expect(screen.getByText(/125[.,]50/)).toBeInTheDocument();
    expect(adminApi.getPayouts).toHaveBeenCalledWith(1, 20, undefined, '');
  });

  it('shows zero figures until they arrive', () => {
    vi.mocked(adminApi.getPayoutStats).mockReturnValue(new Promise(() => {}));
    show();
    expect(screen.getByText('figure Paid: 0')).toBeInTheDocument();
  });

  it('shows the state of each withdrawal as the payment provider names it, and why one failed', async () => {
    vi.mocked(adminApi.getPayouts).mockResolvedValue(
      page([
        payout('ana', { status: 'failed', failureReason: 'Account closed' }),
        payout('ben', { status: 'in_transit' }),
      ]) as never,
    );
    show();

    expect(await screen.findByText('failed')).toBeInTheDocument();
    expect(screen.getByText('in_transit')).toBeInTheDocument();
    expect(screen.getByText('Account closed')).toBeInTheDocument();
  });

  it('names an account with no profile by its email', async () => {
    vi.mocked(adminApi.getPayouts).mockResolvedValue(
      page([
        payout('x', { user: { email: 'x@example.com', profile: null } }),
      ]) as never,
    );
    show();

    expect(await screen.findByText('x@example.com')).toBeInTheDocument();
    expect(screen.getByText('@user')).toBeInTheDocument();
  });

  it('filters by state and by text, going back to the first page and keeping the search in the address', async () => {
    show('/admin/payouts?page=3');
    await screen.findByText('Person ana');
    expect(adminApi.getPayouts).toHaveBeenCalledWith(3, 20, undefined, '');

    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), {
      target: { value: 'failed' },
    });
    await waitFor(() =>
      expect(adminApi.getPayouts).toHaveBeenLastCalledWith(1, 20, 'failed', ''),
    );

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search by user or ID...' }),
      { target: { value: 'ana' } },
    );
    await waitFor(() =>
      expect(adminApi.getPayouts).toHaveBeenLastCalledWith(
        1,
        20,
        'failed',
        'ana',
      ),
    );
    expect(where).toContain('q=ana');

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search by user or ID...' }),
      { target: { value: '' } },
    );
    await waitFor(() => expect(where).not.toContain('q='));
  });

  it('starts from the search the address carries', async () => {
    show('/admin/payouts?q=ben');
    await waitFor(() =>
      expect(adminApi.getPayouts).toHaveBeenCalledWith(1, 20, undefined, 'ben'),
    );
    expect(
      screen.getByRole('textbox', { name: 'Search by user or ID...' }),
    ).toHaveValue('ben');
  });

  it('moves between pages through the address, and offers no pages for a single one', async () => {
    vi.mocked(adminApi.getPayouts).mockResolvedValue(
      page([payout('ana')], 1, 3) as never,
    );
    const many = show();
    await screen.findByText('Person ana');

    fireEvent.click(
      screen.getByRole('button', {
        name: many.i18n!.t('admin.table.next_page'),
      }),
    );
    await waitFor(() => expect(where).toContain('page=2'));
    many.unmount();

    vi.mocked(adminApi.getPayouts).mockResolvedValue(
      page([payout('ana')]) as never,
    );
    const one = show();
    await screen.findByText('Person ana');
    expect(
      screen.queryByRole('button', {
        name: one.i18n!.t('admin.table.next_page'),
      }),
    ).not.toBeInTheDocument();
  });

  it('says there are no withdrawals', async () => {
    vi.mocked(adminApi.getPayouts).mockResolvedValue(page([]) as never);
    show();
    expect(await screen.findByText('No payouts recorded')).toBeInTheDocument();
  });
});
