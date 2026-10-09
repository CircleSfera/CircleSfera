import { describe, expect, it } from 'vitest';
import { initialsAvatarUrl, initialsOf } from './initialsAvatar';

describe('initialsOf', () => {
  it('takes the first letter of the first two words', () => {
    expect(initialsOf('Ana Martín')).toBe('AM');
    expect(initialsOf('ana.martin')).toBe('AM');
    expect(initialsOf('  ana   maría  lópez ')).toBe('AM');
  });

  it('takes the first two letters of a single word', () => {
    expect(initialsOf('ana')).toBe('AN');
    expect(initialsOf('x')).toBe('X');
  });

  it('keeps letters outside the basic alphabet whole', () => {
    expect(initialsOf('élodie')).toBe('ÉL');
    expect(initialsOf('😀smile')).toBe('😀S');
  });

  it('has a mark for an empty name', () => {
    expect(initialsOf('   ')).toBe('?');
  });
});

describe('initialsAvatarUrl', () => {
  const decoded = (name: string) =>
    decodeURIComponent(initialsAvatarUrl(name).split(',')[1]);

  it('is an image the browser draws without the network', () => {
    expect(initialsAvatarUrl('ana')).toMatch(/^data:image\/svg\+xml,/);
    expect(decoded('ana')).toContain('>AN</text>');
  });

  it('gives the same person the same picture every time', () => {
    expect(initialsAvatarUrl('ana')).toBe(initialsAvatarUrl('ana'));
    expect(initialsAvatarUrl('Ana ')).toContain(
      initialsAvatarUrl('ana').match(/fill%3D%22%23[0-9a-f]{6}/)?.[0] ?? 'x',
    );
  });

  it('gives different people different colours across a few names', () => {
    const colours = new Set(
      ['ana', 'luis', 'marta', 'pedro', 'sara', 'tomás'].map(
        (name) => decoded(name).match(/fill="(#[0-9a-f]{6})"/)?.[1],
      ),
    );
    expect(colours.size).toBeGreaterThan(2);
  });

  it('cannot be broken by a name with markup in it', () => {
    expect(decoded('<b>')).not.toContain('<b>');
  });
});
