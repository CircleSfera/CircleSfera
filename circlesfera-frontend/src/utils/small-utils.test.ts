import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isNative: true,
  getPhoto: vi.fn(),
  load: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => mocks.isNative },
}));
vi.mock('@capacitor/camera', () => ({
  Camera: { getPhoto: mocks.getPhoto },
  CameraResultType: { Uri: 'uri' },
  CameraSource: { Prompt: 'PROMPT' },
}));
vi.mock('@fingerprintjs/fingerprintjs', () => ({
  default: { load: mocks.load },
}));

import { createMediaProcessorWorker } from './mediaWorker';
import { pickNativeImage } from './nativeFilePicker';
import { parseFilter } from './styleUtils';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isNative = true;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('parseFilter', () => {
  it('gives nothing for a picture with no filter', () => {
    expect(parseFilter()).toEqual({ className: '', style: {} });
    expect(parseFilter('')).toEqual({ className: '', style: {} });
  });

  it('reads a filter kept as a class name', () => {
    expect(parseFilter('filter-clarendon')).toEqual({
      className: 'filter-clarendon',
      style: {},
    });
  });

  it('reads a filter kept with its adjustments', () => {
    expect(
      parseFilter(
        'filter-class:filter-juno__style:brightness(1.1) contrast(0.9)',
      ),
    ).toEqual({
      className: 'filter-juno',
      style: { filter: 'brightness(1.1) contrast(0.9)' },
    });
  });

  it('reads adjustments kept with no named filter', () => {
    expect(parseFilter('filter-class:__style:saturate(1.4)')).toEqual({
      className: '',
      style: { filter: 'saturate(1.4)' },
    });
  });
});

describe('pickNativeImage', () => {
  /** A file field that takes any list of files, with its change event watched. */
  function field() {
    const input = document.createElement('input');
    input.type = 'file';
    let files: unknown = null;
    Object.defineProperty(input, 'files', {
      get: () => files,
      set: (value) => {
        files = value;
      },
    });
    const changed = vi.fn();
    input.addEventListener('change', changed);
    return { ref: { current: input }, input, changed };
  }

  beforeEach(() => {
    vi.stubGlobal(
      'DataTransfer',
      class {
        files: File[] = [];
        items = { add: (file: File) => this.files.push(file) };
      },
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ blob: async () => new Blob(['img']) }),
    );
  });

  it('leaves it to the browser when the app is not native', async () => {
    mocks.isNative = false;
    const { ref, changed } = field();

    await expect(pickNativeImage(ref)).resolves.toBe(false);
    expect(mocks.getPhoto).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });

  it('puts the photo of the device in the file field, as if it had been chosen there', async () => {
    mocks.getPhoto.mockResolvedValue({
      webPath: 'capacitor://photo/1',
      format: 'png',
    });
    const { ref, input, changed } = field();

    await expect(pickNativeImage(ref)).resolves.toBe(true);

    expect(mocks.getPhoto).toHaveBeenCalledWith({
      resultType: 'uri',
      source: 'PROMPT',
      quality: 90,
      allowEditing: false,
    });
    expect(fetch).toHaveBeenCalledWith('capacitor://photo/1');
    const [file] = input.files as unknown as File[];
    expect(file.type).toBe('image/png');
    expect(file.name).toMatch(/^image_\d+\.png$/);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('counts as handled, with no file, when the person cancels', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.getPhoto.mockRejectedValue(new Error('User cancelled photos app'));
    const { ref, changed } = field();

    await expect(pickNativeImage(ref)).resolves.toBe(true);
    expect(changed).not.toHaveBeenCalled();
  });

  it.each([
    ['the device gives no address for the photo', { format: 'jpeg' }, true],
    [
      'the file field is gone',
      { webPath: 'capacitor://photo/1', format: 'jpeg' },
      false,
    ],
  ])('puts in nothing when %s', async (_why, photo, hasField) => {
    mocks.getPhoto.mockResolvedValue(photo);
    const { ref, changed } = field();

    await expect(
      pickNativeImage(hasField ? ref : { current: null }),
    ).resolves.toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });
});

describe('getVisitorId', () => {
  // The id is kept for the life of the page, so each case loads the module anew.
  const fresh = async () => {
    vi.resetModules();
    return (await import('./visitorId')).getVisitorId;
  };

  it('works the id out once and keeps it', async () => {
    const get = vi.fn().mockResolvedValue({ visitorId: 'visitor-1' });
    mocks.load.mockResolvedValue({ get });
    const getVisitorId = await fresh();

    await expect(getVisitorId()).resolves.toBe('visitor-1');
    await expect(getVisitorId()).resolves.toBe('visitor-1');

    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('shares one calculation between calls made at the same time', async () => {
    mocks.load.mockResolvedValue({
      get: vi.fn().mockResolvedValue({ visitorId: 'visitor-2' }),
    });
    const getVisitorId = await fresh();

    const both = await Promise.all([getVisitorId(), getVisitorId()]);

    expect(both).toEqual(['visitor-2', 'visitor-2']);
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });

  it('gives nothing when it cannot be worked out, and tries again the next time', async () => {
    mocks.load.mockRejectedValueOnce(new Error('blocked'));
    const getVisitorId = await fresh();

    await expect(getVisitorId()).resolves.toBeNull();

    mocks.load.mockResolvedValue({
      get: vi.fn().mockResolvedValue({ visitorId: 'visitor-3' }),
    });
    await expect(getVisitorId()).resolves.toBe('visitor-3');
  });
});

describe('createMediaProcessorWorker', () => {
  const inBrowser = () =>
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0');

  it('makes no worker in the test environment', () => {
    expect(createMediaProcessorWorker()).toBeNull();
  });

  it('makes no worker where the browser has none', () => {
    inBrowser();
    vi.stubGlobal('Worker', undefined);
    expect(createMediaProcessorWorker()).toBeNull();
  });

  it('starts the media worker as a module in a browser', () => {
    inBrowser();
    const made: unknown[][] = [];
    vi.stubGlobal(
      'Worker',
      class {
        constructor(...args: unknown[]) {
          made.push(args);
        }
      },
    );

    expect(createMediaProcessorWorker()).not.toBeNull();
    expect(String(made[0][0])).toContain('mediaProcessor.worker');
    expect(made[0][1]).toEqual({ type: 'module' });
  });

  it('goes without a worker when the browser refuses to start it', () => {
    inBrowser();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new Error('blocked by policy');
        }
      },
    );

    expect(createMediaProcessorWorker()).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });
});
