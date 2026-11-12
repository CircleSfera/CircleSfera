import type { ConfigService } from '@nestjs/config';

/**
 * The live service's address for its API: LIVEKIT_API_URL, or the address
 * browsers use (LIVEKIT_URL) with http in place of ws. Empty when neither is
 * set.
 */
export function liveKitApiUrl(config: ConfigService): string {
  const explicit = config.get<string>('LIVEKIT_API_URL');
  if (explicit) return explicit;
  return (config.get<string>('LIVEKIT_URL') ?? '').replace(
    /^ws(s?):\/\//i,
    'http$1://',
  );
}
