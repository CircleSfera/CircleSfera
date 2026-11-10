import { ErrorCode, GIF_PAGE_SIZE } from '@circlesfera/shared';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AppException } from '../common/errors/app.exception.js';

// A GIF as CircleSfera keeps and shows it: GIPHY's id, its title, and the
// address and size of the image the app draws. Never a file of CircleSfera's
// storage.
export type Gif = {
  id: string;
  title: string;
  url: string;
  width: number;
  height: number;
};

const GIPHY_API = 'https://api.giphy.com/v1/gifs';
// The most a GIF may show: the app is for people aged 16 and over.
const GIPHY_RATING = 'pg-13';
const GIPHY_TIMEOUT_MS = 5_000;
const GIPHY_ID = /^[A-Za-z0-9]{1,64}$/;
// The ratings shown: GIPHY's lookup by id ignores the rating asked, so each
// GIF's own rating is checked too.
const SHOWN_RATINGS = new Set(['g', 'pg', 'pg-13']);
// Trending changes slowly: one answer per page is kept this long, so opening
// the picker does not spend GIPHY's quota each time.
const TRENDING_TTL_MS = 10 * 60 * 1000;

type GiphyImage = {
  url?: string;
  webp?: string;
  width?: string;
  height?: string;
};
type GiphyItem = {
  id?: string;
  title?: string;
  rating?: string;
  images?: { fixed_height?: GiphyImage };
};

// Only an https image on GIPHY's own hosts is drawn: nothing GIPHY answers
// can make the app load an address of someone else.
function isGiphyImage(address: string | undefined): address is string {
  if (!address) return false;
  try {
    const url = new URL(address);
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'giphy.com' || url.hostname.endsWith('.giphy.com'))
    );
  } catch {
    return false;
  }
}

export function toGif(item: GiphyItem): Gif | null {
  const image = item.images?.fixed_height;
  const url = image?.webp ?? image?.url;
  const width = Number(image?.width);
  const height = Number(image?.height);
  if (
    !item.id ||
    !GIPHY_ID.test(item.id) ||
    !SHOWN_RATINGS.has(item.rating ?? '') ||
    !isGiphyImage(url) ||
    !(width > 0) ||
    !(height > 0)
  ) {
    return null;
  }
  return { id: item.id, title: item.title ?? '', url, width, height };
}

// GIPHY, asked only by the server: its key never reaches the app, and the
// server fixes the rating. Without a key there are no GIFs, and nothing else
// changes.
@Injectable()
export class GiphyService {
  private readonly logger = new Logger(GiphyService.name);
  private readonly trendingCache = new Map<
    number,
    { at: number; gifs: Gif[] }
  >();

  constructor(private readonly config: ConfigService) {}

  private get key(): string | undefined {
    return this.config.get<string>('GIPHY_API_KEY') || undefined;
  }

  available(): boolean {
    return Boolean(this.key);
  }

  async search(query: string, offset: number, lang: string): Promise<Gif[]> {
    return this.list('search', { q: query, offset, lang });
  }

  async trending(offset: number): Promise<Gif[]> {
    const kept = this.trendingCache.get(offset);
    if (kept && Date.now() - kept.at < TRENDING_TTL_MS) return kept.gifs;
    const gifs = await this.list('trending', { offset });
    this.trendingCache.set(offset, { at: Date.now(), gifs });
    return gifs;
  }

  // One GIF by its id, as GIPHY describes it now; null when GIPHY does not
  // know it, or does not show it at this rating.
  async byId(id: string): Promise<Gif | null> {
    const key = this.key;
    if (!key || !GIPHY_ID.test(id)) return null;
    try {
      const { data } = await axios.get(`${GIPHY_API}/${id}`, {
        params: { api_key: key, rating: GIPHY_RATING },
        timeout: GIPHY_TIMEOUT_MS,
      });
      return data?.data ? toGif(data.data) : null;
    } catch (error) {
      this.logger.warn(`GIPHY did not answer for one GIF: ${String(error)}`);
      return null;
    }
  }

  private async list(
    kind: 'search' | 'trending',
    params: Record<string, string | number>,
  ): Promise<Gif[]> {
    const key = this.key;
    if (!key) return [];
    let data: { data?: unknown } | undefined;
    try {
      ({ data } = await axios.get(`${GIPHY_API}/${kind}`, {
        params: {
          ...params,
          api_key: key,
          rating: GIPHY_RATING,
          limit: GIF_PAGE_SIZE,
        },
        timeout: GIPHY_TIMEOUT_MS,
      }));
    } catch (error) {
      // GIPHY down, slow or out of quota: the picker says GIFs are not
      // available now, as without a key.
      this.logger.warn(`GIPHY did not answer a ${kind}: ${String(error)}`);
      throw AppException.NotFound(
        ErrorCode.GIFS_UNAVAILABLE,
        'GIFs are not available',
      );
    }
    const items: GiphyItem[] = Array.isArray(data?.data) ? data.data : [];
    return items.map(toGif).filter((gif): gif is Gif => gif !== null);
  }
}
