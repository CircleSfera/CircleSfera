import { describe, expect, it } from 'vitest';
import { isAdminPanelHost, isBackofficeHost, isStaffHost } from './adminPanel';

describe('staff hosts', () => {
  it.each(['backoffice.circlesfera.com', 'backoffice.localhost'])(
    'recognises %s as the Backoffice',
    (host) => {
      expect(isBackofficeHost(host)).toBe(true);
      expect(isAdminPanelHost(host)).toBe(false);
      expect(isStaffHost(host)).toBe(true);
    },
  );

  it.each(['admin.circlesfera.com', 'admin.localhost'])(
    'recognises %s as the Admin Panel, not the Backoffice',
    (host) => {
      expect(isAdminPanelHost(host)).toBe(true);
      expect(isBackofficeHost(host)).toBe(false);
      expect(isStaffHost(host)).toBe(true);
    },
  );

  it.each(['circlesfera.com', 'www.circlesfera.com', 'localhost'])(
    'treats %s as the participant app',
    (host) => {
      expect(isBackofficeHost(host)).toBe(false);
      expect(isStaffHost(host)).toBe(false);
    },
  );
});
