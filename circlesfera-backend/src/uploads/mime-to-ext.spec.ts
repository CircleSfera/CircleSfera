import { mimetypeToExt } from './mime-to-ext.js';

describe('mimetypeToExt', () => {
  // ── Images ────────────────────────────────────────────────────────────────
  it.each([
    ['image/jpeg', '.jpg'],
    ['image/jpg', '.jpg'],
    ['image/png', '.png'],
    ['image/webp', '.webp'],
    ['image/gif', '.gif'],
    ['image/heic', '.heic'],
    ['image/heif', '.heif'],
    ['image/avif', '.avif'],
  ])('maps %s → %s', (mime, expected) => {
    expect(mimetypeToExt(mime)).toBe(expected);
  });

  // ── Video ─────────────────────────────────────────────────────────────────
  it.each([
    ['video/mp4', '.mp4'],
    ['video/quicktime', '.mp4'], // normalised to .mp4
    ['video/mov', '.mp4'],
    ['video/webm', '.webm'],
  ])('maps %s → %s', (mime, expected) => {
    expect(mimetypeToExt(mime)).toBe(expected);
  });

  // ── Audio ─────────────────────────────────────────────────────────────────
  it.each([
    ['audio/mpeg', '.mp3'],
    ['audio/mp3', '.mp3'],
    ['audio/wav', '.wav'],
    ['audio/wave', '.wav'],
    ['audio/x-wav', '.wav'],
    ['audio/x-m4a', '.m4a'],
    ['audio/m4a', '.m4a'],
    ['audio/mp4', '.m4a'],
  ])('maps %s → %s', (mime, expected) => {
    expect(mimetypeToExt(mime)).toBe(expected);
  });

  // ── Fallback ──────────────────────────────────────────────────────────────
  it('falls back to .bin for unknown or prohibited types', () => {
    expect(mimetypeToExt('application/octet-stream')).toBe('.bin');
    expect(mimetypeToExt('image/svg+xml')).toBe('.bin'); // prohibited
    expect(mimetypeToExt('text/html')).toBe('.bin');
  });

  it('falls back to .bin for empty string', () => {
    expect(mimetypeToExt('')).toBe('.bin');
  });

  it('falls back to .bin for malicious path inputs', () => {
    expect(mimetypeToExt('../../../etc/passwd')).toBe('.bin');
  });
});
