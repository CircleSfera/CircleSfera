import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import type { Locale } from '@prisma/client';
import type { Request } from 'express';
import { from, type Observable, of } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service.js';
import { toSupportedLocale } from '../constants/locale.constants.js';
import {
  applyPlaceNames,
  collectPlaceIds,
  type PlaceNames,
} from './place-names.js';

/**
 * Names the places of every response in the language of the person asking:
 * the account language when signed in, the browser's otherwise. A place with
 * no names in that language keeps the ones it was saved with.
 */
@Injectable()
export class PlaceLanguageInterceptor implements NestInterceptor {
  private readonly logger = new Logger(PlaceLanguageInterceptor.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      mergeMap((data) => {
        const placeIds = collectPlaceIds(data);
        if (placeIds.length === 0) return of(data);
        return from(this.translate(data, placeIds, req)).pipe(
          // Places in another language are better than a failed request.
          catchError((error: unknown) => {
            this.logger.warn(
              `Place names not translated: ${error instanceof Error ? error.message : 'unknown error'}`,
            );
            return of(data);
          }),
        );
      }),
    );
  }

  private async translate(data: unknown, placeIds: string[], req: Request) {
    const locale = await this.viewerLocale(req);
    const rows = await this.prisma.placeTranslation.findMany({
      where: { placeId: { in: placeIds }, locale },
      select: {
        placeId: true,
        name: true,
        fullName: true,
        country: true,
        region: true,
        locality: true,
      },
    });
    const names = new Map<string, PlaceNames>(
      rows.map(({ placeId, ...rest }) => [placeId, rest]),
    );
    return applyPlaceNames(data, names);
  }

  private async viewerLocale(req: Request): Promise<Locale> {
    const userId = (req as Request & { user?: { userId?: string } }).user
      ?.userId;
    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { locale: true },
      });
      if (user) return user.locale;
    }
    const header = req.headers?.['accept-language'];
    const first = (Array.isArray(header) ? header[0] : header)?.split(',')[0];
    return toSupportedLocale(first);
  }
}
