import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  platform: 'ios',
  exportItem: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => native.platform,
    convertFileSrc: (path: string) =>
      `capacitor://localhost/_capacitor_file_${path}`,
  },
  registerPlugin: () => ({ exportItem: native.exportItem }),
}));

import { hasDeviceGallery, readGalleryFile } from './photoLibrary';

describe('photoLibrary', () => {
  beforeEach(() => {
    native.platform = 'ios';
    native.exportItem.mockResolvedValue({
      path: '/cache/composer-gallery/a.mov',
      name: 'video-a.mov',
      mimeType: 'video/quicktime',
    });
  });

  it('shows the gallery in the iOS app only', () => {
    expect(hasDeviceGallery()).toBe(true);
    native.platform = 'android';
    expect(hasDeviceGallery()).toBe(false);
    native.platform = 'web';
    expect(hasDeviceGallery()).toBe(false);
  });

  it('reads an item as a file with its name and type, whatever status the address answers with', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 0,
      blob: async () => new Blob(['movie']),
    });
    vi.stubGlobal('fetch', fetchMock);

    const file = await readGalleryFile('id-1');

    expect(native.exportItem).toHaveBeenCalledWith({ id: 'id-1' });
    expect(fetchMock).toHaveBeenCalledWith(
      'capacitor://localhost/_capacitor_file_/cache/composer-gallery/a.mov',
    );
    expect(file.name).toBe('video-a.mov');
    expect(file.type).toBe('video/quicktime');
    expect(file.size).toBe(5);
  });

  it('fails when nothing comes back', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ blob: async () => new Blob([]) }),
    );

    await expect(readGalleryFile('id-1')).rejects.toThrow();
  });
});
