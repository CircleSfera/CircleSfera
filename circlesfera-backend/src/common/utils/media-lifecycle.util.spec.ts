import { describe, expect, it } from 'vitest';
import {
  buildMediaCreateInput,
  buildVoiceMediaCreateInput,
  resolveMediaFields,
} from './media-lifecycle.util.js';

describe('buildMediaCreateInput', () => {
  it('marks an image READY immediately, no matter the variant urls', () => {
    expect(
      buildMediaCreateInput({ type: 'image', url: 'https://cdn/img.jpg' }),
    ).toEqual({
      kind: 'IMAGE',
      status: 'READY',
      url: 'https://cdn/img.jpg',
      standardUrl: null,
      thumbnailUrl: null,
    });
  });

  it('marks a video PENDING when no standardUrl exists yet', () => {
    expect(
      buildMediaCreateInput({ type: 'video', url: 'https://cdn/vid.mp4' }),
    ).toEqual({
      kind: 'VIDEO',
      status: 'PENDING',
      url: 'https://cdn/vid.mp4',
      standardUrl: null,
      thumbnailUrl: null,
    });
  });

  it('marks a video READY once a standardUrl already exists', () => {
    const result = buildMediaCreateInput({
      type: 'video',
      url: 'https://cdn/vid.mp4',
      standardUrl: 'https://cdn/vid.m3u8',
      thumbnailUrl: 'https://cdn/thumb.jpg',
    });
    expect(result.status).toBe('READY');
    expect(result.kind).toBe('VIDEO');
  });

  it('treats an unrecognized or missing type as IMAGE', () => {
    expect(buildMediaCreateInput({ type: '', url: 'x' }).kind).toBe('IMAGE');
    expect(buildMediaCreateInput({ type: 'AUDIO', url: 'x' }).kind).toBe(
      'IMAGE',
    );
  });
});

describe('resolveMediaFields', () => {
  it('prefers the linked Media row fields over the inline columns', () => {
    const result = resolveMediaFields({
      url: 'inline-url',
      standardUrl: 'inline-standard',
      thumbnailUrl: 'inline-thumb',
      media: {
        url: 'media-url',
        standardUrl: 'media-standard',
        thumbnailUrl: 'media-thumb',
        status: 'PROCESSING',
      },
    });
    expect(result).toEqual({
      url: 'media-url',
      standardUrl: 'media-standard',
      thumbnailUrl: 'media-thumb',
      status: 'PROCESSING',
    });
  });

  it('falls back to inline columns when there is no linked Media row', () => {
    const result = resolveMediaFields({
      url: 'inline-url',
      standardUrl: 'inline-standard',
      thumbnailUrl: null,
      media: null,
    });
    expect(result).toEqual({
      url: 'inline-url',
      standardUrl: 'inline-standard',
      thumbnailUrl: null,
      status: 'READY',
    });
  });

  it('falls back to inline columns when media is undefined (pre-migration rows)', () => {
    const result = resolveMediaFields({
      url: 'inline-url',
    });
    expect(result).toEqual({
      url: 'inline-url',
      standardUrl: null,
      thumbnailUrl: null,
      status: 'READY',
    });
  });

  it('drops the nested media object from the output and preserves other fields', () => {
    const result = resolveMediaFields({
      id: 'post-media-1',
      url: 'inline-url',
      order: 2,
      media: {
        url: 'x',
        standardUrl: null,
        thumbnailUrl: null,
        status: 'READY',
      },
    });
    expect(result).not.toHaveProperty('media');
    expect(result.id).toBe('post-media-1');
    expect(result.order).toBe(2);
  });
});

describe('buildVoiceMediaCreateInput', () => {
  it('is always AUDIO/READY with no variants', () => {
    expect(buildVoiceMediaCreateInput('https://cdn/voice.m4a')).toEqual({
      kind: 'AUDIO',
      status: 'READY',
      url: 'https://cdn/voice.m4a',
      standardUrl: null,
      thumbnailUrl: null,
    });
  });
});
