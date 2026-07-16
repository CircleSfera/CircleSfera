import * as fs from 'node:fs';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { STORAGE_PROVIDER } from './interfaces/storage-provider.interface.js';
import type { UploadedFile } from './interfaces/uploaded-file.interface.js';
import { MediaProcessorService } from './media-processor.service.js';
import { LocalStorageProvider } from './providers/local.provider.js';
import { UploadsService } from './uploads.service.js';

// Mock ConfigService
const mockConfigService = {
  get: vi.fn((key: string) => {
    if (key === 'BASE_URL') return 'http://localhost:3000';
    if (key === 'CLOUDINARY_NAME') return null; // Default to local
    return null;
  }),
};

// Mock MediaProcessorService
const mockMediaProcessor = {
  process: vi.fn((file: UploadedFile) =>
    Promise.resolve({ buffer: file.buffer, mimetype: file.mimetype }),
  ),
};

describe('UploadsService', () => {
  let service: UploadsService;
  let provider: LocalStorageProvider;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadsService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: MediaProcessorService,
          useValue: mockMediaProcessor,
        },
        {
          provide: STORAGE_PROVIDER,
          useFactory: (_config: ConfigService) => new LocalStorageProvider(),
          inject: [ConfigService],
        },
        { provide: 'BullQueue_video-transcoding', useValue: { add: vi.fn() } },
      ],
    }).compile();

    service = module.get<UploadsService>(UploadsService);
    provider = module.get(STORAGE_PROVIDER);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('LocalStorageProvider', () => {
    const testFile: UploadedFile = {
      originalname: 'test.png',
      mimetype: 'image/png',
      buffer: Buffer.from('fake-image-content'),
    };

    it('should upload a file and return url and type', async () => {
      // Mock Sharp to handle both default import and requirement types
      vi.mock('sharp', () => {
        /* eslint-disable @typescript-eslint/no-unsafe-member-access */
        /* eslint-disable @typescript-eslint/no-unsafe-return */

        /* eslint-disable @typescript-eslint/no-unsafe-call */
        const sharpMock: any = {
          toBuffer: vi.fn(),
        };
        // Use simple functions to ensure return value
        sharpMock.resize = vi.fn(() => sharpMock);
        sharpMock.webp = vi.fn(() => sharpMock);
        sharpMock.toBuffer.mockResolvedValue(Buffer.from('optimized'));

        const sharpFn = vi.fn(() => sharpMock);
        (sharpFn as any).default = sharpFn;

        return {
          default: sharpFn,
          __esModule: true,
        };

        /* eslint-enable @typescript-eslint/no-unsafe-member-access */
        /* eslint-enable @typescript-eslint/no-unsafe-return */

        /* eslint-enable @typescript-eslint/no-unsafe-call */
      });

      // Mock fs.promises.writeFile
      vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);

      const result = await provider.upload(testFile);

      expect(result.url).toContain('/uploads/');
      expect(result.url).toContain('.webp');
      expect(result.type).toBe('image');
      expect(fs.promises.writeFile).toHaveBeenCalled();
    });
  });
});
