import * as fs from 'node:fs';
import * as path from 'node:path';

/** A stored file found on the disk, by the address the rows use. */
export interface FileOnDisk {
  url: string;
  sizeBytes: number;
  lastModified: Date;
}

/**
 * Lists the stored files at the top of an uploads folder, the way the local
 * storage names them (/uploads/<name>), for a report. It only reads: unlike
 * the storage, it never creates the folder or writes a test file. A folder
 * it cannot read, or a file it cannot inspect, is an error, so that a
 * partial listing is never reported as the whole. Only a file removed
 * between the listing and its inspection is passed over.
 */
export async function listStoredFilesOnDisk(
  folder: string,
): Promise<FileOnDisk[]> {
  const entries = await fs.promises.readdir(folder);
  const files: FileOnDisk[] = [];
  for (const name of entries) {
    if (name.startsWith('.')) continue;
    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(path.join(folder, name));
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') continue;
      throw error;
    }
    if (!stat.isFile()) continue;
    files.push({
      url: `/uploads/${name}`,
      sizeBytes: stat.size,
      lastModified: stat.mtime,
    });
  }
  return files;
}
