// The billing period of a subscription, in seconds since the epoch. The
// payment provider keeps it on each subscription item, not on the
// subscription itself; a plan subscription has a single item. A
// subscription with no item is refused rather than given an invalid date.
export type SubscriptionWithItems = {
  id?: string;
  items?: {
    data?: {
      id?: string;
      current_period_start?: number;
      current_period_end?: number;
      price?: { id?: string; recurring?: { interval?: string } | null } | null;
    }[];
  };
};

export function subscriptionPeriod(subscription: SubscriptionWithItems): {
  start: Date;
  end: Date;
} {
  const item = subscription.items?.data?.[0];
  const start = item?.current_period_start;
  const end = item?.current_period_end;
  if (typeof start !== 'number' || typeof end !== 'number') {
    throw new Error(
      `Subscription ${subscription.id ?? ''} has no billing period on its item`,
    );
  }
  return { start: new Date(start * 1000), end: new Date(end * 1000) };
}

// How often a subscription is charged, from the price of its item: "month"
// or "year". Undefined when the provider names neither, so a row keeps
// what it had.
export function subscriptionInterval(
  subscription: SubscriptionWithItems,
): 'month' | 'year' | undefined {
  const interval = subscription.items?.data?.[0]?.price?.recurring?.interval;
  return interval === 'month' || interval === 'year' ? interval : undefined;
}
