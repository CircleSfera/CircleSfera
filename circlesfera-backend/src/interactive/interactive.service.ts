import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception.js';
import { isBlockedEitherWay } from '../common/policies/block.policy.js';
import { assertCanAccessPost } from '../common/policies/post-access.policy.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreatePollDto } from './dto/create-poll.dto.js';
import type { CreateQnaBoxDto } from './dto/create-qna.dto.js';
import type { StickerPlacementDto } from './dto/sticker-placement.dto.js';

// Service for interactive polls and Q&A features.
/** A placement says where the sticker sits on a story; a post has none. */
function assertPlacementOnStory(dto: {
  postId?: string;
  placement?: StickerPlacementDto;
}): void {
  if (dto.placement && dto.postId) {
    throw AppException.BadRequest(
      ErrorCode.INVALID_INPUT,
      'A placement is only for a story',
    );
  }
}

/** The place of a story sticker, from the place the old routes send. */
function stickerPlace(placement?: StickerPlacementDto) {
  if (!placement) return {};
  return {
    x: placement.x,
    y: placement.y,
    scale: placement.scale,
    rotation: placement.rotation,
  };
}

function stickerOptions(settings: unknown): string[] {
  const options = (settings as Record<string, unknown> | null)?.options;
  return Array.isArray(options) ? options.map(String) : [];
}

/** A poll with its counts, in the shape the poll routes answer. */
function pollShape(
  poll: {
    id: string;
    question: string;
    options: string[];
    postId: string | null;
    storyId: string | null;
  },
  votes: { profileId: string; optionIndex: number }[],
  profileId?: string,
) {
  const totalVotes = votes.length;
  const optionCounts = new Array(poll.options.length).fill(0);
  let userVoteIndex: number | null = null;
  for (const vote of votes) {
    if (vote.optionIndex >= 0 && vote.optionIndex < poll.options.length) {
      optionCounts[vote.optionIndex] += 1;
    }
    if (profileId && vote.profileId === profileId) {
      userVoteIndex = vote.optionIndex;
    }
  }
  return {
    id: poll.id,
    question: poll.question,
    totalVotes,
    userVoteIndex,
    options: poll.options.map((text, index) => {
      const count = optionCounts[index] || 0;
      return {
        index,
        text,
        votes: count,
        percentage:
          totalVotes > 0 ? Number(((count / totalVotes) * 100).toFixed(1)) : 0,
      };
    }),
    postId: poll.postId,
    storyId: poll.storyId,
  };
}

const ANSWER_PROFILE_SELECT = {
  id: true,
  username: true,
  avatar: true,
  fullName: true,
  user: { select: { id: true } },
} as const;

/** An answer to a question, with who gave it, for its owner. */
function answerShape(
  id: string,
  answerText: string,
  createdAt: Date,
  profile: {
    id: string;
    username: string | null;
    avatar: string | null;
    fullName: string | null;
    user: { id: string } | null;
  } | null,
) {
  const username = profile?.username || 'usuario';
  return {
    id,
    answerText,
    createdAt,
    user: {
      id: profile?.user?.id ?? profile?.id ?? '',
      username,
      fullName: profile?.fullName || username,
      avatar: profile?.avatar ?? null,
    },
  };
}

@Injectable()
export class InteractiveService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // Create a poll attached to a post or story owned by the user.
  async createPoll(profileId: string, dto: CreatePollDto) {
    if (!dto.postId && !dto.storyId) {
      throw AppException.BadRequest(
        ErrorCode.MISSING_POST_OR_STORY_ID,
        'Either postId or storyId is required',
      );
    }
    if (dto.postId && dto.storyId) {
      throw AppException.BadRequest(
        ErrorCode.INVALID_INPUT,
        'Provide either postId or storyId, not both',
      );
    }
    assertPlacementOnStory(dto);

    const options = dto.options.map((o) => o.trim()).filter(Boolean);
    if (options.length < 2) {
      throw AppException.BadRequest(
        ErrorCode.INVALID_INPUT,
        'At least 2 non-empty options are required',
      );
    }

    if (dto.postId) {
      const post = await this.prisma.post.findUnique({
        where: { id: dto.postId },
      });
      if (!post)
        throw AppException.NotFound(ErrorCode.POST_NOT_FOUND, 'Post not found');
      if (post.profileId !== profileId)
        throw AppException.Forbidden(
          ErrorCode.FORBIDDEN_ACCESS,
          'Not your post',
        );
      const existing = await this.prisma.poll.findUnique({
        where: { postId: dto.postId },
      });
      if (existing)
        throw AppException.BadRequest(
          ErrorCode.POLL_ALREADY_EXISTS,
          'Post already has a poll',
        );
    }

    if (dto.storyId) {
      const story = await this.prisma.story.findUnique({
        where: { id: dto.storyId },
      });
      if (!story)
        throw AppException.NotFound(
          ErrorCode.STORY_NOT_FOUND,
          'Story not found',
        );
      if (story.profileId !== profileId)
        throw AppException.Forbidden(
          ErrorCode.FORBIDDEN_ACCESS,
          'Not your story',
        );
      // The poll of a story is a sticker of it.
      const existing = await this.prisma.storySticker.findFirst({
        where: { storyId: dto.storyId, kind: 'POLL' },
        select: { id: true },
      });
      if (existing)
        throw AppException.BadRequest(
          ErrorCode.POLL_ALREADY_EXISTS,
          'Story already has a poll',
        );
      const question = dto.question.trim();
      const sticker = await this.prisma.storySticker.create({
        data: {
          storyId: dto.storyId,
          kind: 'POLL',
          settings: { question, options },
          ...stickerPlace(dto.placement),
        },
      });
      return {
        id: sticker.id,
        question,
        options,
        postId: null,
        storyId: dto.storyId,
        createdAt: sticker.createdAt,
      };
    }

    return this.prisma.poll.create({
      data: {
        question: dto.question.trim(),
        options,
        postId: dto.postId,
      },
    });
  }

  // Create a Q&A box attached to a post or story owned by the user.
  async createQnaBox(profileId: string, dto: CreateQnaBoxDto) {
    if (!dto.postId && !dto.storyId) {
      throw AppException.BadRequest(
        ErrorCode.MISSING_POST_OR_STORY_ID,
        'Either postId or storyId is required',
      );
    }
    if (dto.postId && dto.storyId) {
      throw AppException.BadRequest(
        ErrorCode.INVALID_INPUT,
        'Provide either postId or storyId, not both',
      );
    }
    assertPlacementOnStory(dto);

    if (dto.postId) {
      const post = await this.prisma.post.findUnique({
        where: { id: dto.postId },
      });
      if (!post)
        throw AppException.NotFound(ErrorCode.POST_NOT_FOUND, 'Post not found');
      if (post.profileId !== profileId)
        throw AppException.Forbidden(
          ErrorCode.FORBIDDEN_ACCESS,
          'Not your post',
        );
      const existing = await this.prisma.qnaBox.findUnique({
        where: { postId: dto.postId },
      });
      if (existing)
        throw AppException.BadRequest(
          ErrorCode.QNA_ALREADY_EXISTS,
          'Post already has a Q&A box',
        );
    }

    if (dto.storyId) {
      const story = await this.prisma.story.findUnique({
        where: { id: dto.storyId },
      });
      if (!story)
        throw AppException.NotFound(
          ErrorCode.STORY_NOT_FOUND,
          'Story not found',
        );
      if (story.profileId !== profileId)
        throw AppException.Forbidden(
          ErrorCode.FORBIDDEN_ACCESS,
          'Not your story',
        );
      // The question of a story is a sticker of it.
      const existing = await this.prisma.storySticker.findFirst({
        where: { storyId: dto.storyId, kind: 'QUESTION' },
        select: { id: true },
      });
      if (existing)
        throw AppException.BadRequest(
          ErrorCode.QNA_ALREADY_EXISTS,
          'Story already has a Q&A box',
        );
      const prompt = dto.prompt.trim();
      const sticker = await this.prisma.storySticker.create({
        data: {
          storyId: dto.storyId,
          kind: 'QUESTION',
          settings: { prompt },
          ...stickerPlace(dto.placement),
        },
      });
      return {
        id: sticker.id,
        prompt,
        postId: null,
        storyId: dto.storyId,
        createdAt: sticker.createdAt,
      };
    }

    return this.prisma.qnaBox.create({
      data: {
        prompt: dto.prompt.trim(),
        postId: dto.postId,
      },
    });
  }

  // Cast or change a user vote in a poll.
  async votePoll(profileId: string, pollId: string, optionIndex: number) {
    const sticker = await this.storySticker(pollId, 'POLL');
    if (sticker) {
      const options = stickerOptions(sticker.settings);
      if (optionIndex < 0 || optionIndex >= options.length) {
        throw AppException.BadRequest(
          ErrorCode.INVALID_POLL_OPTION,
          'Invalid poll option index',
        );
      }
      const key = { voteKey: pollId, profileId };
      await this.prisma.storyStickerResponse.upsert({
        where: { voteKey_profileId: key },
        create: { stickerId: pollId, ...key, optionIndex },
        update: { optionIndex },
      });
      return this.getPoll(pollId, profileId);
    }

    const poll = await this.prisma.poll.findUnique({
      where: { id: pollId },
    });

    if (!poll) {
      throw AppException.NotFound(
        ErrorCode.INTERACTIVE_NOT_FOUND,
        'Poll not found',
      );
    }

    if (optionIndex < 0 || optionIndex >= poll.options.length) {
      throw AppException.BadRequest(
        ErrorCode.INVALID_POLL_OPTION,
        'Invalid poll option index',
      );
    }

    // Upsert vote (allow changing vote)
    await this.prisma.pollVote.upsert({
      where: {
        pollId_profileId: { pollId, profileId },
      },
      create: {
        pollId,
        profileId,
        optionIndex,
      },
      update: {
        optionIndex,
      },
    });

    return this.getPoll(pollId, profileId);
  }

  // Get poll details with vote count and breakdown.
  async getPoll(pollId: string, profileId?: string) {
    const sticker = await this.storySticker(pollId, 'POLL');
    if (sticker) {
      if (
        await isBlockedEitherWay(
          this.prisma,
          profileId,
          sticker.story.profileId,
        )
      ) {
        throw AppException.NotFound(
          ErrorCode.INTERACTIVE_NOT_FOUND,
          'Poll not found',
        );
      }
      const options = stickerOptions(sticker.settings);
      const votes = await this.prisma.storyStickerResponse.findMany({
        where: { stickerId: pollId, voteKey: pollId },
        select: { profileId: true, optionIndex: true },
      });
      return pollShape(
        {
          id: pollId,
          question: String(
            (sticker.settings as Record<string, unknown>).question ?? '',
          ),
          options,
          postId: null,
          storyId: sticker.storyId,
        },
        votes.map((v) => ({
          profileId: v.profileId,
          optionIndex: v.optionIndex ?? -1,
        })),
        profileId,
      );
    }

    const poll = await this.prisma.poll.findUnique({
      where: { id: pollId },
      include: { votes: true },
    });

    // A poll is only as visible as the post it belongs to.
    if (!poll?.postId) {
      throw AppException.NotFound(
        ErrorCode.INTERACTIVE_NOT_FOUND,
        'Poll not found',
      );
    }
    await assertCanAccessPost(this.prisma, poll.postId, profileId);

    return pollShape({ ...poll, storyId: null }, poll.votes, profileId);
  }

  // Submit an answer to a Q&A box ("Hazme una pregunta").
  async answerQna(profileId: string, qnaBoxId: string, answerText: string) {
    if (!answerText || answerText.trim().length === 0) {
      throw AppException.BadRequest(
        ErrorCode.EMPTY_ANSWER_TEXT,
        'Answer text cannot be empty',
      );
    }

    const sticker = await this.storySticker(qnaBoxId, 'QUESTION');
    if (sticker) {
      const answer = await this.prisma.storyStickerResponse.create({
        data: {
          stickerId: qnaBoxId,
          profileId,
          text: answerText.trim(),
        },
      });
      return {
        id: answer.id,
        qnaBoxId,
        answerText: answer.text ?? '',
        createdAt: answer.createdAt,
      };
    }

    const qnaBox = await this.prisma.qnaBox.findUnique({
      where: { id: qnaBoxId },
    });

    if (!qnaBox) {
      throw AppException.NotFound(
        ErrorCode.INTERACTIVE_NOT_FOUND,
        'Q&A box not found',
      );
    }

    const answer = await this.prisma.qnaAnswer.create({
      data: {
        qnaBoxId,
        profileId,
        answerText: answerText.trim(),
      },
    });

    return {
      id: answer.id,
      qnaBoxId: answer.qnaBoxId,
      answerText: answer.answerText,
      createdAt: answer.createdAt,
    };
  }

  // The question of a Q&A box, for anyone, and its answers, for the profile
  // that owns the post or story it sits on. People answer a creator, not
  // each other: the answers and who gave them go to nobody else.
  async getQnaBox(qnaBoxId: string, viewerProfileId?: string) {
    const sticker = await this.storySticker(qnaBoxId, 'QUESTION');
    if (sticker) {
      const prompt = String(
        (sticker.settings as Record<string, unknown>).prompt ?? '',
      );
      const isOwner =
        !!viewerProfileId && viewerProfileId === sticker.story.profileId;
      if (!isOwner) {
        return { id: qnaBoxId, prompt, totalAnswers: 0, answers: [] };
      }
      const answers = await this.prisma.storyStickerResponse.findMany({
        where: { stickerId: qnaBoxId },
        include: { profile: { select: ANSWER_PROFILE_SELECT } },
        orderBy: { createdAt: 'desc' },
      });
      return {
        id: qnaBoxId,
        prompt,
        totalAnswers: answers.length,
        answers: answers.map((a) =>
          answerShape(a.id, a.text ?? '', a.createdAt, a.profile),
        ),
      };
    }

    const qnaBox = await this.prisma.qnaBox.findUnique({
      where: { id: qnaBoxId },
      select: {
        id: true,
        prompt: true,
        post: { select: { profileId: true } },
      },
    });

    if (!qnaBox) {
      throw AppException.NotFound(
        ErrorCode.INTERACTIVE_NOT_FOUND,
        'Q&A box not found',
      );
    }

    const ownerProfileId = qnaBox.post?.profileId;
    const isOwner = !!viewerProfileId && viewerProfileId === ownerProfileId;
    if (!isOwner) {
      return {
        id: qnaBox.id,
        prompt: qnaBox.prompt,
        totalAnswers: 0,
        answers: [],
      };
    }

    const answers = await this.prisma.qnaAnswer.findMany({
      where: { qnaBoxId },
      include: { profile: { select: ANSWER_PROFILE_SELECT } },
      orderBy: { createdAt: 'desc' },
    });

    return {
      id: qnaBox.id,
      prompt: qnaBox.prompt,
      totalAnswers: answers.length,
      answers: answers.map((a) =>
        answerShape(a.id, a.answerText, a.createdAt, a.profile),
      ),
    };
  }

  /** A story's sticker of a kind by its id, the way the old routes reach it. */
  private storySticker(id: string, kind: 'POLL' | 'QUESTION') {
    return this.prisma.storySticker.findFirst({
      where: { id, kind },
      select: {
        id: true,
        storyId: true,
        settings: true,
        story: { select: { profileId: true } },
      },
    });
  }
}
