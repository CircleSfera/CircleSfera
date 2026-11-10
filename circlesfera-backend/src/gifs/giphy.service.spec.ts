import { GIF_PAGE_SIZE } from '@circlesfera/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GiphyService, toGif } from './giphy.service.js';

const axiosGet = vi.hoisted(() => vi.fn());
vi.mock('axios', () => ({ default: { get: axiosGet } }));

const item = (over: Record<string, unknown> = {}) => ({
  id: 'abc123',
  title: 'Party',
  images: {
    fixed_height: {
      url: 'https://media2.giphy.com/media/abc123/200.gif',
      webp: 'https://media2.giphy.com/media/abc123/200.webp',
      width: '267',
      height: '200',
    },
  },
  ...over,
});

describe('toGif', () => {
  it('keeps the id, title, the webp image and its size', () => {
    expect(toGif(item())).toEqual({
      id: 'abc123',
      title: 'Party',
      url: 'https://media2.giphy.com/media/abc123/200.webp',
      width: 267,
      height: 200,
    });
  });

  it('leaves out an image that is not https on a GIPHY host, or has no size', () => {
    const at = (url: string) =>
      item({ images: { fixed_height: { url, width: '1', height: '1' } } });
    expect(toGif(at('http://media.giphy.com/a.gif'))).toBeNull();
    expect(toGif(at('https://giphy.com.evil.example/a.gif'))).toBeNull();
    expect(toGif(at('not an address'))).toBeNull();
    expect(
      toGif(
        item({ images: { fixed_height: { url: 'https://giphy.com/a.gif' } } }),
      ),
    ).toBeNull();
    expect(toGif(item({ id: '../x' }))).toBeNull();
    expect(toGif(item({ images: undefined }))).toBeNull();
  });

  it('uses the gif image when there is no webp, and an empty title when none', () => {
    const gif = toGif(
      item({
        title: undefined,
        images: {
          fixed_height: {
            url: 'https://giphy.com/a.gif',
            width: '10',
            height: '10',
          },
        },
      }),
    );
    expect(gif).toMatchObject({ url: 'https://giphy.com/a.gif', title: '' });
  });
});

describe('GiphyService', () => {
  const config = { get: vi.fn() };
  let service: GiphyService;

  beforeEach(() => {
    vi.clearAllMocks();
    config.get.mockReturnValue('the-key');
    service = new GiphyService(config as never);
  });

  it('searches at the app rating and page size, with the key on the server', async () => {
    axiosGet.mockResolvedValue({ data: { data: [item(), { id: 'bad' }] } });

    const gifs = await service.search('cats', 24, 'es');

    expect(axiosGet).toHaveBeenCalledWith(
      'https://api.giphy.com/v1/gifs/search',
      expect.objectContaining({
        params: {
          q: 'cats',
          offset: 24,
          lang: 'es',
          api_key: 'the-key',
          rating: 'pg-13',
          limit: GIF_PAGE_SIZE,
        },
      }),
    );
    expect(gifs.map((gif) => gif.id)).toEqual(['abc123']);
  });

  it('lists trending GIFs, and nothing when GIPHY answers no list', async () => {
    axiosGet.mockResolvedValueOnce({ data: { data: [item()] } });
    await expect(service.trending(0)).resolves.toHaveLength(1);
    expect(axiosGet.mock.calls[0][0]).toBe(
      'https://api.giphy.com/v1/gifs/trending',
    );

    axiosGet.mockResolvedValueOnce({ data: {} });
    await expect(service.trending(0)).resolves.toEqual([]);
  });

  it('finds one GIF by its id at the app rating', async () => {
    axiosGet.mockResolvedValue({ data: { data: item() } });

    await expect(service.byId('abc123')).resolves.toMatchObject({
      id: 'abc123',
    });
    expect(axiosGet).toHaveBeenCalledWith(
      'https://api.giphy.com/v1/gifs/abc123',
      expect.objectContaining({
        params: { api_key: 'the-key', rating: 'pg-13' },
      }),
    );
  });

  it('answers no GIF when GIPHY fails, does not know it, or the id is not one', async () => {
    axiosGet.mockRejectedValueOnce(new Error('timeout'));
    await expect(service.byId('abc123')).resolves.toBeNull();

    axiosGet.mockResolvedValueOnce({ data: {} });
    await expect(service.byId('abc123')).resolves.toBeNull();

    await expect(service.byId('../../x')).resolves.toBeNull();
    expect(axiosGet).toHaveBeenCalledTimes(2);
  });

  it('offers nothing and asks GIPHY nothing without a key', async () => {
    config.get.mockReturnValue('');

    expect(service.available()).toBe(false);
    await expect(service.search('cats', 0, 'en')).resolves.toEqual([]);
    await expect(service.trending(0)).resolves.toEqual([]);
    await expect(service.byId('abc123')).resolves.toBeNull();
    expect(axiosGet).not.toHaveBeenCalled();
  });
});
