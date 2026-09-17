import { UnsupportedMediaTypeException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { MediaSignatureValidator } from './media-signature.validator.js';

// ---------------------------------------------------------------------------
// Magic-byte helpers
// ---------------------------------------------------------------------------

/** Returns a Buffer that starts with JPEG magic bytes (FF D8 FF). */
function jpegBuffer(): Buffer {
  return Buffer.from([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x10,
    ...Buffer.from('JFIF'),
  ]);
}

/** Returns a Buffer that starts with PNG magic bytes + IHDR chunk (enough for file-type detection). */
function pngBuffer(): Buffer {
  // PNG signature (8 bytes) + IHDR length (4) + "IHDR" (4) = 16 bytes minimum for file-type
  return Buffer.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a, // PNG signature
    0x00,
    0x00,
    0x00,
    0x0d, // IHDR chunk length
    0x49,
    0x48,
    0x44,
    0x52, // "IHDR"
    0x00,
    0x00,
    0x00,
    0x01, // width = 1
    0x00,
    0x00,
    0x00,
    0x01, // height = 1
    0x08,
    0x02, // bit depth, color type
  ]);
}

/** Returns a Buffer with Windows PE/EXE magic bytes (MZ header). */
function exeBuffer(): Buffer {
  return Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // MZ header
}

/** Returns a buffer with no recognisable magic bytes (plain text). */
function textBuffer(): Buffer {
  return Buffer.from('Hello, world!');
}

function svgBuffer(
  content = '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
): Buffer {
  return Buffer.from(content, 'utf8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MediaSignatureValidator', () => {
  let validator: MediaSignatureValidator;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MediaSignatureValidator],
    }).compile();

    validator = module.get<MediaSignatureValidator>(MediaSignatureValidator);
  });

  // ── Happy paths ────────────────────────────────────────────────────────────

  it('accepts a genuine JPEG buffer with matching declared mimetype', async () => {
    await expect(
      validator.validate(jpegBuffer(), 'image/jpeg'),
    ).resolves.toBeUndefined();
  });

  it('accepts a genuine PNG buffer with matching declared mimetype', async () => {
    await expect(
      validator.validate(pngBuffer(), 'image/png'),
    ).resolves.toBeUndefined();
  });

  // ── SVG Security Policy ───────────────────

  it('rejects SVG uploads under platform security policy (mitigates Stored XSS / XXE)', async () => {
    await expect(
      validator.validate(svgBuffer(), 'image/svg+xml'),
    ).rejects.toThrow(UnsupportedMediaTypeException);
  });

  it('rejects SVG containing embedded <script> tags', async () => {
    const xssSvg = svgBuffer(
      '<svg><script>alert(document.cookie)</script></svg>',
    );
    await expect(validator.validate(xssSvg, 'image/svg+xml')).rejects.toThrow(
      UnsupportedMediaTypeException,
    );
  });

  it('rejects SVG containing event handlers (onload, onerror)', async () => {
    const onloadSvg = svgBuffer('<svg onload="alert(1)"></svg>');
    await expect(
      validator.validate(onloadSvg, 'image/svg+xml'),
    ).rejects.toThrow(UnsupportedMediaTypeException);
  });

  it('rejects SVG containing XML entity definitions (XXE)', async () => {
    const xxeSvg = svgBuffer(
      '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg>&xxe;</svg>',
    );
    await expect(validator.validate(xxeSvg, 'image/svg+xml')).rejects.toThrow(
      UnsupportedMediaTypeException,
    );
  });

  it('rejects SVG containing <foreignObject> tags', async () => {
    const foSvg = svgBuffer(
      '<svg><foreignObject width="100" height="100"><body><div>xss</div></body></foreignObject></svg>',
    );
    await expect(validator.validate(foSvg, 'image/svg+xml')).rejects.toThrow(
      UnsupportedMediaTypeException,
    );
  });

  it('rejects SVG containing javascript: URIs in href', async () => {
    const jsSvg = svgBuffer(
      '<svg><a href="javascript:alert(1)"><circle r="10"/></a></svg>',
    );
    await expect(validator.validate(jsSvg, 'image/svg+xml')).rejects.toThrow(
      UnsupportedMediaTypeException,
    );
  });

  it('proactively rejects active SVG script content disguised under other declared types', async () => {
    const disguised = svgBuffer('<svg><script>alert(1)</script></svg>');
    await expect(validator.validate(disguised, 'image/png')).rejects.toThrow(
      UnsupportedMediaTypeException,
    );
  });

  // ── Rejection: undetectable / text ────────────────────────────────────────

  it('rejects a plain-text buffer claiming to be image/jpeg', async () => {
    await expect(
      validator.validate(textBuffer(), 'image/jpeg'),
    ).rejects.toThrow(UnsupportedMediaTypeException);
  });

  it('rejects an empty buffer', async () => {
    await expect(
      validator.validate(Buffer.alloc(0), 'image/jpeg'),
    ).rejects.toThrow(UnsupportedMediaTypeException);
  });

  // ── Rejection: not in allowlist ───────────────────────────────────────────

  it('rejects an EXE buffer even if declared as image/jpeg', async () => {
    // MZ header is not in the allowlist.
    await expect(validator.validate(exeBuffer(), 'image/jpeg')).rejects.toThrow(
      UnsupportedMediaTypeException,
    );
  });

  // ── Rejection: MIME mismatch ──────────────────────────────────────────────

  it('rejects a real JPEG buffer when declared mimetype is video/mp4', async () => {
    await expect(validator.validate(jpegBuffer(), 'video/mp4')).rejects.toThrow(
      UnsupportedMediaTypeException,
    );
  });

  it('rejects a real PNG buffer when declared mimetype is image/jpeg', async () => {
    await expect(validator.validate(pngBuffer(), 'image/jpeg')).rejects.toThrow(
      UnsupportedMediaTypeException,
    );
  });

  // ── Rejection: SVG content check ─────────────────────────────────────────

  it('rejects a buffer that does not look like SVG but is declared as image/svg+xml', async () => {
    await expect(
      validator.validate(
        Buffer.from('not svg content at all'),
        'image/svg+xml',
      ),
    ).rejects.toThrow(UnsupportedMediaTypeException);
  });

  // ── Alias compatibility ───────────────────────────────────────────────────

  it('accepts a JPEG buffer declared as image/jpg (alias)', async () => {
    // image/jpg is a common browser alias for image/jpeg
    await expect(
      validator.validate(jpegBuffer(), 'image/jpg'),
    ).resolves.toBeUndefined();
  });
});
