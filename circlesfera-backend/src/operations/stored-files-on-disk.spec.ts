import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listStoredFilesOnDisk } from './stored-files-on-disk.js';

describe('listStoredFilesOnDisk', () => {
  let folder: string;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'stored-files-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(folder, { recursive: true, force: true });
  });

  it('lists the files at the top of the folder by their stored address, and writes nothing', async () => {
    fs.writeFileSync(path.join(folder, 'a.jpg'), 'abc');
    fs.writeFileSync(path.join(folder, '.hidden'), 'x');
    fs.mkdirSync(path.join(folder, '3f2b8c1e-9a4d-4c7b-8e21-5d6f7a8b9c0d'));

    const files = await listStoredFilesOnDisk(folder);

    expect(files).toEqual([
      { url: '/uploads/a.jpg', sizeBytes: 3, lastModified: expect.any(Date) },
    ]);
    expect(fs.readdirSync(folder).sort()).toEqual([
      '.hidden',
      '3f2b8c1e-9a4d-4c7b-8e21-5d6f7a8b9c0d',
      'a.jpg',
    ]);
  });

  it('fails on a folder that is not there, instead of creating it or answering no file', async () => {
    const missing = path.join(folder, 'missing');

    await expect(listStoredFilesOnDisk(missing)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(fs.existsSync(missing)).toBe(false);
  });

  it('fails on a file it cannot inspect, and passes over only one removed meanwhile', async () => {
    fs.writeFileSync(path.join(folder, 'gone.jpg'), 'x');
    fs.writeFileSync(path.join(folder, 'locked.jpg'), 'x');
    const realStat = fs.promises.stat;
    vi.spyOn(fs.promises, 'stat').mockImplementation(async (file, ...rest) => {
      const name = path.basename(String(file));
      if (name === 'gone.jpg') {
        throw Object.assign(new Error('gone'), { code: 'ENOENT' });
      }
      if (name === 'locked.jpg') {
        throw Object.assign(new Error('denied'), { code: 'EACCES' });
      }
      return realStat(file, ...rest);
    });

    await expect(listStoredFilesOnDisk(folder)).rejects.toMatchObject({
      code: 'EACCES',
    });

    fs.rmSync(path.join(folder, 'locked.jpg'));
    await expect(listStoredFilesOnDisk(folder)).resolves.toEqual([]);
  });
});
