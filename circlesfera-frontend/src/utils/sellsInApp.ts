import { Capacitor } from '@capacitor/core';

// The iOS and Android apps sell nothing digital: unlocks, tips, live gifts,
// plans and promotions are bought on the web only (owner decision; the
// stores require their own payment for digital goods). Inside the apps every
// way to buy is left out, or says that it is not available in the app,
// without saying where else to buy: the stores forbid that too.
export function sellsInApp(): boolean {
  return !Capacitor.isNativePlatform();
}
