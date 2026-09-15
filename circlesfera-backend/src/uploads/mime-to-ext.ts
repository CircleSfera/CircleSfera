/**
 * Maps a validated MIME type to a canonical, safe file extension.
 *
 * Only types in the MediaSignatureValidator allowlist are mapped.
 * Anything unknown returns the safe fallback `.bin` — this prevents
 * client-controlled extensions from reaching the filesystem.
 */
export function mimetypeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg', // browser alias
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/heic': '.heic',
    'image/heif': '.heif',
    'image/avif': '.avif',
    'video/mp4': '.mp4',
    'video/quicktime': '.mp4', // .mov → normalise to .mp4
    'video/webm': '.webm',
    'video/mov': '.mp4', // browser alias
    'audio/mpeg': '.mp3',
    'audio/mp3': '.mp3', // browser alias
    'audio/wav': '.wav',
    'audio/wave': '.wav', // browser alias
    'audio/x-wav': '.wav', // browser alias
    'audio/x-m4a': '.m4a',
    'audio/m4a': '.m4a', // browser alias
    'audio/mp4': '.m4a', // browser alias
  };

  return map[mime] ?? '.bin';
}
