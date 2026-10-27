import { beforeEach, describe, expect, it, vi } from 'vitest';
import { liveRecordingsApi, recordingLength } from './liveRecordings';

const client = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
}));
vi.mock('./api', () => ({ apiClient: client }));

describe('liveRecordingsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.get.mockResolvedValue({ data: 'got' });
    client.post.mockResolvedValue({ data: 'posted' });
    client.delete.mockResolvedValue({ data: 'deleted' });
  });

  it('asks for the recordings at their addresses', async () => {
    expect(await liveRecordingsApi.get('s1')).toBe('got');
    expect(client.get).toHaveBeenLastCalledWith('/live-recordings/s1');

    await liveRecordingsApi.listMine();
    expect(client.get).toHaveBeenLastCalledWith('/live-recordings/mine');

    await liveRecordingsApi.listPublished('p1');
    expect(client.get).toHaveBeenLastCalledWith('/live-recordings/profile/p1', {
      params: {},
    });
    await liveRecordingsApi.listPublished('p1', 'c1');
    expect(client.get).toHaveBeenLastCalledWith('/live-recordings/profile/p1', {
      params: { cursor: 'c1' },
    });

    expect(await liveRecordingsApi.publish('s1')).toBe('posted');
    expect(client.post).toHaveBeenCalledWith('/live-recordings/s1/publish');

    expect(await liveRecordingsApi.remove('s1')).toBe('deleted');
    expect(client.delete).toHaveBeenCalledWith('/live-recordings/s1');
  });
});

describe('recordingLength', () => {
  it('writes a length as m:ss, or h:mm:ss past an hour', () => {
    expect(recordingLength(null)).toBe('0:00');
    expect(recordingLength(-5)).toBe('0:00');
    expect(recordingLength(65_000)).toBe('1:05');
    expect(recordingLength(3_605_000)).toBe('1:00:05');
  });
});
