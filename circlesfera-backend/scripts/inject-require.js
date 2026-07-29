import fs from 'fs/promises';
import path from 'path';

async function walk(dir) {
  let results = [];
  const list = await fs.readdir(dir);
  for (let file of list) {
    file = path.resolve(dir, file);
    const stat = await fs.stat(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(await walk(file));
    } else {
      if (file.endsWith('.js')) {
        results.push(file);
      }
    }
  }
  return results;
}

async function main() {
  const files = await walk(path.resolve('./dist'));
  for (const file of files) {
    let content = await fs.readFile(file, 'utf8');
    // Inject only if require( is used and require is not already declared
    if (
      content.includes('require(') &&
      !content.includes('const require') &&
      !content.includes('let require') &&
      !content.includes('var require') &&
      !content.includes('__globalCreateRequire')
    ) {
      content = `import { createRequire as __globalCreateRequire } from 'module';\nconst require = __globalCreateRequire(import.meta.url);\n${content}`;
      await fs.writeFile(file, content);
    }
  }
}

main().catch(console.error);
