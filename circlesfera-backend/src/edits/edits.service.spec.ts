import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { UploadsService } from '../uploads/uploads.service.js';
import { EditsService } from './edits.service.js';

describe('EditsService', () => {
  let service: EditsService;

  const mockPrismaService = {
    editProject: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  };

  const mockUploadsService = {
    deleteFile: vi.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EditsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: UploadsService, useValue: mockUploadsService },
      ],
    }).compile();

    service = module.get<EditsService>(EditsService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an edit project', async () => {
      const dto = {
        mediaUrl: 'https://cdn.example.com/photo.jpg',
        mediaType: 'image',
        name: 'My Edit Project',
        state: '{"filter":"vintage"}',
      };

      mockPrismaService.editProject.create.mockResolvedValue({
        id: 'edit-1',
        userId: 'user-1',
        ...dto,
      });

      const result = await service.create('user-1', dto);
      expect(mockPrismaService.editProject.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          mediaUrl: dto.mediaUrl,
          mediaType: 'image',
          name: dto.name,
          state: dto.state,
        },
      });
      expect(result).toHaveProperty('id', 'edit-1');
    });
  });

  describe('findOne', () => {
    it('should throw NotFoundException if edit project does not exist', async () => {
      mockPrismaService.editProject.findFirst.mockResolvedValue(null);

      await expect(service.findOne('user-1', 'invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return edit project if owned by user', async () => {
      mockPrismaService.editProject.findFirst.mockResolvedValue({
        id: 'edit-1',
        userId: 'user-1',
      });

      const result = await service.findOne('user-1', 'edit-1');
      expect(result).toEqual({ id: 'edit-1', userId: 'user-1' });
    });
  });

  describe('remove', () => {
    it('should throw NotFoundException if edit project does not exist', async () => {
      mockPrismaService.editProject.findFirst.mockResolvedValue(null);

      await expect(service.remove('user-1', 'invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should delete edit project and media file', async () => {
      mockPrismaService.editProject.findFirst.mockResolvedValue({
        id: 'edit-1',
        userId: 'user-1',
        mediaUrl: 'https://cdn.example.com/photo.jpg',
      });
      mockPrismaService.editProject.delete.mockResolvedValue({ id: 'edit-1' });

      const result = await service.remove('user-1', 'edit-1');
      expect(mockUploadsService.deleteFile).toHaveBeenCalledWith(
        'https://cdn.example.com/photo.jpg',
      );
      expect(mockPrismaService.editProject.delete).toHaveBeenCalledWith({
        where: { id: 'edit-1' },
      });
      expect(result).toEqual({ success: true });
    });
  });
});
