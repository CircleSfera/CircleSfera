import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { toast } from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usersApi } from '../services/users.service';
import { createTestI18n } from '../test/test-utils';
import {
  promptIdentityVerification,
  reportPaymentError,
} from './identityVerification';

vi.mock('../services/users.service', () => ({
  usersApi: { createIdentitySession: vi.fn() },
}));
vi.mock('react-hot-toast', () => {
  const t = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  });
  return { toast: t, default: t };
});

const { t } = createTestI18n('en');
const originalLocation = window.location;
const location = { href: 'https://circlesfera.test/p/1' };

// Renders the notice the way the toast library would.
function openNotice() {
  const renderNotice = vi.mocked(toast).mock.calls[0][0] as unknown as (item: {
    id: string;
  }) => ReactElement;
  render(renderNotice({ id: 'toast-1' }));
  return screen.getByRole('button', { name: t('pricingPage.verify_button') });
}

describe('identity verification notice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    location.href = 'https://circlesfera.test/p/1';
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: location,
    });
  });
  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('explains what is missing and opens the verification, returning to this page', async () => {
    vi.mocked(usersApi.createIdentitySession).mockResolvedValue({
      url: 'https://verify.stripe.com/start',
    });
    promptIdentityVerification(t);

    const verify = openNotice();
    expect(
      screen.getByText(t('pricingPage.verification_required_title')),
    ).toBeInTheDocument();
    expect(
      screen.getByText(t('pricingPage.verification_required_desc')),
    ).toBeInTheDocument();
    fireEvent.click(verify);

    await waitFor(() =>
      expect(location.href).toBe('https://verify.stripe.com/start'),
    );
    expect(usersApi.createIdentitySession).toHaveBeenCalledWith(
      'https://circlesfera.test/p/1',
    );
    expect(toast.dismiss).toHaveBeenCalledWith('toast-1');
  });

  it('says so when the verification cannot be started', async () => {
    vi.mocked(usersApi.createIdentitySession).mockRejectedValue(
      new Error('down'),
    );
    promptIdentityVerification(t);

    fireEvent.click(openNotice());

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(t('pricingPage.verify_error')),
    );
    expect(location.href).toBe('https://circlesfera.test/p/1');
  });

  it('stays on the page when the verification answers with no address', async () => {
    vi.mocked(usersApi.createIdentitySession).mockResolvedValue({});
    promptIdentityVerification(t);

    fireEvent.click(openNotice());

    await waitFor(() =>
      expect(usersApi.createIdentitySession).toHaveBeenCalled(),
    );
    expect(location.href).toBe('https://circlesfera.test/p/1');
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe('reportPaymentError', () => {
  beforeEach(() => vi.clearAllMocks());

  it('offers the verification for the server code and for the sentence of older servers', () => {
    reportPaymentError(
      Object.assign(new Error('x'), {
        status: 403,
        data: { errorCode: 'IDENTITY_VERIFICATION_REQUIRED' },
      }),
      t,
      'wallet.error_send_tip',
    );
    reportPaymentError(
      Object.assign(
        new Error('Debes verificar tu identidad primero para poder comprar.'),
        { status: 403, data: {} },
      ),
      t,
      'wallet.error_send_tip',
    );

    expect(toast).toHaveBeenCalledTimes(2);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows the screen's own message for any other failure", () => {
    reportPaymentError(
      Object.assign(new Error('Internal'), { status: 400, data: {} }),
      t,
      'wallet.error_send_tip',
    );

    expect(toast.error).toHaveBeenCalledWith(t('wallet.error_send_tip'));
    expect(toast).not.toHaveBeenCalled();
  });
});
