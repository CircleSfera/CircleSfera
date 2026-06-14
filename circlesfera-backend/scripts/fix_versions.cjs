// scripts/fix_versions.cjs
const fs = require('node:fs');
const path = require('node:path');

function stripCaret(obj) {
  for (const depType of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    if (obj[depType]) {
      for (const [pkg, version] of Object.entries(obj[depType])) {
        if (typeof version === 'string' && (version.startsWith('^') || version.startsWith('~'))) {
          obj[depType][pkg] = version.replace(/^[\^~]/, '');
        }
      }
    }
  }
}

function processPackageJson(packageJsonPath) {
  const fullPath = path.resolve(packageJsonPath);
  const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
  stripCaret(data);
  fs.writeFileSync(fullPath, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Updated ${packageJsonPath}`);
}

// Backend package.json
const backendPkg = path.join(__dirname, '..', 'package.json');
processPackageJson(backendPkg);

// Frontend package.json (sibling folder)
const frontendPkg = path.join(__dirname, '..', '..', 'circlesfera-frontend', 'package.json');
processPackageJson(frontendPkg);
