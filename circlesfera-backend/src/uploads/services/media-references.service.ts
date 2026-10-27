import * as path from 'node:path';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

// Every column that can hold the address of a stored file, by Prisma model.
// A file is in use while any of these names it, by its full address or by its
// file name (an address may be stored relative or absolute). A column added to
// the schema for a stored file belongs here: a file the list does not know is
// taken for unused by the nightly sweep.
// The clips an edit project keeps inside its JSON state are read apart, by
// the same path the studio writes (EDIT_CLIP_PATH). The Media table is left
// out on purpose: it repeats the address of the post,
// message or comment it was made for and is not removed with them, so it
// would keep every file for good.
// Where a studio project keeps the file of each clip: the clips that are not
// text, in a state of version 3. The same clips EditsService checks for
// ownership (collectStudioMediaUrls): a clip that check never saw must not
// count as a use, or anyone could keep another person's file for good. So a
// file still on the device (blob: or data:, in any case, after any spaces) is
// left out too: its address may end in another person's file name.
export const EDIT_CLIP_PATH =
  'lax $.studio.tracks[*].clips[*] ? (!exists(@.type ? (@ == "text")) && !(@.fileUrl like_regex "^[[:space:]]*(blob|data):" flag "i")).fileUrl';

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
  liveStream: ['hlsUrl', 'replayUrl', 'thumbnailUrl'],
  dataExportRequest: ['url'],
} as const;

export type MediaModel = keyof typeof MEDIA_COLUMNS;
// Rows not to count as a use, by model: the rows about to be erased.
export type IgnoredRows = Partial<Record<MediaModel, string[]>>;
type Row = Record<string, string | null>;
interface MediaDelegate {
  findMany(args: {
    where?: { OR: object[]; id?: { notIn: string[] } } & object;
    select: Record<string, true>;
  }): Promise<Row[]>;
}

// The database, or a transaction on it.
export type ReferencesClient = Prisma.TransactionClient;

// The rows of a post or story its author deleted: they still name their
// files, which wait with them in Recently deleted, but show them to nobody
// else.
const DELETED_ROWS: Partial<Record<MediaModel, object>> = {
  postMedia: { post: { deletedAt: null } },
  story: { deletedAt: null },
};

@Injectable()
export class MediaReferencesService {
  constructor(private readonly prisma: PrismaService) {}

  private delegate(
    model: MediaModel,
    client: ReferencesClient = this.prisma,
  ): MediaDelegate {
    return (client as unknown as Record<MediaModel, MediaDelegate>)[model];
  }

  private static select(model: MediaModel): Record<string, true> {
    return Object.fromEntries(MEDIA_COLUMNS[model].map((c) => [c, true]));
  }

  /**
   * The stored files of the list that some row still names, by their exact
   * key: a file attached since TD-008 is named by the key it was recorded
   * with. Given a transaction, it reads what that transaction sees: a row
   * it has just deleted names nothing. The rows of `ignoring` do not count:
   * the rows about to be erased with the files. With `shownOnly`, the rows
   * of a post or story its author deleted do not count either: what is
   * asked is whether anyone but the owner may still see the file.
   */
  async inUse(
    keys: string[],
    client: ReferencesClient = this.prisma,
    ignoring: IgnoredRows = {},
    shownOnly = false,
  ): Promise<Set<string>> {
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
      const ignored = ignoring[model] ?? [];
      const rows = await this.delegate(model, client).findMany({
        where: {
          OR: MEDIA_COLUMNS[model].flatMap((column) => [
            { [column]: { in: [...wanted] } },
            ...[...folders.keys()].map((folder) => ({
              [column]: { startsWith: folder },
            })),
          ]),
          ...(ignored.length > 0 ? { id: { notIn: ignored } } : {}),
          ...(shownOnly ? (DELETED_ROWS[model] ?? {}) : {}),
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
    for (const clip of await this.editClips([...wanted], client)) {
      used.add(clip);
    }
    return used;
  }

  // The clip files edit projects name: all of them, or those of the list.
  private async editClips(
    only?: string[],
    client: ReferencesClient = this.prisma,
  ): Promise<string[]> {
    const rows = only
      ? await client.$queryRaw<Array<{ key: string }>>`
          SELECT DISTINCT clip #>> '{}' AS key
          FROM "edit_projects" e,
            jsonb_path_query(e."state", ${EDIT_CLIP_PATH}::jsonpath) clip
          WHERE e."state" -> 'version' = '3'::jsonb
            AND jsonb_typeof(clip) = 'string'
            AND clip #>> '{}' = ANY(${only})`
      : await this.prisma.$queryRaw<Array<{ key: string }>>`
          SELECT DISTINCT clip #>> '{}' AS key
          FROM "edit_projects" e,
            jsonb_path_query(e."state", ${EDIT_CLIP_PATH}::jsonpath) clip
          WHERE e."state" -> 'version' = '3'::jsonb
            AND jsonb_typeof(clip) = 'string'`;
    return rows.map((row) => row.key).filter((key) => !!key);
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
    // A draft's clips are in use too: the sweep would otherwise take them.
    for (const clip of await this.editClips()) {
      keys.add(clip);
      keys.add(path.basename(clip));
    }
    return keys;
  }
}
