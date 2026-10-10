import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MyRequests } from '../components/support/MyRequests';
import { supportApi } from '../services/support.service';
import { renderWithProviders } from '../test/test-utils';
import { SupportRequest } from './SupportRequest';

vi.mock('../services/support.service', () => ({
  supportApi: { myRequests: vi.fn(), myRequest: vi.fn(), reply: vi.fn() },
}));
vi.mock('../components/common/SEO', () => ({ default: () => null }));

const request = (overrides: Record<string, unknown> = {}) => ({
  id: 't-1',
  reference: 42,
  subject: 'I was charged twice',
  category: 'PAYMENTS',
  status: 'OPEN',
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-02T10:00:00.000Z',
  messages: [
    {
      id: 'm-1',
      authorKind: 'REQUESTER',
      body: 'I see two charges this month.',
      createdAt: '2026-09-01T10:00:00.000Z',
    },
    {
      id: 'm-2',
      authorKind: 'AGENT',
      body: 'Which days were they?',
      createdAt: '2026-09-02T10:00:00.000Z',
    },
  ],
  ...overrides,
});

const open = (data: unknown) => {
  vi.mocked(supportApi.myRequest).mockResolvedValue({ data } as never);
  return renderWithProviders(
    <Routes>
      <Route path="/support/requests/:id" element={<SupportRequest />} />
    </Routes>,
    { routerProps: { initialEntries: ['/support/requests/t-1'] } },
  );
};

const conversation = () =>
  within(screen.getByRole('list', { name: 'Conversation' })).getAllByRole(
    'listitem',
  );

describe('SupportRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the request, its state and the conversation with who said what', async () => {
    open(request());

    expect(
      await screen.findByRole('heading', { name: 'I was charged twice' }),
    ).toBeInTheDocument();
    expect(supportApi.myRequest).toHaveBeenCalledWith('t-1');
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText(/#42/)).toBeInTheDocument();
    const messages = conversation();
    expect(messages).toHaveLength(2);
    expect(messages[0]).toHaveTextContent('You');
    expect(messages[1]).toHaveTextContent('CircleSfera Support');
    expect(messages[1]).toHaveTextContent('Which days were they?');
  });

  it('sends a reply and shows the conversation the server returns', async () => {
    const after = request({
      messages: [
        ...request().messages,
        {
          id: 'm-3',
          authorKind: 'REQUESTER',
          body: 'On the 2nd and the 3rd.',
          createdAt: '2026-09-03T10:00:00.000Z',
        },
      ],
    });
    vi.mocked(supportApi.reply).mockResolvedValue({ data: after } as never);
    open(request());

    const box = await screen.findByLabelText('Reply');
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();
    fireEvent.change(box, { target: { value: '  On the 2nd and the 3rd.  ' } });
    fireEvent.click(send);

    await waitFor(() =>
      expect(supportApi.reply).toHaveBeenCalledWith(
        't-1',
        'On the 2nd and the 3rd.',
      ),
    );
    await waitFor(() => expect(conversation()).toHaveLength(3));
    expect(box).toHaveValue('');
  });

  it('says that replying to a solved request opens it again', async () => {
    open(request({ status: 'RESOLVED' }));

    expect(
      await screen.findByText('If you reply, the request opens again.'),
    ).toBeInTheDocument();
  });

  it('on a closed request, what they write opens a new one and takes them to it', async () => {
    const continued = request({
      id: 't-2',
      reference: 43,
      subject: 'Re: I was charged twice',
      previousTicketId: 't-1',
      messages: [
        {
          id: 'm-9',
          authorKind: 'REQUESTER',
          body: 'It happened again.',
          createdAt: '2026-10-01T10:00:00.000Z',
        },
      ],
    });
    vi.mocked(supportApi.reply).mockResolvedValue({ data: continued } as never);
    open(request({ status: 'CLOSED' }));

    expect(
      await screen.findByText(/This request is closed/),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Write again about this'), {
      target: { value: 'It happened again.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(supportApi.reply).toHaveBeenCalledWith(
        't-1',
        'It happened again.',
      ),
    );
    // The page is now the new request, which says what it continues.
    expect(
      await screen.findByRole('heading', { name: 'Re: I was charged twice' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Continues an earlier request' }),
    ).toHaveAttribute('href', '/support/requests/t-1');
  });

  it('says so when the request is not theirs or does not exist', async () => {
    vi.mocked(supportApi.myRequest).mockRejectedValue({ status: 404 });
    renderWithProviders(
      <Routes>
        <Route path="/support/requests/:id" element={<SupportRequest />} />
      </Routes>,
      { routerProps: { initialEntries: ['/support/requests/t-9'] } },
    );

    expect(
      await screen.findByText('We could not find this request.'),
    ).toBeInTheDocument();
  });
});

describe('MyRequests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists the requests with their number and state, each a link to its page', async () => {
    vi.mocked(supportApi.myRequests).mockResolvedValue({
      data: { data: [request({ status: 'RESOLVED' })], meta: {} },
    } as never);
    renderWithProviders(<MyRequests />);

    const link = await screen.findByRole('link', {
      name: /I was charged twice/,
    });
    expect(link).toHaveAttribute('href', '/support/requests/t-1');
    expect(link).toHaveTextContent('#42');
    expect(link).toHaveTextContent('Solved');
  });

  it('shows nothing when there are no requests', async () => {
    vi.mocked(supportApi.myRequests).mockResolvedValue({
      data: { data: [], meta: {} },
    } as never);
    const { container } = renderWithProviders(<MyRequests />);

    await waitFor(() => expect(supportApi.myRequests).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
