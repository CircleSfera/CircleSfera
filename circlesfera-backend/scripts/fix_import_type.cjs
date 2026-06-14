const fs = require('node:fs');
const path = require('node:path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (let file of list) {
    file = path.resolve(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.ts')) {
        results.push(file);
      }
    }
  }
  return results;
}

const files = walk(path.join(__dirname, '../src'));
let totalFixed = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;
  
  // Look for `import type { SomeService }` or `import type { SomeController }`
  // and replace with `import { SomeService }`
  const regex = /import\s+type\s+\{([^}]*?(?:Service|Controller|Provider|Adapter|Queue|Prisma)[^}]*?)\}\s+from/g;
  content = content.replace(regex, (match, p1) => {
    changed = true;
    return `import {${p1}} from`;
  });

  if (changed) {
    fs.writeFileSync(file, content, 'utf8');
    totalFixed++;
    console.log(`Fixed ${file}`);
  }
}

console.log(`Fixed ${totalFixed} files.`);
