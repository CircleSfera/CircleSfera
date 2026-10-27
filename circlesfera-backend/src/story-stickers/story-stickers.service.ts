import type { NotificationCreateEvent } from '@circlesfera/shared';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  NotificationType,
  type Prisma,
  type StoryStickerKind,
} from '@prisma/client';
import {
  isBlockedEitherWay,
  visibleToViewerWhere,
} from '../common/policies/block.policy.js';
import { assertCanAccessStory } from '../common/policies/story-access.policy.js';
import { validateTargetUrl } from '../common/utils/ssrf.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateStoryStickerDto,
  RespondStoryStickerDto,
} from './dto/story-sticker.dto.js';
import { domainSuffixes, isUnderBlocked, LINK_LIMITS } from './link-safety.js';
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

/** Who answered a sticker, as its author sees them. */
const RESPONDER_PROFILE = {
  select: { id: true, username: true, fullName: true, avatar: true },
} as const;
/** People listed per sticker; the count stays the total. */
export const RESPONDERS_SHOWN = 200;

@Injectable()
export class StoryStickersService {
  private readonly logger = new Logger(StoryStickersService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Creates the stickers of a new story inside its transaction, after
   * checking what each holds: a mention names a profile that exists and is
   * not blocked either way; a location is the story's place, once per story.
   * Returns the profiles mentioned, once each, for their notifications.
   */
  async createForStory(
    tx: Tx,
    storyId: string,
    authorProfileId: string,
    stickers: CreateStoryStickerDto[],
    storyPlaceId: string | null,
    storyAudioId: string | null = null,
  ): Promise<string[]> {
    if (stickers.length === 0) return [];
    if (stickers.length > STICKER_LIMITS.perStory) {
      throw new BadRequestException('TOO_MANY_STICKERS');
    }
    if (stickers.filter((s) => s.kind === 'LOCATION').length > 1) {
      throw new BadRequestException('ONE_LOCATION_STICKER_PER_STORY');
    }
    if (stickers.filter((s) => s.kind === 'MUSIC').length > 1) {
      throw new BadRequestException('ONE_MUSIC_STICKER_PER_STORY');
    }
    const links = stickers.filter((s) => s.kind === 'LINK').length;
    if (links > 1) throw new BadRequestException('ONE_LINK_STICKER_PER_STORY');
    if (links > 0) {
      // One story at a time per author counts and adds its link, so two at
      // once never both fit under the day's limit.
      await tx.$queryRaw`SELECT id FROM profiles WHERE id = ${authorProfileId} FOR UPDATE`;
      const today = await tx.storySticker.count({
        where: {
          kind: 'LINK',
          createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          story: { profileId: authorProfileId },
        },
      });
      if (today >= LINK_LIMITS.perDay) {
        throw new BadRequestException('LINKS_PER_DAY_REACHED');
      }
    }
    const mentioned = new Set<string>();
    const rows: Prisma.StoryStickerCreateManyInput[] = [];
    for (const sticker of stickers) {
      let settings = parseStickerSettings(sticker.kind, sticker.settings);
      if (
        ANSWERABLE.has(sticker.kind) &&
        (sticker.scale < ANSWERABLE_SCALE.min ||
          sticker.scale > ANSWERABLE_SCALE.max)
      ) {
        throw new BadRequestException('STICKER_SCALE_OUT_OF_RANGE');
      }
      if (sticker.kind === 'MENTION') {
        const { profileId } = settings as { profileId: string };
        const profile = await tx.profile.findUnique({
          where: { id: profileId },
          select: { id: true },
        });
        if (
          !profile ||
          (await isBlockedEitherWay(
            tx as unknown as PrismaService,
            authorProfileId,
            profileId,
          ))
        ) {
          throw new BadRequestException('MENTIONED_PROFILE_NOT_FOUND');
        }
        if (profileId !== authorProfileId) mentioned.add(profileId);
      }
      if (sticker.kind === 'LINK') {
        await this.assertLinkAllowed(
          tx,
          settings as { url: string; domain: string },
        );
      }
      if (sticker.kind === 'MUSIC') {
        if (!storyAudioId) throw new BadRequestException('AUDIO_NOT_FOUND');
        settings = { audioId: storyAudioId };
      }
      if (sticker.kind === 'LOCATION') {
        if (!storyPlaceId) throw new BadRequestException('PLACE_NOT_FOUND');
        settings = { placeId: storyPlaceId };
      }
      rows.push({
        storyId,
        kind: sticker.kind,
        settings: settings as Prisma.InputJsonValue,
        ...(sticker.kind === 'COUNTDOWN'
          ? { endsAt: new Date((settings as { endsAt: string }).endsAt) }
          : {}),
        x: sticker.x,
        y: sticker.y,
        scale: sticker.scale,
        rotation: sticker.rotation,
      });
    }
    await tx.storySticker.createMany({ data: rows });
    return [...mentioned];
  }

  /**
   * Checks that each link of a new story resolves only to public addresses.
   * It asks DNS, so it runs before the story's transaction opens, never
   * holding one while it waits.
   */
  async assertLinkHostsPublic(stickers: CreateStoryStickerDto[]) {
    for (const sticker of stickers) {
      if (sticker.kind !== 'LINK') continue;
      const { url } = parseStickerSettings('LINK', sticker.settings) as {
        url: string;
      };
      try {
        await validateTargetUrl(url, {
          requireHttps: true,
          allowedPorts: [443],
        });
      } catch {
        throw new BadRequestException('LINK_HOST_NOT_ALLOWED');
      }
    }
  }

  /** A link may be added when its domain is not blocked by staff, nor under one that is. */
  private async assertLinkAllowed(
    tx: Tx,
    link: { url: string; domain: string },
  ): Promise<void> {
    const blocked = await tx.blockedLinkDomain.findFirst({
      where: { domain: { in: domainSuffixes(link.domain) } },
      select: { id: true },
    });
    if (blocked) throw new BadRequestException('LINK_DOMAIN_BLOCKED');
  }

  /**
   * The blocked domains a set of stickers' links fall under, to leave those
   * links out of the feed.
   */
  async blockedLinkDomains(
    stickers: { kind: StoryStickerKind; settings: Prisma.JsonValue }[],
  ): Promise<Set<string>> {
    const candidates = [
      ...new Set(
        stickers
          .filter((s) => s.kind === 'LINK')
          .flatMap((s) =>
            domainSuffixes(
              String((s.settings as { domain?: string })?.domain ?? ''),
            ),
          ),
      ),
    ].filter(Boolean);
    if (candidates.length === 0) return new Set();
    const rows = await this.prisma.blockedLinkDomain.findMany({
      where: { domain: { in: candidates } },
      select: { domain: true },
    });
    return new Set(rows.map((r) => r.domain));
  }

  /**
   * The usernames of the profiles the given stickers mention, as they are
   * now, for one viewer: a profile that is gone, or blocked either way with
   * the viewer, is not in it, so its mention is left out of the feed.
   */
  async mentionNames(
    stickers: { kind: StoryStickerKind; settings: Prisma.JsonValue }[],
    viewerProfileId: string | undefined,
  ): Promise<Map<string, string>> {
    const ids = [
      ...new Set(
        stickers
          .filter((s) => s.kind === 'MENTION')
          .map((s) => (s.settings as { profileId?: string })?.profileId)
          .filter((id): id is string => typeof id === 'string'),
      ),
    ];
    if (ids.length === 0) return new Map();
    const profiles = await this.prisma.profile.findMany({
      where: {
        id: { in: ids },
        ...(await visibleToViewerWhere(this.prisma, viewerProfileId)),
      },
      select: { id: true, username: true },
    });
    return new Map(profiles.map((p) => [p.id, p.username]));
  }

  /**
   * The stickers of a story for the feed; its author sees a quiz's answer. A
   * mention carries its profile's username and a location the place's name,
   * both written here; a mention with no username to show is left out.
   */
  forFeed(
    stickers: StickerRow[],
    viewerIsAuthor: boolean,
    names: {
      usernames: Map<string, string>;
      placeName: string | null;
      /** Domains blocked by staff: links to them are left out. */
      blockedDomains?: ReadonlySet<string>;
      /** The author is banned or suspended: their links are left out. */
      linksOff?: boolean;
      /** The story's track, which its music sticker shows. */
      track?: { title: string; artist: string; cover: string | null } | null;
    } = { usernames: new Map(), placeName: null },
  ): FeedSticker[] {
    const feed: FeedSticker[] = [];
    for (const s of stickers) {
      const settings = publicSettings(s.kind, s.settings, viewerIsAuthor);
      if (s.kind === 'MENTION') {
        const username = names.usernames.get(String(settings.profileId));
        if (!username) continue;
        settings.username = username;
      }
      if (s.kind === 'LOCATION') {
        if (!names.placeName) continue;
        settings.name = names.placeName;
      }
      if (s.kind === 'MUSIC') {
        if (!names.track) continue;
        settings.title = names.track.title;
        settings.artist = names.track.artist;
        settings.cover = names.track.cover;
      }
      if (
        s.kind === 'LINK' &&
        (names.linksOff ||
          isUnderBlocked(
            String(settings.domain ?? ''),
            names.blockedDomains ?? new Set(),
          ))
      ) {
        continue;
      }
      feed.push({
        id: s.id,
        kind: s.kind,
        settings,
        x: s.x,
        y: s.y,
        scale: s.scale,
        rotation: s.rotation,
      });
    }
    return feed;
  }

  /**
   * The people who answered a vote or a slider, most recent first, as the
   * author of the story may see them: someone blocked either way, or of the
   * other audience, is left out of the list (not of the count).
   */
  private async responders(stickerId: string, authorProfileId: string) {
    return this.prisma.storyStickerResponse.findMany({
      where: {
        stickerId,
        voteKey: stickerId,
        profile: await visibleToViewerWhere(this.prisma, authorProfileId),
      },
      orderBy: { createdAt: 'desc' },
      take: RESPONDERS_SHOWN,
      select: {
        optionIndex: true,
        value: true,
        createdAt: true,
        profile: RESPONDER_PROFILE,
      },
    });
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
    if (sticker.kind === 'COUNTDOWN') {
      if (typeof body.remind !== 'boolean') {
        throw new BadRequestException('REMIND_REQUIRED');
      }
      if (new Date(String(settings.endsAt)).getTime() <= Date.now()) {
        throw new BadRequestException('COUNTDOWN_ENDED');
      }
      const key = { voteKey: stickerId, profileId: viewerProfileId };
      if (body.remind) {
        await this.prisma.storyStickerResponse.upsert({
          where: { voteKey_profileId: key },
          create: { stickerId, ...key },
          update: {},
        });
      } else {
        await this.prisma.storyStickerResponse.deleteMany({ where: key });
      }
      return this.results(viewerProfileId, stickerId);
    }
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
   * who answered (and a question's answers); nobody else does.
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
      if (!isAuthor) {
        return {
          id: sticker.id,
          kind: sticker.kind,
          settings: publicSettings(sticker.kind, settings, false),
          isAuthor,
          totalResponses: 0,
          answers: [],
        };
      }
      const [answers, total] = await Promise.all([
        this.prisma.storyStickerResponse.findMany({
          where: {
            stickerId,
            profile: await visibleToViewerWhere(this.prisma, viewerProfileId),
          },
          orderBy: { createdAt: 'desc' },
          take: RESPONDERS_SHOWN,
          select: {
            id: true,
            text: true,
            createdAt: true,
            profile: RESPONDER_PROFILE,
          },
        }),
        this.prisma.storyStickerResponse.count({ where: { stickerId } }),
      ]);
      return {
        id: sticker.id,
        kind: sticker.kind,
        settings: publicSettings(sticker.kind, settings, true),
        isAuthor,
        totalResponses: total,
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
      // Who answered, for the author only.
      ...(isAuthor
        ? { responders: await this.responders(stickerId, viewerProfileId) }
        : {}),
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

  /**
   * Tells the people who asked to be reminded, and the author, that a
   * countdown has ended. Each countdown is marked as told before anyone is,
   * so two servers never tell it twice; when who to tell cannot be read, the
   * mark is taken off again for the next run.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async announceEndedCountdowns(now = new Date()): Promise<number> {
    const ended = await this.prisma.storySticker.findMany({
      // A story in its author's Recently deleted tells nobody until it is
      // restored.
      where: {
        kind: 'COUNTDOWN',
        endsAt: { lte: now },
        announcedAt: null,
        story: { deletedAt: null },
      },
      select: {
        id: true,
        settings: true,
        story: { select: { id: true, profileId: true, expiresAt: true } },
      },
      orderBy: { endsAt: 'asc' },
      take: 50,
    });
    let told = 0;
    for (const sticker of ended) {
      const claimed = await this.prisma.storySticker.updateMany({
        where: { id: sticker.id, announcedAt: null },
        data: { announcedAt: now },
      });
      if (claimed.count === 0) continue;
      let asked: { profileId: string }[];
      try {
        asked = await this.prisma.storyStickerResponse.findMany({
          where: { stickerId: sticker.id, voteKey: sticker.id },
          select: { profileId: true },
        });
      } catch (err) {
        // Let it go, so a later run tells it, and go on with the others.
        this.logger.warn(
          `Countdown ${sticker.id} not told: ${(err as Error).message}`,
        );
        await this.prisma.storySticker
          .updateMany({
            where: { id: sticker.id, announcedAt: now },
            data: { announcedAt: null },
          })
          .catch(() => undefined);
        continue;
      }
      const author = sticker.story.profileId;
      const title = String(
        (sticker.settings as { title?: string } | null)?.title ?? '',
      );
      // The story is linked while it lasts.
      const target =
        sticker.story.expiresAt > now
          ? { targetType: 'story', targetId: sticker.story.id }
          : {};
      for (const recipientId of new Set([
        ...asked.map((a) => a.profileId),
        author,
      ])) {
        this.eventEmitter.emit('notification.create', {
          recipientId,
          senderId: author,
          type: NotificationType.SYSTEM,
          notice: { key: 'countdown_ended', title },
          ...target,
        } satisfies NotificationCreateEvent['payload']);
        told++;
      }
    }
    if (told > 0) this.logger.log(`Countdown notices sent: ${told}`);
    return told;
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
