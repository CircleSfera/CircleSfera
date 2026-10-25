import 'reflect-metadata';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getMetadataStorage } from 'class-validator';
import { describe, expect, it } from 'vitest';

// The API documentation (/api/docs) is built from decorators written in the
// source: nothing adds them at build time. These checks fail when a DTO
// property or a route is added without them.

// A class, as the decorators see it.
type Class = abstract new (...args: never[]) => unknown;

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function files(suffix: string, dir = src): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(suffix, full);
    return entry.name.endsWith(suffix) ? [full] : [];
  });
}

async function classesOf(file: string): Promise<[string, Class][]> {
  const module = await import(pathToFileURL(file).href);
  return Object.entries(module).filter(
    (entry): entry is [string, Class] =>
      typeof entry[1] === 'function' && /^class\s/.test(String(entry[1])),
  );
}

// Each test loads every DTO and controller of the backend: on a busy machine
// that takes longer than the default five seconds.
describe('API documentation decorators', { timeout: 60_000 }, () => {
  it('documents every validated property of every DTO with @ApiProperty', async () => {
    for (const file of files('.dto.ts')) await import(pathToFileURL(file).href);
    // Every class class-validator knows, exported or not (nested DTOs often
    // are not), by its name.
    const storage = getMetadataStorage();
    const targets = [
      ...(
        storage as unknown as { validationMetadatas: Map<Class, unknown> }
      ).validationMetadatas.keys(),
    ].filter((cls) => cls.name.endsWith('Dto'));
    const missing: string[] = [];
    for (const cls of targets) {
      const validated = new Set(
        storage
          .getTargetValidationMetadatas(cls, '', true, false)
          .map((meta) => meta.propertyName),
      );
      const documented = new Set(
        (
          (Reflect.getMetadata(
            'swagger/apiModelPropertiesArray',
            cls.prototype,
          ) as string[] | undefined) ?? []
        ).map((key) => key.replace(/^:/, '')),
      );
      for (const property of validated) {
        if (!documented.has(property)) missing.push(`${cls.name}.${property}`);
      }
    }
    expect(targets.length).toBeGreaterThan(100);
    expect(missing).toEqual([]);
  });

  it('gives every route an @ApiResponse', async () => {
    const missing: string[] = [];
    let routes = 0;
    for (const file of files('.controller.ts')) {
      for (const [name, cls] of await classesOf(file)) {
        for (const key of Object.getOwnPropertyNames(cls.prototype)) {
          const handler = cls.prototype[key];
          if (
            typeof handler !== 'function' ||
            Reflect.getMetadata('method', handler) === undefined
          ) {
            continue;
          }
          routes++;
          if (!Reflect.getMetadata('swagger/apiResponse', handler)) {
            missing.push(`${path.relative(src, file)} ${name}.${key}`);
          }
        }
      }
    }
    expect(routes).toBeGreaterThan(300);
    expect(missing).toEqual([]);
  });
});
