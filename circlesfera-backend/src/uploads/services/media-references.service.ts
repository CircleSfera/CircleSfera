import * as path from 'node:path';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

// Every column that can hold the address of a stored file, by Prisma model.
// A file is in use while any of these names it, by its full address or by its
// file name (an address may be stored relative or absolute). A column added to
// the schema for a stored file belongs here: a file the list does not know is
// taken for unused by the nightly sweep.
// Not covered: the clips an edit project keeps inside its JSON state. The
// Media table is left out on purpose: it repeats the address of the post,
// message or comment it was made for and is not removed with them, so it
// would keep every file for good.
export const MEDIA_COLUMNS = {
  postMedia: ['url', 'standardUrl', 'thumbnailUrl'],
  profile: [
    'avatar',
    'standardUrl',
    'thumbnailUrl',
    'cover',
    'coverStandardUrl',
    'coverThumbnailUrl',
  ],
  story: ['url', 'standardUrl', 'thumbnailUrl', 'overlayUrl'],
  highlight: ['coverUrl'],
  comment: ['url', 'standardUrl', 'thumbnailUrl', 'voiceUrl'],
  collection: ['coverUrl', 'standardUrl', 'thumbnailUrl'],
  message: ['url', 'standardUrl', 'thumbnailUrl', 'voiceUrl'],
  conversation: ['avatarUrl'],
  audio: ['url', 'thumbnailUrl'],
  editProject: ['mediaUrl'],
  liveStream: ['hlsUrl', 'replayUrl'],
  dataExportRequest: ['url'],
} as const;

type MediaModel = keyof typeof MEDIA_COLUMNS;
type Row = Record<string, string | null>;
interface MediaDelegate {
  findMany(args: {
    where?: { OR: object[] };
    select: Record<string, true>;
  }): Promise<Row[]>;
}

@Injectable()
export class MediaReferencesService {
  constructor(private readonly prisma: PrismaService) {}

  private delegate(model: MediaModel): MediaDelegate {
    return (this.prisma as unknown as Record<MediaModel, MediaDelegate>)[model];
  }

  private static select(model: MediaModel): Record<string, true> {
    return Object.fromEntries(MEDIA_COLUMNS[model].map((c) => [c, true]));
  }

  /**
   * The stored files of the list that some row still names, by their exact
   * key: a file attached since TD-008 is named by the key it was recorded
   * with.
   */
  async inUse(keys: string[]): Promise<Set<string>> {
    const wanted = new Set(keys);
    const used = new Set<string>();
    if (wanted.size === 0) return used;
    // A video's stream and cover live in a folder named after it
    // (/uploads/<base>/...); a row naming one of them uses the video too.
    const folders = new Map<string, string>();
    for (const key of wanted) {
      const ext = path.extname(key);
      if (ext) folders.set(`${key.slice(0, -ext.length)}/`, key);
    }
    for (const model of Object.keys(MEDIA_COLUMNS) as MediaModel[]) {
      const rows = await this.delegate(model).findMany({
        where: {
          OR: MEDIA_COLUMNS[model].flatMap((column) => [
            { [column]: { in: [...wanted] } },
            ...[...folders.keys()].map((folder) => ({
              [column]: { startsWith: folder },
            })),
          ]),
        },
        select: MediaReferencesService.select(model),
      });
      for (const row of rows) {
        for (const value of Object.values(row)) {
          if (!value) continue;
          if (wanted.has(value)) used.add(value);
          for (const [folder, key] of folders) {
            if (value.startsWith(folder)) used.add(key);
          }
        }
      }
    }
    return used;
  }

  /**
   * Every address and file name that some row names, for the nightly sweep.
   */
  async referencedKeys(): Promise<Set<string>> {
    const keys = new Set<string>();
    for (const model of Object.keys(MEDIA_COLUMNS) as MediaModel[]) {
      const rows = await this.delegate(model).findMany({
        select: MediaReferencesService.select(model),
      });
      for (const row of rows) {
        for (const value of Object.values(row)) {
          if (!value) continue;
          keys.add(value.trim());
          const name = path.basename(value.trim());
          if (name) keys.add(name);
        }
      }
    }
    return keys;
  }
}
