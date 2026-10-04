/**
 * @deprecated Use scripts/bootstrap-admin.ts (Admin Panel).
 * User.role staff values no longer grant admin access.
 */
import 'dotenv/config';

console.error(
  'DEPRECATED: grant-admin.ts no longer grants Admin Panel access.\n' +
    'Use: npx ts-node scripts/bootstrap-admin.ts <email> <password> [displayName] [ROLE]',
);
process.exit(1);
