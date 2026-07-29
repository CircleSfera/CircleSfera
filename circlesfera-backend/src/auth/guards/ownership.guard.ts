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
  RequireOwnershipOptions,
} from '../decorators/require-ownership.decorator.js';

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

    if (!user?.userId) {
      throw new ForbiddenException('User not authenticated');
    }

    const paramKey = options.paramKey || 'id';
    const resourceId = request.params[paramKey];

    if (!resourceId) {
      throw new BadRequestException(`Missing route parameter: ${paramKey}`);
    }

    const userIdField = options.userIdField || 'userId';
    const model = options.model;

    // Dynamically access prisma model
    const delegate = (this.prisma as any)[
      model.charAt(0).toLowerCase() + model.slice(1)
    ];

    if (!delegate || typeof delegate.findUnique !== 'function') {
      throw new Error(
        `Invalid Prisma model specified in OwnershipGuard: ${model}`,
      );
    }

    const resource = await delegate.findUnique({
      where: { id: resourceId },
      select: { [userIdField]: true },
    });

    if (!resource) {
      throw new NotFoundException(`${model} not found`);
    }

    if (resource[userIdField] !== user.userId) {
      throw new ForbiddenException(
        `You can only manage your own ${model.toLowerCase()}s`,
      );
    }

    return true;
  }
}
