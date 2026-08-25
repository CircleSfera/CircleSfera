import FingerprintJS from '@fingerprintjs/fingerprintjs';

let cachedVisitorId: string | null = null;
let loading: Promise<string | null> | null = null;

/** First-party FingerprintJS OSS visitor id (not Pro). Cached per page load. */
export async function getVisitorId(): Promise<string | null> {
  if (cachedVisitorId) return cachedVisitorId;
  if (loading) return loading;

  loading = (async () => {
    try {
      const agent = await FingerprintJS.load();
      const result = await agent.get();
      cachedVisitorId = result.visitorId;
      return cachedVisitorId;
    } catch {
      return null;
    } finally {
      loading = null;
    }
  })();

  return loading;
}
