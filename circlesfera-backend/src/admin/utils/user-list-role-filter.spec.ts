import { Role } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { userListRoleWhere } from './user-list-role-filter.js';

describe('userListRoleWhere', () => {
  it('treats ADMIN as linked operator, not only User.role', () => {
    expect(userListRoleWhere('ADMIN')).toEqual({
      OR: [
        { role: Role.ADMIN },
        { linkedAdminIdentities: { some: { status: 'ACTIVE' } } },
      ],
    });
  });

  it('keeps a single non-admin role as a column filter', () => {
    expect(userListRoleWhere('USER')).toEqual({ role: Role.USER });
  });

  it('ignores unknown role tokens', () => {
    expect(userListRoleWhere('not-a-role')).toBeUndefined();
  });
});
