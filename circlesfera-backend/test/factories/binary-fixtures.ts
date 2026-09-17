/**
 * Stable binary fixtures for media upload and processing tests.
 *
 * Self-contained, immutable buffers that require no external network requests
 * or filesystem dependencies.
 */

/** Valid 1x1 transparent PNG buffer (67 bytes) */
export const TINY_PNG_BUFFER: Buffer = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex',
);

/** Valid 1x1 JPEG buffer */
export const TINY_JPEG_BUFFER: Buffer = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);

/** Valid minimal MP4 container header (ftyp isom/iso2 box) */
export const TINY_MP4_BUFFER: Buffer = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00,
  0x00, 0x02, 0x00, 0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
]);

/**
 * Build a mock Multer file payload for service-level upload testing.
 */
export function createMockMulterFile(options?: {
  filename?: string;
  mimetype?: string;
  buffer?: Buffer;
}): Express.Multer.File {
  const buf = options?.buffer ?? TINY_JPEG_BUFFER;
  const filename = options?.filename ?? 'test-fixture.jpg';
  const mimetype = options?.mimetype ?? 'image/jpeg';

  return {
    fieldname: 'file',
    originalname: filename,
    encoding: '7bit',
    mimetype,
    buffer: buf,
    size: buf.length,
    destination: '/tmp',
    filename,
    path: `/tmp/${filename}`,
    stream: null as any,
  };
}
