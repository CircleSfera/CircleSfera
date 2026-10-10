import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateSavedReplyDto,
  UpdateSavedReplyDto,
} from './dto/saved-reply.dto.js';
import { HelpdeskStore } from './helpdesk.store.js';

/** Who asks: the agent, and whether they lead the team. */
export interface SavedReplyActor {
  ref: string;
  canManage: boolean;
}

// The answers agents keep for repeated questions. A personal one belongs to
// the agent who wrote it and nobody else sees it; a shared one is seen by
// every agent and managed by who leads the team. None is ever sent on its
// own: it only fills the reply box of the agent's screen.
@Injectable()
export class HelpdeskSavedRepliesService {
  constructor(@Inject(HelpdeskStore) private readonly store: HelpdeskStore) {}

  private view(reply: {
    id: string;
    title: string;
    body: string;
    ownerRef: string | null;
    updatedAt: Date;
  }) {
    return {
      id: reply.id,
      title: reply.title,
      body: reply.body,
      shared: reply.ownerRef === null,
      updatedAt: reply.updatedAt,
    };
  }

  // The reply, when this agent may change it. A personal reply of someone
  // else does not exist for them; a shared one exists but is not theirs to
  // change unless they lead the team.
  private async manageable(actor: SavedReplyActor, id: string) {
    const reply = await this.store.findSavedReply(id);
    if (!reply || (reply.ownerRef !== null && reply.ownerRef !== actor.ref)) {
      throw new NotFoundException('Saved reply not found');
    }
    if (reply.ownerRef === null && !actor.canManage) {
      throw new ForbiddenException(
        'Only who leads the team can change a shared reply',
      );
    }
    return reply;
  }

  async list(agentRef: string) {
    const replies = await this.store.savedRepliesFor(agentRef);
    return replies.map((reply) => this.view(reply));
  }

  async create(actor: SavedReplyActor, dto: CreateSavedReplyDto) {
    const title = dto.title.trim();
    const body = dto.body.trim();
    if (!title || !body) {
      throw new BadRequestException('A saved reply needs a title and a text');
    }
    if (dto.shared && !actor.canManage) {
      throw new ForbiddenException(
        'Only who leads the team can share a reply with it',
      );
    }
    return this.view(
      await this.store.createSavedReply({
        title,
        body,
        ownerRef: dto.shared ? null : actor.ref,
      }),
    );
  }

  async update(actor: SavedReplyActor, id: string, dto: UpdateSavedReplyDto) {
    await this.manageable(actor, id);
    const title = dto.title?.trim();
    const body = dto.body?.trim();
    if (title === '' || body === '') {
      throw new BadRequestException('A saved reply needs a title and a text');
    }
    const updated = await this.store.updateSavedReply(id, { title, body });
    // Deleted between the two steps.
    if (!updated) throw new NotFoundException('Saved reply not found');
    return this.view(updated);
  }

  async remove(actor: SavedReplyActor, id: string) {
    await this.manageable(actor, id);
    await this.store.deleteSavedReply(id);
    return { deleted: true };
  }
}
