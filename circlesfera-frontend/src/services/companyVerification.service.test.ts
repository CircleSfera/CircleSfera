import { beforeEach, describe, expect, it, vi } from 'vitest';

const client = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));
vi.mock('./api', () => ({ apiClient: client }));

import { companyVerificationApi as api } from './companyVerification.service';

describe('companyVerificationApi', () => {
  beforeEach(() => {
    for (const fn of Object.values(client)) {
      fn.mockReset().mockResolvedValue({ data: { ok: 1 } });
    }
  });

  it('calls each route of the Profile in use and answers its data', async () => {
    const details = {
      kind: 'COMPANY' as const,
      legalName: 'Acme SL',
      taxId: 'B12345674',
      domain: 'acme.es',
    };
    await expect(api.status()).resolves.toEqual({ ok: 1 });
    await api.saveDetails(details);
    await api.checkDomain();
    await api.sendEmailCode('info');
    await api.confirmEmailCode('123456');
    await api.removeDocument('d1');
    await api.submit();
    await api.withdraw();

    expect(client.get).toHaveBeenCalledWith('/company-verification');
    expect(client.put).toHaveBeenCalledWith('/company-verification', details);
    expect(client.post.mock.calls.map((call) => call.slice(0, 2))).toEqual([
      ['/company-verification/domain/check'],
      ['/company-verification/domain/email', { localPart: 'info' }],
      ['/company-verification/domain/email/confirm', { code: '123456' }],
      ['/company-verification/submit'],
      ['/company-verification/withdraw'],
    ]);
    expect(client.delete).toHaveBeenCalledWith(
      '/company-verification/documents/d1',
    );
  });

  it('sends a document as a form with its file', async () => {
    const file = new File(['%PDF'], 'cif.pdf', { type: 'application/pdf' });
    await api.addDocument(file);
    const [path, form, options] = client.post.mock.calls[0];
    expect(path).toBe('/company-verification/documents');
    expect((form as FormData).get('file')).toBe(file);
    expect(options).toEqual({
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  });
});
