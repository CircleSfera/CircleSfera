import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { illegalNoticesApi } from '../services/illegalNotices.service';
import { renderWithProviders } from '../test/test-utils';
import ReportIllegalContent from './ReportIllegalContent';

vi.mock('../services/illegalNotices.service', () => ({
  illegalNoticesApi: { create: vi.fn() },
}));
// The bot check, passed with a button.
vi.mock('../components/auth/TurnstileWidget', () => ({
  default: ({ onToken }: { onToken: (token: string | null) => void }) => (
    <button type="button" onClick={() => onToken('token-1')}>
      pass the check
    </button>
  ),
}));

const fill = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('ReportIllegalContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(illegalNoticesApi.create).mockResolvedValue({
      data: { reference: 'ABCD1234' },
    } as never);
  });

  it('sends where the content is, why it is illegal, who notifies and good faith, and gives the reference', async () => {
    renderWithProviders(<ReportIllegalContent />);

    fill(/Address of the content/, 'https://circlesfera.com/p/1');
    fill(/Why it is illegal/, 'It sells counterfeit medicines to anyone.');
    fill(/Your name/, 'Ana');
    fill(/Your email/, 'ana@example.com');
    const send = screen.getByRole('button', { name: 'Send notice' });
    // Good faith is stated before anything is sent.
    expect(send).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /good faith/ }));
    fireEvent.click(screen.getByRole('button', { name: 'pass the check' }));
    fireEvent.click(send);

    expect(
      await screen.findByText('Notice sent. Reference: ABCD1234.'),
    ).toBeInTheDocument();
    expect(illegalNoticesApi.create).toHaveBeenCalledWith({
      contentUrl: 'https://circlesfera.com/p/1',
      explanation: 'It sells counterfeit medicines to anyone.',
      childAbuse: false,
      notifierName: 'Ana',
      notifierEmail: 'ana@example.com',
      goodFaith: true,
      locale: 'en',
      captchaToken: 'token-1',
    });
    expect(screen.getByText(/receipt by email/)).toBeInTheDocument();
  });

  it('child sexual abuse material can be sent with no name or email', async () => {
    renderWithProviders(<ReportIllegalContent />);

    fireEvent.click(
      screen.getByRole('checkbox', { name: /child sexual abuse material/ }),
    );
    expect(screen.getByLabelText(/Your name/)).not.toBeRequired();
    expect(screen.getByLabelText(/Your email/)).not.toBeRequired();
    fill(/Address of the content/, 'https://circlesfera.com/p/1');
    fill(/Why it is illegal/, 'Material showing the abuse of a child.');
    fireEvent.click(screen.getByRole('checkbox', { name: /good faith/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send notice' }));

    await waitFor(() =>
      expect(illegalNoticesApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          childAbuse: true,
          notifierName: undefined,
          notifierEmail: undefined,
        }),
      ),
    );
    expect(
      await screen.findByText(/cannot tell you the decision/),
    ).toBeInTheDocument();
  });

  it('says so when the notice is refused', async () => {
    vi.mocked(illegalNoticesApi.create).mockRejectedValue(new Error('400'));
    renderWithProviders(<ReportIllegalContent />);

    fill(/Address of the content/, 'https://circlesfera.com/p/1');
    fill(/Why it is illegal/, 'It sells counterfeit medicines to anyone.');
    fill(/Your name/, 'Ana');
    fill(/Your email/, 'ana@example.com');
    fireEvent.click(screen.getByRole('checkbox', { name: /good faith/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send notice' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
