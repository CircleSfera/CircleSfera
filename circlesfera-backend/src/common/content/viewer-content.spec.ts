import { describe, expect, it, vi } from 'vitest';
import {
  loadViewerContent,
  matureWhere,
  shouldBlur,
} from './viewer-content.js';

function db(settings: unknown, profile: unknown = { userId: 'u1' }) {
  return {
    profile: { findUnique: vi.fn().mockResolvedValue(profile) },
    userSettings: { findUnique: vi.fn().mockResolvedValue(settings) },
  } as any;
}

describe('viewer content', () => {
  it('gives a guest no mature posts, blurred', async () => {
    const reader = db(null);
    await expect(loadViewerContent(reader, undefined)).resolves.toEqual({
      allowMature: false,
      blurSensitiveContent: true,
    });
    expect(reader.profile.findUnique).not.toHaveBeenCalled();
  });

  it('reads the settings of the person behind the Profile', async () => {
    const reader = db({
      contentPreference: 'MATURE',
      blurSensitiveContent: false,
    });
    await expect(loadViewerContent(reader, 'p1')).resolves.toEqual({
      allowMature: true,
      blurSensitiveContent: false,
    });
    expect(reader.userSettings.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
  });

  it('treats an unknown Profile as a guest', async () => {
    await expect(loadViewerContent(db(null, null), 'gone')).resolves.toEqual({
      allowMature: false,
      blurSensitiveContent: true,
    });
  });

  it('limits lists to general posts unless mature ones are allowed', () => {
    expect(
      matureWhere({ allowMature: false, blurSensitiveContent: true }),
    ).toEqual({
      contentRating: 'GENERAL',
    });
    expect(
      matureWhere({ allowMature: true, blurSensitiveContent: true }),
    ).toEqual({});
  });

  it('blurs a mature post unless it is the viewer own or they chose no blur', () => {
    const mature = { contentRating: 'MATURE', profileId: 'author' };
    const allowNoBlur = { allowMature: true, blurSensitiveContent: false };
    const allowBlur = { allowMature: true, blurSensitiveContent: true };
    const general = { allowMature: false, blurSensitiveContent: false };

    expect(shouldBlur({ contentRating: 'GENERAL' }, allowBlur, 'v')).toBe(
      false,
    );
    expect(shouldBlur(mature, allowBlur, 'v')).toBe(true);
    expect(shouldBlur(mature, allowNoBlur, 'v')).toBe(false);
    // Reached by its link by someone who does not allow mature posts.
    expect(shouldBlur(mature, general, 'v')).toBe(true);
    expect(shouldBlur(mature, allowBlur, 'author')).toBe(false);
  });
});
