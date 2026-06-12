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
import { AIService } from './ai.service.js';

const mOpenAI = {
  embeddings: {
    create: vi.fn(),
  },
  moderations: {
    create: vi.fn(),
  },
};

vi.mock('openai', () => {
  return {
    default: class OpenAI {
      embeddings = mOpenAI.embeddings;
      moderations = mOpenAI.moderations;
    },
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

    it('should throw an error in production if API key is missing', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'OPENAI_API_KEY') return undefined;
        if (key === 'NODE_ENV') return 'production';
        return null;
      });

      const module = await Test.createTestingModule({
        providers: [
          AIService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();
      const prodServiceWithoutKey = module.get<AIService>(AIService);

      await expect(
        prodServiceWithoutKey.generateEmbedding('test text'),
      ).rejects.toThrow('OPENAI_API_KEY is missing');
    });

    it('should fallback to mock embedding in development if missing key', async () => {
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
      const devServiceWithoutKey = module.get<AIService>(AIService);

      const result = await devServiceWithoutKey.generateEmbedding('test');
      expect(result).toHaveLength(1536);
      expect(typeof result[0]).toBe('number');
    });

    it('should fallback to mock embedding in development if OpenAI errors', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'OPENAI_API_KEY') return 'test_key';
        if (key === 'NODE_ENV') return 'development';
        return null;
      });

      // openai client exists, but throws error
      openAiInstance.embeddings.create.mockRejectedValue(new Error('API Down'));
      const module = await Test.createTestingModule({
        providers: [
          AIService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();
      const updatedService = module.get<AIService>(AIService);

      const result = await updatedService.generateEmbedding('test');
      expect(result).toHaveLength(1536);
    });

    it('should throw error in production if OpenAI errors', async () => {
      openAiInstance.embeddings.create.mockRejectedValue(new Error('API Down'));
      await expect(service.generateEmbedding('test')).rejects.toThrow(
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

    it('should fallback to empty moderation in development if OpenAI errors', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'OPENAI_API_KEY') return 'test_key';
        if (key === 'NODE_ENV') return 'development';
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

      const result = await devService.moderateContent('some bad text');
      expect(result.flagged).toBe(false);
      expect(result.categories).toEqual({});
    });

    it('should fallback to empty moderation in dev if missing key', async () => {
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
      const devServiceWithoutKey = module.get<AIService>(AIService);

      const result = await devServiceWithoutKey.moderateContent('test');
      expect(result.flagged).toBe(false);
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
