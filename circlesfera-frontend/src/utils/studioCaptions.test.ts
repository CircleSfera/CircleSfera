import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/edits.service', () => ({
  editsService: {
    getCaptionsJob: vi.fn(),
  },
}));

import { editsService } from '../services/edits.service';
import { pollCaptionsJob } from './studioCaptions';

describe('pollCaptionsJob cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects with cancelled when aborted during wait', async () => {
    const controller = new AbortController();
    const promise = pollCaptionsJob('p1', 'j1', controller.signal, 5);
    controller.abort();
    await expect(promise).rejects.toThrow('studio.captions.cancelled');
    expect(editsService.getCaptionsJob).not.toHaveBeenCalled();
  });
});
