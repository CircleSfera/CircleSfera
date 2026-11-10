import { GIF_PAGE_SIZE } from '@circlesfera/shared';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

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

type GiphyImage = {
  url?: string;
  webp?: string;
  width?: string;
  height?: string;
};
type GiphyItem = {
  id?: string;
  title?: string;
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
    return this.list('trending', { offset });
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
    const { data } = await axios.get(`${GIPHY_API}/${kind}`, {
      params: {
        ...params,
        api_key: key,
        rating: GIPHY_RATING,
        limit: GIF_PAGE_SIZE,
      },
      timeout: GIPHY_TIMEOUT_MS,
    });
    const items: GiphyItem[] = Array.isArray(data?.data) ? data.data : [];
    return items.map(toGif).filter((gif): gif is Gif => gif !== null);
  }
}
