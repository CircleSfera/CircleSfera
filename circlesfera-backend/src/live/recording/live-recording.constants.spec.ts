import { describe, expect, it } from 'vitest';
import { guestFileName, isGuestFileName } from './live-recording.constants.js';

describe("the recorder's file names", () => {
  const stream = '11111111-2222-4333-8444-555555555555';
  const guest = '77777777-2222-4333-8444-555555555555';

  it("names a guest's file for the broadcast, the guest and their time on air", () => {
    expect(guestFileName(stream, guest, 2)).toBe(
      `live-${stream}-guest-${guest}-2.mp4`,
    );
  });

  it("knows a guest's file of this broadcast, and one of its old co-host", () => {
    expect(isGuestFileName(stream, guestFileName(stream, guest, 1))).toBe(true);
    expect(isGuestFileName(stream, `live-${stream}-cohost-3.mp4`)).toBe(true);
  });

  it("takes no other file for a guest's: the host's, another broadcast's, or one named otherwise", () => {
    for (const file of [
      `live-${stream}-host.mp4`,
      guestFileName('99999999-2222-4333-8444-555555555555', guest, 1),
      `live-${stream}-guest-${guest}-1.mp4.bak`,
      `live-${stream}-guest-../../etc-1.mp4`,
      `live-${stream}-cohost-x.mp4`,
    ]) {
      expect(isGuestFileName(stream, file)).toBe(false);
    }
  });
});
