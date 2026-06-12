import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface ContentModerationResult {
  flagged: boolean;
  categories: Record<string, boolean>;
  category_scores: Record<string, number>;
}

/**
 * Service for AI-powered features using OpenAI embeddings.
 * Falls back to mock embeddings in development when OPENAI_API_KEY is absent.
 */
@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);
  private openai: OpenAI | null = null;

  constructor(@Inject(ConfigService) private configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    } else {
      this.logger.warn(
        'OPENAI_API_KEY not found. AIService will operate in MOCK mode.',
      );
    }
  }

  /**
   * Generate a 1536-dimension embedding vector for the given text.
   * Uses OpenAI text-embedding-3-small in production; returns mock data otherwise.
   * @param text - The input text to embed
   * @returns A 1536-element float array
   * @throws Error if API key is missing in production
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const isProd = this.configService.get<string>('NODE_ENV') === 'production';

    if (!this.openai) {
      if (!isProd) {
        this.logger.warn('Mocking embedding (no OpenAI client)');
        return this.getMockEmbedding();
      }
      throw new Error(
        'AI Service unavailable: OPENAI_API_KEY is missing in production.',
      );
    }

    this.logger.log(
      `Generating embedding for text: ${text.substring(0, 50)}...`,
    );

    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
        encoding_format: 'float',
      });

      return response.data[0].embedding;
    } catch (error) {
      this.logger.error('Failed to generate embedding with OpenAI', error);
      if (!isProd) {
        this.logger.warn('Falling back to mock embedding due to error');
        return this.getMockEmbedding();
      }
      throw error;
    }
  }

  /** Generate a random 1536-dimension mock embedding for development use. */
  private getMockEmbedding(): number[] {
    return Array.from({ length: 1536 }, () => (Math.random() * 2 - 1) * 0.1);
  }

  /**
   * Moderate content using OpenAI's Moderation API.
   * Supports multi-modal moderation (text + images).
   * @param text - The input text to moderate
   * @param mediaUrls - Optional array of image URLs to moderate
   */
  async moderateContent(
    text: string,
    mediaUrls: string[] = [],
  ): Promise<ContentModerationResult> {
    const isProd = this.configService.get<string>('NODE_ENV') === 'production';

    if (!this.openai) {
      if (!isProd) {
        this.logger.warn('Mocking moderation (no OpenAI client)');
        return { flagged: false, categories: {}, category_scores: {} };
      }
      throw new Error(
        'AI Service unavailable: OPENAI_API_KEY is missing in production.',
      );
    }

    try {
      const input: any[] = [];
      if (text) {
        input.push({ type: 'text', text });
      }

      for (const url of mediaUrls) {
        // Only attempt to moderate if it looks like a public URL or base64
        if (url.startsWith('http') || url.startsWith('data:image')) {
          input.push({
            type: 'image_url',
            image_url: { url },
          });
        }
      }

      // If no valid input, return safe
      if (input.length === 0) {
        return { flagged: false, categories: {}, category_scores: {} };
      }

      const response = await this.openai.moderations.create({
        model: 'omni-moderation-latest',
        input,
      });

      const result = response.results[0];
      return {
        flagged: result.flagged,
        categories: result.categories as unknown as Record<string, boolean>,
        category_scores: result.category_scores as unknown as Record<
          string,
          number
        >,
      };
    } catch (error) {
      this.logger.error('Failed to moderate content with OpenAI', error);
      if (!isProd) {
        return { flagged: false, categories: {}, category_scores: {} };
      }
      throw error;
    }
  }

  /**
   * Compute cosine similarity between two vectors (pure TypeScript fallback for pgvector).
   * @param vecA - First embedding vector
   * @param vecB - Second embedding vector
   * @returns Similarity score between -1 and 1
   */
  calculateSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Generate an accessibility description (alt-text) for an image.
   * @param imageUrl - The public URL of the image
   */
  async generateAltText(imageUrl: string): Promise<string> {
    const isProd = this.configService.get<string>('NODE_ENV') === 'production';

    if (!this.openai) {
      if (!isProd) {
        this.logger.warn('Mocking alt-text (no OpenAI client)');
        return `A beautiful high-quality image from CircleSfera (Ref: ${imageUrl.split('/').pop()})`;
      }
      throw new Error('AI Service unavailable.');
    }

    try {
      this.logger.log(`Generating AI alt-text for: ${imageUrl}`);

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Describe this image for accessibility (alt-text). Be concise, neutral, and descriptive. Do not use phrases like "image of" or "picture of". Max 125 characters.',
              },
              { type: 'image_url', image_url: { url: imageUrl } },
            ],
          },
        ],
        max_tokens: 100,
      });

      return (
        response.choices[0].message.content || 'An image shared on CircleSfera.'
      );
    } catch (error) {
      this.logger.error('Failed to generate alt-text', error);
      return 'An image shared on CircleSfera.';
    }
  }
}
