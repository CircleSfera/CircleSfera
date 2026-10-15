import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, StoryStickerKind } from '@prisma/client';
import { isBlockedEitherWay } from '../common/policies/block.policy.js';
import { assertCanAccessStory } from '../common/policies/story-access.policy.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateStoryStickerDto,
  RespondStoryStickerDto,
} from './dto/story-sticker.dto.js';
import {
  ANSWERABLE,
  parseStickerSettings,
  publicSettings,
  STICKER_LIMITS,
} from './story-sticker-settings.js';

/** Polls, questions, quizzes and sliders keep the sizes the editor gives. */
const ANSWERABLE_SCALE = { min: 0.5, max: 1.35 };

/** A sticker as the story feed sends it. */
export interface FeedSticker {
  id: string;
  kind: StoryStickerKind;
  settings: Record<string, unknown>;
  x: number | null;
  y: number | null;
  scale: number | null;
  rotation: number | null;
}

type StickerRow = FeedSticker & { settings: Prisma.JsonValue };

export const FEED_STICKER_SELECT = {
  id: true,
  kind: true,
  settings: true,
  x: true,
  y: true,
  scale: true,
  rotation: true,
} as const;

type Tx = Prisma.TransactionClient;

@Injectable()
export class StoryStickersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Creates the stickers of a new story inside its transaction, after
   * checking what each holds: a mention names a profile that exists and is
   * not blocked either way, a location a place that exists.
   */
  async createForStory(
    tx: Tx,
    storyId: string,
    authorProfileId: string,
    stickers: CreateStoryStickerDto[],
  ): Promise<void> {
    if (stickers.length === 0) return;
    if (stickers.length > STICKER_LIMITS.perStory) {
      throw new BadRequestException('TOO_MANY_STICKERS');
    }
    const rows: Prisma.StoryStickerCreateManyInput[] = [];
    for (const sticker of stickers) {
      const settings = parseStickerSettings(sticker.kind, sticker.settings);
      if (
        ANSWERABLE.has(sticker.kind) &&
        (sticker.scale < ANSWERABLE_SCALE.min ||
          sticker.scale > ANSWERABLE_SCALE.max)
      ) {
        throw new BadRequestException('STICKER_SCALE_OUT_OF_RANGE');
      }
      if (sticker.kind === 'MENTION') {
        const { profileId } = settings as { profileId: string };
        const mentioned = await tx.profile.findUnique({
          where: { id: profileId },
          select: { id: true },
        });
        if (
          !mentioned ||
          (await isBlockedEitherWay(
            tx as unknown as PrismaService,
            authorProfileId,
            profileId,
          ))
        ) {
          throw new BadRequestException('MENTIONED_PROFILE_NOT_FOUND');
        }
      }
      if (sticker.kind === 'LOCATION') {
        const { placeId } = settings as { placeId: string };
        const place = await tx.place.findUnique({
          where: { id: placeId },
          select: { id: true },
        });
        if (!place) throw new BadRequestException('PLACE_NOT_FOUND');
      }
      rows.push({
        storyId,
        kind: sticker.kind,
        settings: settings as Prisma.InputJsonValue,
        x: sticker.x,
        y: sticker.y,
        scale: sticker.scale,
        rotation: sticker.rotation,
      });
    }
    await tx.storySticker.createMany({ data: rows });
  }

  /** The stickers of a story for the feed; its author sees a quiz's answer. */
  forFeed(stickers: StickerRow[], viewerIsAuthor: boolean): FeedSticker[] {
    return stickers.map((s) => ({
      id: s.id,
      kind: s.kind,
      settings: publicSettings(s.kind, s.settings, viewerIsAuthor),
      x: s.x,
      y: s.y,
      scale: s.scale,
      rotation: s.rotation,
    }));
  }

  /**
   * A viewer answers a sticker: votes and slider values count once and can
   * be changed (a quiz answer cannot); answers to a question may be several.
   * Only while the story lasts, and not on one's own story.
   */
  async respond(
    viewerProfileId: string,
    stickerId: string,
    body: RespondStoryStickerDto,
  ) {
    const sticker = await this.findSticker(stickerId);
    const story = await assertCanAccessStory(
      this.prisma,
      sticker.storyId,
      viewerProfileId,
    );
    if (story.profileId === viewerProfileId) {
      throw new BadRequestException('CANNOT_ANSWER_OWN_STICKER');
    }
    if (story.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('STORY_EXPIRED');
    }
    if (!ANSWERABLE.has(sticker.kind)) {
      throw new BadRequestException('STICKER_NOT_ANSWERABLE');
    }

    const settings = sticker.settings as Record<string, unknown>;
    if (sticker.kind === 'QUESTION') {
      const text = body.text?.trim();
      if (!text) throw new BadRequestException('EMPTY_ANSWER_TEXT');
      await this.prisma.storyStickerResponse.create({
        data: { stickerId, profileId: viewerProfileId, text },
      });
      return this.results(viewerProfileId, stickerId);
    }

    let data: { optionIndex?: number; value?: number };
    if (sticker.kind === 'SLIDER') {
      if (body.value === undefined) {
        throw new BadRequestException('SLIDER_VALUE_REQUIRED');
      }
      data = { value: body.value };
    } else {
      const options = (settings.options as string[] | undefined) ?? [];
      if (
        body.optionIndex === undefined ||
        body.optionIndex >= options.length
      ) {
        throw new BadRequestException('INVALID_POLL_OPTION');
      }
      data = { optionIndex: body.optionIndex };
    }

    const key = { voteKey: stickerId, profileId: viewerProfileId };
    if (sticker.kind === 'QUIZ') {
      // A quiz is answered once.
      const existing = await this.prisma.storyStickerResponse.findUnique({
        where: { voteKey_profileId: key },
        select: { id: true },
      });
      if (!existing) {
        await this.prisma.storyStickerResponse.create({
          data: { stickerId, ...key, ...data },
        });
      }
    } else {
      await this.prisma.storyStickerResponse.upsert({
        where: { voteKey_profileId: key },
        create: { stickerId, ...key, ...data },
        update: data,
      });
    }
    return this.results(viewerProfileId, stickerId);
  }

  /**
   * What a sticker has gathered, for someone who may see its story: the
   * counts and share of each option, a slider's average, the viewer's own
   * answer, and a quiz's right option once answered. The author also gets
   * the answers to a question, and who gave them; nobody else does.
   */
  async results(viewerProfileId: string, stickerId: string) {
    const sticker = await this.findSticker(stickerId);
    const story = await assertCanAccessStory(
      this.prisma,
      sticker.storyId,
      viewerProfileId,
    );
    const isAuthor = story.profileId === viewerProfileId;
    const settings = sticker.settings as Record<string, unknown>;

    if (sticker.kind === 'QUESTION') {
      const answers = isAuthor
        ? await this.prisma.storyStickerResponse.findMany({
            where: { stickerId },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              text: true,
              createdAt: true,
              profile: {
                select: {
                  id: true,
                  username: true,
                  fullName: true,
                  avatar: true,
                },
              },
            },
          })
        : [];
      return {
        id: sticker.id,
        kind: sticker.kind,
        settings: publicSettings(sticker.kind, settings, isAuthor),
        isAuthor,
        totalResponses: isAuthor ? answers.length : 0,
        answers,
      };
    }

    const responses = await this.prisma.storyStickerResponse.findMany({
      where: { stickerId, voteKey: stickerId },
      select: { profileId: true, optionIndex: true, value: true },
    });
    const mine = responses.find((r) => r.profileId === viewerProfileId) ?? null;
    const total = responses.length;
    const base = {
      id: sticker.id,
      kind: sticker.kind,
      isAuthor,
      totalResponses: total,
      myResponse: mine
        ? { optionIndex: mine.optionIndex, value: mine.value }
        : null,
    };

    if (sticker.kind === 'SLIDER') {
      const average =
        total > 0
          ? responses.reduce((sum, r) => sum + (r.value ?? 0), 0) / total
          : null;
      return {
        ...base,
        settings: publicSettings(sticker.kind, settings, true),
        average,
      };
    }

    if (sticker.kind === 'POLL' || sticker.kind === 'QUIZ') {
      const options = (settings.options as string[] | undefined) ?? [];
      const counts = options.map(
        (_, i) => responses.filter((r) => r.optionIndex === i).length,
      );
      const reveal = isAuthor || mine !== null;
      return {
        ...base,
        settings: publicSettings(sticker.kind, settings, reveal),
        options: options.map((text, index) => ({
          index,
          text,
          votes: counts[index],
          percentage:
            total > 0 ? Number(((counts[index] / total) * 100).toFixed(1)) : 0,
        })),
      };
    }

    return {
      ...base,
      settings: publicSettings(sticker.kind, settings, isAuthor),
    };
  }

  private async findSticker(stickerId: string) {
    const sticker = await this.prisma.storySticker.findUnique({
      where: { id: stickerId },
      select: { id: true, storyId: true, kind: true, settings: true },
    });
    if (!sticker) throw new NotFoundException('Sticker not found');
    return sticker;
  }
}
