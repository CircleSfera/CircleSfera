import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './api';
import { passkeyApi } from './passkey.service';

vi.mock('./api', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

describe('passkeyApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls the passkey endpoints with the browser responses', async () => {
    const response = { id: 'cred' };

    await passkeyApi.getRegistrationOptions();
    await passkeyApi.verifyRegistration(response);
    await passkeyApi.getLoginOptions('ana@example.com');
    await passkeyApi.verifyLogin('ana@example.com', response);
    await passkeyApi.listPasskeys();
    await passkeyApi.getStepUpOptions();

    expect(apiClient.post).toHaveBeenNthCalledWith(
      1,
      'auth/passkey/register-options',
    );
    expect(apiClient.post).toHaveBeenNthCalledWith(
      2,
      'auth/passkey/register-verify',
      { registrationResponse: response },
    );
    expect(apiClient.post).toHaveBeenNthCalledWith(
      3,
      'auth/passkey/login-options',
      { email: 'ana@example.com' },
    );
    expect(apiClient.post).toHaveBeenNthCalledWith(
      4,
      'auth/passkey/login-verify',
      { email: 'ana@example.com', authenticationResponse: response },
    );
    expect(apiClient.get).toHaveBeenCalledWith('auth/passkey');
    expect(apiClient.post).toHaveBeenNthCalledWith(
      5,
      'auth/passkey/step-up-options',
    );
  });

  it('removes a passkey only with a fresh passkey confirmation', async () => {
    const assertion = { id: 'assertion' };

    await passkeyApi.deletePasskey('pk 1', assertion);

    expect(apiClient.delete).toHaveBeenCalledWith('auth/passkey/pk 1', {
      data: { authenticationResponse: assertion },
    });
  });
});
