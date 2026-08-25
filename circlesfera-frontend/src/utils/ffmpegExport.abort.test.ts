import { describe, expect, it, vi } from 'vitest';
import { StudioExportError } from './studioExportHelpers';

describe('exportStudioProject abort', () => {
  it('throws cancelled when signal already aborted before start', async () => {
    vi.resetModules();
    vi.doMock('@ffmpeg/ffmpeg', () => ({
      FFmpeg: class {
        on() {}
        terminate = vi.fn();
        load = vi.fn();
        writeFile = vi.fn();
        exec = vi.fn();
        readFile = vi.fn();
      },
    }));
    vi.doMock('@ffmpeg/util', () => ({
      fetchFile: vi.fn(),
      toBlobURL: vi.fn(async () => 'blob:mock'),
    }));

    const { exportStudioProject } = await import('./ffmpegExport');
    const controller = new AbortController();
    controller.abort();

    const project = {
      id: 'p',
      name: 't',
      duration: 2,
      fps: 30,
      aspectRatio: '9:16' as const,
      resolution: { width: 1080, height: 1920 },
      tracks: [
        {
          id: 'v1',
          type: 'video' as const,
          name: 'V',
          muted: false,
          hidden: false,
          locked: false,
          clips: [
            {
              id: 'c1',
              trackId: 'v1',
              type: 'image' as const,
              file: null,
              fileUrl: 'https://cdn.example.com/a.png',
              startAt: 0,
              duration: 2,
              mediaStart: 0,
              speed: 1,
              volume: 1,
              muted: true,
              transform: { scale: 1, rotation: 0, x: 0, y: 0 },
            },
          ],
        },
      ],
    };

    await expect(
      exportStudioProject(project as any, { signal: controller.signal }),
    ).rejects.toMatchObject({
      code: 'studio.export_errors.cancelled',
    } satisfies Partial<StudioExportError>);
  });
});
