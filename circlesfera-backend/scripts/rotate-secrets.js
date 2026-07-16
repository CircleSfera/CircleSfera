import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ENV_PATH = join(process.cwd(), '.env');
const BACKUP_PATH = join(process.cwd(), '.env.backup');
function generateSecret(length = 64) {
  return randomBytes(length).toString('hex');
}
function rotate() {
  if (!existsSync(ENV_PATH)) {
    console.error('Error: .env file not found at', ENV_PATH);
    process.exit(1);
  }
  console.log('🛡️ Starting secret rotation...');
  const currentEnv = readFileSync(ENV_PATH, 'utf8');
  writeFileSync(BACKUP_PATH, currentEnv);
  console.log('✅ Backup created at .env.backup');
  let updatedEnv = currentEnv;
  const secretsToRotate = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'CSRF_SECRET'];
  for (const key of secretsToRotate) {
    const newSecret = generateSecret();
    const regex = new RegExp(`^${key}=.*`, 'm');
    if (regex.test(updatedEnv)) {
      updatedEnv = updatedEnv.replace(regex, `${key}=${newSecret}`);
      console.log(`🔄 Rotated ${key}`);
    } else {
      updatedEnv += `\n${key}=${newSecret}`;
      console.log(`➕ Added missing key: ${key}`);
    }
  }
  writeFileSync(ENV_PATH, updatedEnv);
  console.log('\n✨ Secret rotation complete!');
  console.log(
    '⚠️ IMPORTANT: Restart the backend server for changes to take effect.',
  );
  console.log('⚠️ IMPORTANT: All active user sessions have been invalidated.');
}
rotate();
//# sourceMappingURL=rotate-secrets.js.map
