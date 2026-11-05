import {
  ErrorCode,
  HIDDEN_WORD_MAX_LENGTH,
  HIDDEN_WORDS_MAX,
} from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  containsHiddenWord,
  normalizeHiddenWord,
} from './hidden-words.match.js';

// The words, phrases and emojis a Profile hides: a comment on its posts that
// contains one is shown only to whoever wrote it, until the Profile shows it.
@Injectable()
export class HiddenWordsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(profileId: string) {
    const rows = await this.prisma.hiddenWord.findMany({
      where: { profileId },
      orderBy: { createdAt: 'desc' },
      select: { word: true, createdAt: true },
    });
    return { words: rows, max: HIDDEN_WORDS_MAX };
  }

  async add(profileId: string, input: string) {
    const word = normalizeHiddenWord(input);
    if (!word || word.length > HIDDEN_WORD_MAX_LENGTH) {
      throw AppException.BadRequest(
        ErrorCode.HIDDEN_WORD_INVALID,
        `A hidden word has 1 to ${HIDDEN_WORD_MAX_LENGTH} characters`,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      // The Profile is locked so two adds at once cannot pass the limit.
      await tx.$queryRaw`SELECT id FROM "profiles" WHERE id = ${profileId} FOR UPDATE`;
      const existing = await tx.hiddenWord.findUnique({
        where: { profileId_word: { profileId, word } },
        select: { word: true },
      });
      if (existing) return { word };
      const count = await tx.hiddenWord.count({ where: { profileId } });
      if (count >= HIDDEN_WORDS_MAX) {
        throw AppException.Conflict(
          ErrorCode.HIDDEN_WORDS_FULL,
          `A Profile hides at most ${HIDDEN_WORDS_MAX} words`,
        );
      }
      await tx.hiddenWord.create({ data: { profileId, word } });
      return { word };
    });
  }

  async remove(profileId: string, input: string) {
    await this.prisma.hiddenWord.deleteMany({
      where: { profileId, word: normalizeHiddenWord(input) },
    });
    return { success: true };
  }

  // Whether a text written to this Profile contains one of its hidden words.
  async hides(profileId: string, text: string | null | undefined) {
    if (!text) return false;
    const rows = await this.prisma.hiddenWord.findMany({
      where: { profileId },
      select: { word: true },
    });
    return containsHiddenWord(
      text,
      rows.map((row) => row.word),
    );
  }
}
