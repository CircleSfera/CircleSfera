import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreatePollDto } from './dto/create-poll.dto.js';
import type { CreateQnaBoxDto } from './dto/create-qna.dto.js';

/** Service for interactive polls and Q&A features. */
@Injectable()
export class InteractiveService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Create a poll attached to a post or story owned by the user.
   */
  async createPoll(userId: string, dto: CreatePollDto) {
    if (!dto.postId && !dto.storyId) {
      throw new BadRequestException('Either postId or storyId is required');
    }
    if (dto.postId && dto.storyId) {
      throw new BadRequestException(
        'Provide either postId or storyId, not both',
      );
    }

    const options = dto.options.map((o) => o.trim()).filter(Boolean);
    if (options.length < 2) {
      throw new BadRequestException(
        'At least 2 non-empty options are required',
      );
    }

    if (dto.postId) {
      const post = await this.prisma.post.findUnique({
        where: { id: dto.postId },
      });
      if (!post) throw new NotFoundException('Post not found');
      if (post.userId !== userId) throw new ForbiddenException('Not your post');
      const existing = await this.prisma.poll.findUnique({
        where: { postId: dto.postId },
      });
      if (existing) throw new BadRequestException('Post already has a poll');
    }

    if (dto.storyId) {
      const story = await this.prisma.story.findUnique({
        where: { id: dto.storyId },
      });
      if (!story) throw new NotFoundException('Story not found');
      if (story.userId !== userId)
        throw new ForbiddenException('Not your story');
      const existing = await this.prisma.poll.findUnique({
        where: { storyId: dto.storyId },
      });
      if (existing) throw new BadRequestException('Story already has a poll');
    }

    return this.prisma.poll.create({
      data: {
        question: dto.question.trim(),
        options,
        postId: dto.postId,
        storyId: dto.storyId,
      },
    });
  }

  /**
   * Create a Q&A box attached to a post or story owned by the user.
   */
  async createQnaBox(userId: string, dto: CreateQnaBoxDto) {
    if (!dto.postId && !dto.storyId) {
      throw new BadRequestException('Either postId or storyId is required');
    }
    if (dto.postId && dto.storyId) {
      throw new BadRequestException(
        'Provide either postId or storyId, not both',
      );
    }

    if (dto.postId) {
      const post = await this.prisma.post.findUnique({
        where: { id: dto.postId },
      });
      if (!post) throw new NotFoundException('Post not found');
      if (post.userId !== userId) throw new ForbiddenException('Not your post');
      const existing = await this.prisma.qnaBox.findUnique({
        where: { postId: dto.postId },
      });
      if (existing) throw new BadRequestException('Post already has a Q&A box');
    }

    if (dto.storyId) {
      const story = await this.prisma.story.findUnique({
        where: { id: dto.storyId },
      });
      if (!story) throw new NotFoundException('Story not found');
      if (story.userId !== userId)
        throw new ForbiddenException('Not your story');
      const existing = await this.prisma.qnaBox.findUnique({
        where: { storyId: dto.storyId },
      });
      if (existing)
        throw new BadRequestException('Story already has a Q&A box');
    }

    return this.prisma.qnaBox.create({
      data: {
        prompt: dto.prompt.trim(),
        postId: dto.postId,
        storyId: dto.storyId,
      },
    });
  }

  /**
   * Cast or change a user vote in a poll.
   */
  async votePoll(userId: string, pollId: string, optionIndex: number) {
    const poll = await this.prisma.poll.findUnique({
      where: { id: pollId },
    });

    if (!poll) {
      throw new NotFoundException('Poll not found');
    }

    if (optionIndex < 0 || optionIndex >= poll.options.length) {
      throw new BadRequestException('Invalid poll option index');
    }

    // Upsert vote (allow changing vote)
    await this.prisma.pollVote.upsert({
      where: {
        pollId_userId: { pollId, userId },
      },
      create: {
        pollId,
        userId,
        optionIndex,
      },
      update: {
        optionIndex,
      },
    });

    return this.getPoll(pollId, userId);
  }

  /**
   * Get poll details with vote count and breakdown.
   */
  async getPoll(pollId: string, userId?: string) {
    const poll = await this.prisma.poll.findUnique({
      where: { id: pollId },
      include: {
        votes: true,
      },
    });

    if (!poll) {
      throw new NotFoundException('Poll not found');
    }

    const totalVotes = poll.votes.length;
    const optionCounts = new Array(poll.options.length).fill(0);

    let userVoteIndex: number | null = null;

    for (const vote of poll.votes) {
      if (vote.optionIndex >= 0 && vote.optionIndex < poll.options.length) {
        optionCounts[vote.optionIndex] += 1;
      }
      if (userId && vote.userId === userId) {
        userVoteIndex = vote.optionIndex;
      }
    }

    const optionsBreakdown = poll.options.map((option: string, idx: number) => {
      const votes = optionCounts[idx] || 0;
      const percentage =
        totalVotes > 0 ? Number(((votes / totalVotes) * 100).toFixed(1)) : 0;
      return {
        index: idx,
        text: option,
        votes,
        percentage,
      };
    });

    return {
      id: poll.id,
      question: poll.question,
      totalVotes,
      userVoteIndex,
      options: optionsBreakdown,
      postId: poll.postId,
      storyId: poll.storyId,
    };
  }

  /**
   * Submit an answer to a Q&A box ("Hazme una pregunta").
   */
  async answerQna(userId: string, qnaBoxId: string, answerText: string) {
    if (!answerText || answerText.trim().length === 0) {
      throw new BadRequestException('Answer text cannot be empty');
    }

    const qnaBox = await this.prisma.qnaBox.findUnique({
      where: { id: qnaBoxId },
    });

    if (!qnaBox) {
      throw new NotFoundException('Q&A box not found');
    }

    const answer = await this.prisma.qnaAnswer.create({
      data: {
        qnaBoxId,
        userId,
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

  /**
   * Get Q&A Box prompt and received answers.
   */
  async getQnaBox(qnaBoxId: string) {
    const qnaBox = await this.prisma.qnaBox.findUnique({
      where: { id: qnaBoxId },
      include: {
        answers: {
          include: {
            user: {
              select: {
                id: true,
                profile: {
                  select: { username: true, avatar: true, fullName: true },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!qnaBox) {
      throw new NotFoundException('Q&A box not found');
    }

    return {
      id: qnaBox.id,
      prompt: qnaBox.prompt,
      totalAnswers: qnaBox.answers.length,
      answers: qnaBox.answers.map((a) => {
        const username = a.user.profile?.username || 'usuario';
        return {
          id: a.id,
          answerText: a.answerText,
          createdAt: a.createdAt,
          user: {
            id: a.user.id,
            username,
            fullName: a.user.profile?.fullName || username,
            avatar: a.user.profile?.avatar || null,
          },
        };
      }),
    };
  }
}
