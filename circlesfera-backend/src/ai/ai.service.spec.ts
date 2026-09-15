import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import OpenAI from 'openai';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';
import { safeFetchMedia } from '../common/utils/safe-media-fetcher.js';
import { SsrfBlockedError } from '../common/utils/ssrf.util.js';
import { AIService } from './ai.service.js';

const mOpenAI = {
  embeddings: {
    create: vi.fn(),
  },
  moderations: {
    create: vi.fn(),
  },
  audio: {
    transcriptions: {
      create: vi.fn(),
    },
  },
};

vi.mock('../common/utils/safe-media-fetcher.js', () => ({
  safeFetchMedia: vi.fn(),
}));

vi.mock('openai', () => {
  return {
    default: class OpenAI {
      embeddings = mOpenAI.embeddings;
      moderations = mOpenAI.moderations;
      audio = mOpenAI.audio;
    },
    toFile: vi.fn().mockImplementation(async (buffer, filename, opts) => ({
      buffer,
      filename,
      ...opts,
    })),
  };
});

describe('AIService', () => {
  let service: AIService;
  let mockConfigService: { get: Mock };
  let openAiInstance: {
    embeddings: { create: Mock };
    moderations: { create: Mock };
  };

  beforeEach(async () => {
    mockConfigService = {
      get: vi.fn(),
    };

    // By default, supply an API key so openai instantiates
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'OPENAI_API_KEY') return 'test_key';
      if (key === 'NODE_ENV') return 'production';
      return null;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AIService>(AIService);

    // Grab the mock instance created by the constructor
    openAiInstance = new OpenAI({ apiKey: 'dummy' }) as unknown as {
      embeddings: { create: Mock };
      moderations: { create: Mock };
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Instantiation', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should work without api key if not in production', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'OPENAI_API_KEY') return undefined; // No key
        if (key === 'NODE_ENV') return 'development';
        return null;
      });
      // Re-instantiate service without api key
      const module = await Test.createTestingModule({
        providers: [
          AIService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();
      const devService = module.get<AIService>(AIService);
      expect(devService).toBeDefined();
    });
  });

  describe('generateEmbedding', () => {
    it('should generate an embedding vector using OpenAI', async () => {
      openAiInstance.embeddings.create.mockResolvedValue({
        data: [{ embedding: [0.1, 0.2, 0.3] }],
      });

      const result = await service.generateEmbedding('test text');
      expect(openAiInstance.embeddings.create).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'test text',
        encoding_format: 'float',
      });
      expect(result).toEqual([0.1, 0.2, 0.3]);
    });

    it('should fail-fast in production if API key is missing', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'OPENAI_API_KEY') return undefined;
        if (key === 'NODE_ENV') return 'production';
        return null;
      });

      await expect(
        Test.createTestingModule({
          providers: [
            AIService,
            { provide: ConfigService, useValue: mockConfigService },
          ],
        }).compile(),
      ).rejects.toThrow(/OPENAI_API_KEY is required in production/);
    });

    it('should throw error if OpenAI errors', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'OPENAI_API_KEY') return 'test_key';
        if (key === 'NODE_ENV') return 'production';
        return null;
      });

      // Openai client exists, but throws error
      openAiInstance.embeddings.create.mockRejectedValue(new Error('API Down'));
      const module = await Test.createTestingModule({
        providers: [
          AIService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();
      const updatedService = module.get<AIService>(AIService);

      await expect(updatedService.generateEmbedding('hello')).rejects.toThrow(
        'API Down',
      );
    });
  });

  describe('moderateContent', () => {
    it('should return moderation flags from OpenAI', async () => {
      openAiInstance.moderations.create.mockResolvedValue({
        results: [
          {
            flagged: true,
            categories: { hate: true, violence: false },
            category_scores: { hate: 0.99, violence: 0.01 },
          },
        ],
      });

      const result = await service.moderateContent('some bad text');
      expect(openAiInstance.moderations.create).toHaveBeenCalledWith({
        input: [{ text: 'some bad text', type: 'text' }],
        model: 'omni-moderation-latest',
      });
      expect(result.flagged).toBe(true);
      expect(result.categories.hate).toBe(true);
      expect(result.category_scores.hate).toBe(0.99);
    });

    it('should throw error if OpenAI errors', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'OPENAI_API_KEY') return 'test_key';
        if (key === 'NODE_ENV') return 'production';
        return null;
      });

      openAiInstance.moderations.create.mockRejectedValue(
        new Error('API Down'),
      );

      const module = await Test.createTestingModule({
        providers: [
          AIService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();
      const devService = module.get<AIService>(AIService);

      await expect(devService.moderateContent('some bad text')).rejects.toThrow(
        'API Down',
      );
    });

    it('should fail-fast constructing AIService in production without key', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'OPENAI_API_KEY') return undefined;
        if (key === 'NODE_ENV') return 'production';
        return null;
      });
      await expect(
        Test.createTestingModule({
          providers: [
            AIService,
            { provide: ConfigService, useValue: mockConfigService },
          ],
        }).compile(),
      ).rejects.toThrow(/OPENAI_API_KEY is required in production/);
    });
    it('filters out private/loopback URLs from moderation to prevent SSRF', async () => {
      openAiInstance.moderations.create.mockResolvedValue({
        results: [
          {
            flagged: false,
            categories: {},
            category_scores: {},
          },
        ],
      });

      await service.moderateContent('hello', [
        'http://127.0.0.1/internal.png',
        'http://169.254.169.254/meta.jpg',
        'http://10.0.0.1/private.png',
        'https://cdn.example.com/public.jpg',
      ]);

      expect(openAiInstance.moderations.create).toHaveBeenCalledWith({
        input: [
          { text: 'hello', type: 'text' },
          {
            type: 'image_url',
            image_url: { url: 'https://cdn.example.com/public.jpg' },
          },
        ],
        model: 'omni-moderation-latest',
      });
    });
  });

  describe('transcribeAudio', () => {
    it('safely fetches media and creates Whisper transcription', async () => {
      const mockBuffer = Buffer.from('audio-data');
      (safeFetchMedia as Mock).mockResolvedValue({
        buffer: mockBuffer,
        contentType: 'audio/wav',
        ext: 'wav',
      });

      mOpenAI.audio.transcriptions.create.mockResolvedValue({
        segments: [
          { start: 0, end: 2.5, text: ' Hello world' },
          { start: 2.5, end: 5.0, text: ' CircleSfera' },
        ],
      });

      const result = await service.transcribeAudio(
        'https://cdn.example.com/clip.wav',
      );

      expect(safeFetchMedia).toHaveBeenCalledWith(
        'https://cdn.example.com/clip.wav',
        expect.objectContaining({
          maxBytes: 25 * 1024 * 1024,
          timeoutMs: 15_000,
        }),
      );

      expect(mOpenAI.audio.transcriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'whisper-1',
          response_format: 'verbose_json',
        }),
      );

      expect(result).toEqual([
        { start: 0, end: 2.5, text: 'Hello world' },
        { start: 2.5, end: 5.0, text: 'CircleSfera' },
      ]);
    });

    it('propagates error when safeFetchMedia rejects with SSRF error', async () => {
      (safeFetchMedia as Mock).mockRejectedValue(
        new SsrfBlockedError('Target IP is private', 'PRIVATE_IP'),
      );

      await expect(
        service.transcribeAudio('http://169.254.169.254/meta'),
      ).rejects.toThrow(SsrfBlockedError);
    });

    it('throws AI_SERVICE_UNAVAILABLE if OpenAI is not configured', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'OPENAI_API_KEY') return undefined;
        if (key === 'NODE_ENV') return 'development';
        return null;
      });

      const module = await Test.createTestingModule({
        providers: [
          AIService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const unconfiguredService = module.get<AIService>(AIService);
      await expect(
        unconfiguredService.transcribeAudio('https://example.com/audio.mp3'),
      ).rejects.toThrow('AI_SERVICE_UNAVAILABLE');
    });
  });

  describe('calculateSimilarity', () => {
    it('should calculate cosine similarity between two vectors', () => {
      const vecA = [1, 0, 0];
      const vecB = [1, 0, 0];
      expect(service.calculateSimilarity(vecA, vecB)).toBe(1);

      const vecC = [0, 1, 0];
      expect(service.calculateSimilarity(vecA, vecC)).toBe(0);

      const vecD = [-1, 0, 0];
      expect(service.calculateSimilarity(vecA, vecD)).toBe(-1);
    });
  });
});
