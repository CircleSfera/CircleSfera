import { Prisma, Role } from '@prisma/client';

/**
 * Users-list `role` query. `ADMIN` means a linked AdminIdentity (ADR-0013),
 * not the deprecated platform User.role staff values.
 */
export function userListRoleWhere(
  role?: string,
): Prisma.UserWhereInput | undefined {
  if (!role) return undefined;

  const roles = role
    .split(',')
    .map((r) => r.trim())
    .filter((r): r is Role => (Object.values(Role) as string[]).includes(r));

  if (roles.length === 0) return undefined;

  if (roles.length === 1 && roles[0] === Role.ADMIN) {
    return {
      OR: [
        { role: Role.ADMIN },
        { linkedAdminIdentities: { some: { status: 'ACTIVE' } } },
      ],
    };
  }

  if (roles.length === 1) {
    return { role: roles[0] };
  }

  return { role: { in: roles } };
}
