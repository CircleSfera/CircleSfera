import {
  LIVE_SCHEDULE_MAX_DAYS,
  LIVE_SCHEDULE_MIN_MINUTES,
} from '@circlesfera/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import {
  fromLocalInputValue,
  toLocalInputValue,
} from '../../utils/liveSchedule';
import LiveScheduleSheet from './LiveScheduleSheet';

const api = vi.hoisted(() => ({ schedule: vi.fn() }));
vi.mock('../../services/live', () => ({ liveApi: api }));

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function open(
  props: Partial<Parameters<typeof LiveScheduleSheet>[0]> = {},
  lng: 'en' | 'es' = 'en',
) {
  const onScheduled = vi.fn();
  const view = renderWithProviders(
    <LiveScheduleSheet
      isOpen
      onClose={vi.fn()}
      title="Sunday chat"
      audience="EVERYONE"
      onScheduled={onScheduled}
      {...props}
    />,
    { lng },
  );
  const t = view.i18n!.t;
  return { ...view, t, onScheduled };
}

const picker = (t: (key: string) => string) =>
  screen.getByLabelText(t('live.schedule.when_label')) as HTMLInputElement;

describe('LiveScheduleSheet', () => {
  beforeEach(() => vi.clearAllMocks());

  it('limits the picker to the earliest and the furthest time allowed', () => {
    const before = Date.now();
    const { t } = open();
    const input = picker(t);
    const min = fromLocalInputValue(input.min)!.getTime();
    const max = fromLocalInputValue(input.max)!.getTime();
    expect(min).toBeGreaterThanOrEqual(
      before + LIVE_SCHEDULE_MIN_MINUTES * MINUTE - MINUTE,
    );
    expect(min).toBeLessThanOrEqual(
      Date.now() + (LIVE_SCHEDULE_MIN_MINUTES + 1) * MINUTE,
    );
    expect(max).toBeLessThanOrEqual(Date.now() + LIVE_SCHEDULE_MAX_DAYS * DAY);
    expect(max).toBeGreaterThan(
      before + LIVE_SCHEDULE_MAX_DAYS * DAY - 2 * MINUTE,
    );
    // A time is offered, within the limits.
    const offered = fromLocalInputValue(input.value)!.getTime();
    expect(offered).toBeGreaterThanOrEqual(min);
    expect(offered).toBeLessThanOrEqual(max);
    expect(
      screen.getByText(
        t('live.schedule.limits_hint', {
          min: LIVE_SCHEDULE_MIN_MINUTES,
          days: LIVE_SCHEDULE_MAX_DAYS,
        }),
      ),
    ).toBeInTheDocument();
  });

  it('schedules with the title and the audience of the setup', async () => {
    const live = { id: 'sl-1', hostId: 'h', startsAt: 'x' };
    api.schedule.mockResolvedValue(live);
    const { t, onScheduled } = open({ audience: 'CLOSE_FRIENDS' });
    const startsAt = new Date(Date.now() + 2 * DAY);
    startsAt.setSeconds(0, 0);
    fireEvent.change(picker(t), {
      target: { value: toLocalInputValue(startsAt) },
    });
    expect(
      screen.getByText(
        t('live.schedule.summary_CLOSE_FRIENDS', {
          title: 'Sunday chat',
        }),
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: t('live.schedule.submit') }),
    );

    await waitFor(() => expect(onScheduled).toHaveBeenCalled());
    expect(api.schedule).toHaveBeenCalledWith({
      title: 'Sunday chat',
      audience: 'CLOSE_FRIENDS',
      startsAt: startsAt.toISOString(),
    });
  });

  it('says a time too soon or too far is not allowed, without asking the server', () => {
    const { t } = open();
    fireEvent.change(picker(t), {
      target: { value: toLocalInputValue(new Date(Date.now() + MINUTE)) },
    });
    fireEvent.click(
      screen.getByRole('button', { name: t('live.schedule.submit') }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      t('live.schedule.error_too_soon', {
        min: LIVE_SCHEDULE_MIN_MINUTES,
      }),
    );

    fireEvent.change(picker(t), {
      target: {
        value: toLocalInputValue(
          new Date(Date.now() + (LIVE_SCHEDULE_MAX_DAYS + 1) * DAY),
        ),
      },
    });
    fireEvent.click(
      screen.getByRole('button', { name: t('live.schedule.submit') }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      t('live.schedule.error_too_far', {
        days: LIVE_SCHEDULE_MAX_DAYS,
      }),
    );
    expect(api.schedule).not.toHaveBeenCalled();
  });

  it("says what the server refused, in the reader's language", async () => {
    api.schedule.mockRejectedValue({
      status: 409,
      data: { errorCode: 'LIVE_SCHEDULED_LIMIT' },
    });
    const { t, onScheduled } = open({}, 'es');
    fireEvent.click(
      screen.getByRole('button', { name: t('live.schedule.submit') }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      t('errors.codes.LIVE_SCHEDULED_LIMIT'),
    );
    expect(onScheduled).not.toHaveBeenCalled();
  });

  it('explains that a practice cannot be scheduled, with no picker', () => {
    const { t } = open({ audience: 'PRACTICE' });
    expect(
      screen.getByText(t('live.schedule.practice_hint')),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(t('live.schedule.when_label')),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: t('live.schedule.submit') }),
    ).not.toBeInTheDocument();
  });
});
