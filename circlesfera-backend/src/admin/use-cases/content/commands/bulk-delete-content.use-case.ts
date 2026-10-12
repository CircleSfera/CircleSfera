import { Inject, Injectable, Logger } from '@nestjs/common';
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
  ) {}

  posts(adminId: string, ids: string[]) {
    return this.each(ids, (id) => this.deletePost.execute(adminId, id));
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
