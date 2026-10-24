// The Android app is built with every installed Capacitor plugin but push,
// which would bring Firebase in (the Android app has no push). Capacitor reads
// the list from ANDROID_PLUGINS in capacitor.config.ts; this check fails when
// a plugin is installed and missing from it, when push is in it, or when the
// generated Gradle settings disagree with it (run `npx cap update android`).
// Runs with `npm run lint`.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const PUSH = '@capacitor/push-notifications';

const pkg = JSON.parse(read('package.json'));
const installed = Object.keys(pkg.dependencies ?? {})
  .filter((name) => {
    try {
      return Boolean(
        JSON.parse(read(`node_modules/${name}/package.json`)).capacitor
          ?.android,
      );
    } catch {
      return false;
    }
  })
  .filter((name) => name !== PUSH)
  .sort();

const listed = [
  ...(
    read('capacitor.config.ts').match(/ANDROID_PLUGINS = \[([^\]]*)\]/)?.[1] ??
    ''
  ).matchAll(/'([^']+)'/g),
]
  .map((m) => m[1])
  .sort();

const gradle = [
  ...read('android/capacitor.settings.gradle').matchAll(
    /^include ':([^']+)'/gm,
  ),
]
  .map((m) => m[1])
  .filter((id) => id !== 'capacitor-android')
  .sort();
const gradleId = (name) => name.replace('@', '').replace('/', '-');

const problems = [];
if (listed.includes(PUSH))
  problems.push(`${PUSH} must not be in ANDROID_PLUGINS`);
for (const name of installed) {
  if (!listed.includes(name))
    problems.push(`${name} is missing from ANDROID_PLUGINS`);
}
for (const name of listed) {
  if (!installed.includes(name))
    problems.push(`${name} is in ANDROID_PLUGINS but not installed`);
}
if (gradle.join() !== listed.map(gradleId).sort().join()) {
  problems.push(
    'android/capacitor.settings.gradle differs from ANDROID_PLUGINS: run npx cap update android',
  );
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
console.log(`Android plugins: ${listed.length}, push left out.`);
