import { describe, expect, it, vi } from 'vitest';
import { StudioTemplatesController } from './studio-templates.controller.js';
import type { StudioTemplatesService } from './studio-templates.service.js';

describe('StudioTemplatesController', () => {
  const service = {
    create: vi.fn(),
    mine: vi.fn(),
    forPost: vi.fn(),
    use: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };
  const controller = new StudioTemplatesController(
    service as unknown as StudioTemplatesService,
  );
  const user = { profileId: 'p-1' } as never;

  it('acts as the signed-in Profile', () => {
    const dto = { name: 'N', structure: {} };
    controller.create(user, dto);
    controller.mine(user);
    controller.use(user, 't-1');
    controller.update(user, 't-1', { name: 'M' });
    controller.remove(user, 't-1');
    expect(service.create).toHaveBeenCalledWith('p-1', dto);
    expect(service.mine).toHaveBeenCalledWith('p-1');
    expect(service.use).toHaveBeenCalledWith('p-1', 't-1');
    expect(service.update).toHaveBeenCalledWith('p-1', 't-1', { name: 'M' });
    expect(service.remove).toHaveBeenCalledWith('p-1', 't-1');
  });

  it('shows a Frame’s template to a guest or a Profile', () => {
    controller.forPost(null, 'post-1');
    controller.forPost(user, 'post-1');
    expect(service.forPost).toHaveBeenNthCalledWith(1, 'post-1', undefined);
    expect(service.forPost).toHaveBeenNthCalledWith(2, 'post-1', 'p-1');
  });
});
