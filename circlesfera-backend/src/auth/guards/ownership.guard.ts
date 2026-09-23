import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  REQUIRE_OWNERSHIP_KEY,
  type RequireOwnershipOptions,
} from '../decorators/require-ownership.decorator.js';

interface ResourceOwnerDelegate {
  findUnique(args: {
    where: { id: string };
    select: Record<string, boolean>;
  }): Promise<Record<string, unknown> | null>;
}

function getPrismaDelegate(
  prisma: PrismaService,
  model: string,
): ResourceOwnerDelegate | null {
  switch (model) {
    case 'Post':
      return prisma.post;
    case 'Comment':
      return prisma.comment;
    case 'Story':
      return prisma.story;
    case 'Highlight':
      return prisma.highlight;
    case 'DataExportRequest':
      return prisma.dataExportRequest;
    case 'SupportTicket':
      return prisma.supportTicket;
    case 'Notification':
      return prisma.notification;
    case 'Profile':
      return prisma.profile;
    case 'User':
      return prisma.user;
    case 'Collection':
      return prisma.collection;
    case 'Message':
      return prisma.message;
    default:
      return null;
  }
}

@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RequireOwnershipOptions>(
      REQUIRE_OWNERSHIP_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!options) {
      return true; // No ownership check required
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.userId || !user?.profileId) {
      throw new ForbiddenException('User not authenticated');
    }

    const paramKey = options.paramKey || 'id';
    const resourceId = request.params?.[paramKey];

    if (!resourceId) {
      throw new BadRequestException(`Missing route parameter: ${paramKey}`);
    }

    const model = options.model;
    const delegate = getPrismaDelegate(this.prisma, model);

    if (!delegate) {
      throw new BadRequestException(
        `Invalid Prisma model specified in OwnershipGuard: ${model}`,
      );
    }

    // Determine ownership field and expected identity contract
    const ownerField =
      options.userIdField ||
      (model === 'DataExportRequest' || model === 'SupportTicket'
        ? 'userId'
        : model === 'User'
          ? 'id'
          : model === 'Notification'
            ? 'recipientId'
            : 'profileId');

    const expectedOwner =
      ownerField === 'userId' || (model === 'User' && ownerField === 'id')
        ? user.userId
        : user.profileId;

    const resource = await delegate.findUnique({
      where: { id: resourceId },
      select: { [ownerField]: true },
    });

    if (!resource) {
      throw new NotFoundException(`${model} not found`);
    }

    if (resource[ownerField] !== expectedOwner) {
      throw new ForbiddenException(
        `You can only manage your own ${model.toLowerCase()}s`,
      );
    }

    return true;
  }
}
