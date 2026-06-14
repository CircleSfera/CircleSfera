// scripts/update-deps.js
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function updateDeps(pkgPath) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const sections = ['dependencies', 'devDependencies'];
  sections.forEach(section => {
    const deps = pkg[section] || {};
    const names = Object.keys(deps);
    if (names.length === 0) return;
    console.log(`Updating ${section} in ${pkgPath}`);
    names.forEach(name => {
      try {
        console.log(`Installing ${name}@latest ${section === 'devDependencies' ? '--save-dev' : ''} --save-exact`);
        execSync(`npm install ${name}@latest ${section === 'devDependencies' ? '--save-dev' : ''} --save-exact`, { stdio: 'inherit' });
      } catch (e) {
        console.error(`Failed to update ${name}: ${e.message}`);
      }
    });
  });
}

// Update backend package.json
updateDeps(path.resolve(__dirname, '..', 'package.json'));
// Update frontend package.json
updateDeps(path.resolve(__dirname, '..', '..', 'circlesfera-frontend', 'package.json'));

console.log('Dependency update script finished');
