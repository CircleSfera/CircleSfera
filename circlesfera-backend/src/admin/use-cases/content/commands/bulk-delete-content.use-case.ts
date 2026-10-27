import { Inject, Injectable, Logger } from '@nestjs/common';
import { EmailService } from '../../../../email/email.service.js';
import { DeleteCommentUseCase } from './delete-comment.use-case.js';
import { DeletePostUseCase } from './delete-post.use-case.js';

// A wave of spam is many items and one decision. Each item is deleted the
// way it is deleted alone, with its own entry in the audit log, one after
// another: one that fails (it was already gone) does not stop the rest.
@Injectable()
export class BulkDeleteContentUseCase {
  private readonly logger = new Logger(BulkDeleteContentUseCase.name);

  constructor(
    @Inject(DeletePostUseCase) private readonly deletePost: DeletePostUseCase,
    @Inject(DeleteCommentUseCase)
    private readonly deleteComment: DeleteCommentUseCase,
    @Inject(EmailService) private readonly emailService: EmailService,
  ) {}

  // Each author is told once, with how many of their posts were removed:
  // one e-mail per post reads as spam to who receives them. In the app each
  // removed post has its own notice: each is appealed on its own.
  async posts(adminId: string, ids: string[]) {
    const removed = new Map<
      string,
      { name: string | null | undefined; count: number }
    >();
    const result = await this.each(ids, async (id) => {
      const { author } = await this.deletePost.remove(adminId, id);
      if (!author) return;
      const told = removed.get(author.email);
      if (told) told.count++;
      else removed.set(author.email, { name: author.name, count: 1 });
    });

    for (const [email, { name, count }] of removed) {
      try {
        if (count === 1) {
          await this.emailService.sendPostRemovedEmail(email, name);
        } else {
          await this.emailService.sendPostsRemovedEmail(email, name, count);
        }
      } catch (err) {
        // The posts are deleted whatever happens to the notice.
        this.logger.warn(
          `An author could not be told of ${count} removed posts: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    return result;
  }

  comments(adminId: string, ids: string[]) {
    return this.each(ids, (id) => this.deleteComment.execute(adminId, id));
  }

  private async each(ids: string[], remove: (id: string) => Promise<unknown>) {
    let deleted = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        await remove(id);
        deleted++;
      } catch (err) {
        failed++;
        this.logger.warn(
          `Could not delete ${id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return { deleted, failed };
  }
}
