import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaceLanguageInterceptor } from './place-language.interceptor.js';

const post = { id: 'post-1', placeId: 'place-1', location: 'Spain, Europe' };
const spanish = {
  placeId: 'place-1',
  locale: 'es',
  place: { name: 'Spain', fullName: 'Spain, Europe' },
  name: 'España',
  fullName: 'España, Europa',
  country: 'España',
  region: null,
  locality: null,
};

function setup() {
  const prisma = {
    placeTranslation: { findMany: vi.fn().mockResolvedValue([spanish]) },
    user: { findUnique: vi.fn().mockResolvedValue({ locale: 'es' }) },
  };
  const interceptor = new PlaceLanguageInterceptor(prisma as never);
  const run = (
    body: unknown,
    req: { user?: { userId: string }; headers?: Record<string, string> } = {
      user: { userId: 'user-1' },
    },
    type = 'http',
  ) => {
    const context = {
      getType: () => type,
      switchToHttp: () => ({ getRequest: () => ({ headers: {}, ...req }) }),
    } as unknown as ExecutionContext;
    const next: CallHandler = { handle: () => of(body) };
    return lastValueFrom(interceptor.intercept(context, next));
  };
  return { prisma, run };
}

describe('PlaceLanguageInterceptor', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  it('names the places of a response in the account language of the person asking', async () => {
    const result = await ctx.run({ data: [post] });

    expect(ctx.prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { locale: true },
    });
    expect(ctx.prisma.placeTranslation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { placeId: { in: ['place-1'] } },
      }),
    );
    expect(result).toEqual({
      data: [{ ...post, location: 'España, Europa' }],
    });
  });

  it('keeps a label the author wrote, which is none of the names of the place', async () => {
    const custom = { ...post, location: 'Mi rincón favorito' };

    const result = await ctx.run({ data: [custom, post] });

    expect(result).toEqual({
      data: [custom, { ...post, location: 'España, Europa' }],
    });
  });

  it('translates a label saved in another language of the place', async () => {
    const english = {
      ...spanish,
      locale: 'en',
      name: 'Spain',
      fullName: 'Kingdom of Spain',
    };
    ctx.prisma.placeTranslation.findMany.mockResolvedValue([spanish, english]);

    const result = await ctx.run({
      data: [{ ...post, location: 'Kingdom of Spain' }],
    });

    expect(result).toEqual({
      data: [{ ...post, location: 'España, Europa' }],
    });
  });

  it('uses only the names in the language of the person asking', async () => {
    ctx.prisma.placeTranslation.findMany.mockResolvedValue([
      { ...spanish, locale: 'en', name: 'Spain', fullName: 'Spain, Europe' },
    ]);

    const result = await ctx.run({ data: [post] });

    expect(result).toEqual({ data: [post] });
  });

  it('asks the database nothing when the response mentions no place', async () => {
    const body = { data: [{ id: 'post-2', placeId: null, location: null }] };

    const result = await ctx.run(body);

    expect(result).toBe(body);
    expect(ctx.prisma.user.findUnique).not.toHaveBeenCalled();
    expect(ctx.prisma.placeTranslation.findMany).not.toHaveBeenCalled();
  });

  it('uses the browser language for someone who is not signed in', async () => {
    ctx.prisma.placeTranslation.findMany.mockResolvedValue([
      spanish,
      { ...spanish, locale: 'en', name: 'Spain', fullName: 'Kingdom of Spain' },
    ]);

    const result = await ctx.run([post], {
      headers: { 'accept-language': 'en-GB,en;q=0.9' },
    });

    expect(ctx.prisma.user.findUnique).not.toHaveBeenCalled();
    expect(result).toEqual([{ ...post, location: 'Kingdom of Spain' }]);
  });

  it('keeps the saved names when the place has none in that language', async () => {
    ctx.prisma.placeTranslation.findMany.mockResolvedValue([]);

    const result = await ctx.run([post]);

    expect(result).toEqual([post]);
  });

  it('answers with the saved names when the translation cannot be read', async () => {
    ctx.prisma.placeTranslation.findMany.mockRejectedValue(
      new Error('db down'),
    );

    const result = await ctx.run([post]);

    expect(result).toEqual([post]);
  });

  it('leaves anything that is not an HTTP response alone', async () => {
    const result = await ctx.run([post], undefined, 'ws');

    expect(result).toEqual([post]);
    expect(ctx.prisma.placeTranslation.findMany).not.toHaveBeenCalled();
  });
});
