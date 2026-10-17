import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecordPromotionInteractionUseCase } from './record-promotion-interaction.use-case.js';

const TODAY = '2026-10-17';

function promo(over: Record<string, unknown> = {}) {
  return {
    id: 'promo-1',
    budgetCents: 3500,
    userId: 'owner',
    status: 'ACTIVE',
    dailyBudgetCents: 500,
    spendDay: TODAY,
    spentTodayCents: 10,
    ...over,
  };
}

describe('RecordPromotionInteractionUseCase.recordView', () => {
  let tx: {
    $queryRaw: ReturnType<typeof vi.fn>;
    promotion: { update: ReturnType<typeof vi.fn> };
  };
  let useCase: RecordPromotionInteractionUseCase;

  function answers(row: Record<string, unknown> | undefined, views = 1) {
    tx.$queryRaw
      .mockResolvedValueOnce(row ? [row] : [])
      .mockResolvedValueOnce([{ views }]);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
    tx = { $queryRaw: vi.fn(), promotion: { update: vi.fn() } };
    const prisma = {
      $transaction: vi.fn((run: (t: typeof tx) => unknown) => run(tx)),
    };
    useCase = new RecordPromotionInteractionUseCase(prisma as never);
  });

  afterEach(() => vi.useRealTimers());

  it('charges one cent the first time a person sees it on a day', async () => {
    answers(promo());

    expect(await useCase.recordView('promo-1', 'viewer')).toEqual({
      success: true,
    });
    expect(tx.promotion.update).toHaveBeenCalledWith({
      where: { id: 'promo-1' },
      data: expect.objectContaining({
        reach: { increment: 1 },
        budgetCents: 3499,
        spendDay: new Date(`${TODAY}T00:00:00.000Z`),
        spentTodayCents: 11,
      }),
    });
  });

  it('charges nothing when the person saw it earlier that day', async () => {
    answers(promo(), 2);

    expect(await useCase.recordView('promo-1', 'viewer')).toEqual({
      success: true,
    });
    expect(tx.promotion.update).not.toHaveBeenCalled();
  });

  it('starts a new day at zero', async () => {
    answers(promo({ spendDay: '2026-10-16', spentTodayCents: 500 }));

    await useCase.recordView('promo-1', 'viewer');

    expect(tx.promotion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ spentTodayCents: 1 }),
      }),
    );
  });

  it('spends nothing more once the day has spent its budget', async () => {
    answers(promo({ spentTodayCents: 500 }));

    expect(await useCase.recordView('promo-1', 'viewer')).toEqual({
      success: false,
    });
    // Not even counted as seen.
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.promotion.update).not.toHaveBeenCalled();
  });

  it('ends the promotion when the last cent is spent', async () => {
    answers(promo({ budgetCents: 1 }));

    await useCase.recordView('promo-1', 'viewer');

    expect(tx.promotion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'COMPLETED',
          budgetCents: 0,
        }),
      }),
    );
  });

  it('charges nothing for the owner', async () => {
    answers(promo());
    expect(await useCase.recordView('promo-1', 'owner')).toEqual({
      success: false,
    });
    expect(tx.promotion.update).not.toHaveBeenCalled();
  });

  it('charges nothing for a promotion that is not running', async () => {
    answers(promo({ status: 'PAUSED' }));
    expect(await useCase.recordView('promo-1', 'viewer')).toEqual({
      success: false,
    });
    expect(tx.promotion.update).not.toHaveBeenCalled();
  });

  it('charges nothing for a guest, and asks nothing', async () => {
    expect(await useCase.recordView('promo-1', '')).toEqual({
      success: false,
    });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('counts no view past the daily cap of a person', async () => {
    tx.$queryRaw.mockResolvedValueOnce([promo()]).mockResolvedValueOnce([]);

    expect(await useCase.recordView('promo-1', 'viewer')).toEqual({
      success: false,
    });
    expect(tx.promotion.update).not.toHaveBeenCalled();
  });
});
