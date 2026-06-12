import { Test, type TestingModule } from '@nestjs/testing';
import sharp from 'sharp';
import { type Mock, vi } from 'vitest';
import type { UploadedFile } from './interfaces/uploaded-file.interface.js';
import { MediaProcessorService } from './media-processor.service.js';

// Mock Sharp
vi.mock('sharp', () => {
  const sharpMock = {
    resize: vi.fn().mockReturnThis(),
    rotate: vi.fn().mockReturnThis(),
    avif: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('processed-data')),
  };
  return {
    default: vi.fn(() => sharpMock),
  };
});

describe('MediaProcessorService', () => {
  let service: MediaProcessorService;
  const mockSharp = sharp as unknown as Mock;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MediaProcessorService],
    }).compile();

    service = module.get<MediaProcessorService>(MediaProcessorService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should skip non-image files', async () => {
    const file: UploadedFile = {
      originalname: 'test.txt',
      mimetype: 'text/plain',
      buffer: Buffer.from('hello'),
    };

    const result = await service.process(file);
    expect(result.original.mimetype).toBe('text/plain');
    expect(result.original.buffer).toEqual(file.buffer);
    expect(result.standard.buffer).toEqual(file.buffer);
    expect(result.thumbnail.buffer).toEqual(file.buffer);
    expect(mockSharp).not.toHaveBeenCalled();
  });

  it('should process images to AVIF by default for all variants', async () => {
    const file: UploadedFile = {
      originalname: 'test.png',
      mimetype: 'image/png',
      buffer: Buffer.from('fake-png'),
    };

    const result = await service.process(file);

    expect(mockSharp).toHaveBeenCalled();
    expect(result.original.mimetype).toBe('image/avif');
    expect(result.standard.mimetype).toBe('image/avif');
    expect(result.thumbnail.mimetype).toBe('image/avif');

    expect(result.original.buffer.toString()).toBe('processed-data');
  });

  it('should fallback to WebP if AVIF fails', async () => {
    const file: UploadedFile = {
      originalname: 'test.png',
      mimetype: 'image/png',
      buffer: Buffer.from('fake-png'),
    };

    // Mock sharp to fail on AVIF
    const sharpMock = {
      resize: vi.fn().mockReturnThis(),
      rotate: vi.fn().mockReturnThis(),
      avif: vi.fn().mockImplementation(() => {
        throw new Error('AVIF failed');
      }),
      webp: vi.fn().mockReturnThis(),
      toBuffer: vi.fn().mockResolvedValue(Buffer.from('webp-data')),
    };
    mockSharp.mockReturnValue(sharpMock);

    const result = await service.process(file);

    expect(result.original.mimetype).toBe('image/webp');
    expect(result.original.buffer.toString()).toBe('webp-data');
  });
});
