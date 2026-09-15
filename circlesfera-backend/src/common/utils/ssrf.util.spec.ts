import { describe, expect, it, vi } from 'vitest';
import {
  isPrivateIp,
  SsrfBlockedError,
  validateTargetUrl,
} from './ssrf.util.js';

describe('ssrf.util', () => {
  describe('isPrivateIp', () => {
    describe('IPv4 Private & Reserved Ranges', () => {
      it('blocks loopback (127.0.0.0/8)', () => {
        expect(isPrivateIp('127.0.0.1')).toBe(true);
        expect(isPrivateIp('127.0.0.2')).toBe(true);
        expect(isPrivateIp('127.255.255.255')).toBe(true);
      });

      it('blocks cloud metadata / link-local (169.254.0.0/16)', () => {
        expect(isPrivateIp('169.254.169.254')).toBe(true);
        expect(isPrivateIp('169.254.0.1')).toBe(true);
        expect(isPrivateIp('169.254.255.255')).toBe(true);
      });

      it('blocks RFC 1918 10.0.0.0/8', () => {
        expect(isPrivateIp('10.0.0.1')).toBe(true);
        expect(isPrivateIp('10.255.255.255')).toBe(true);
      });

      it('blocks RFC 1918 172.16.0.0/12', () => {
        expect(isPrivateIp('172.16.0.1')).toBe(true);
        expect(isPrivateIp('172.31.255.255')).toBe(true);
        // 172.32.0.1 is public
        expect(isPrivateIp('172.32.0.1')).toBe(false);
      });

      it('blocks RFC 1918 192.168.0.0/16', () => {
        expect(isPrivateIp('192.168.0.1')).toBe(true);
        expect(isPrivateIp('192.168.1.1')).toBe(true);
        expect(isPrivateIp('192.168.255.255')).toBe(true);
      });

      it('blocks current network 0.0.0.0/8', () => {
        expect(isPrivateIp('0.0.0.0')).toBe(true);
        expect(isPrivateIp('0.255.255.255')).toBe(true);
      });

      it('blocks CGNAT 100.64.0.0/10', () => {
        expect(isPrivateIp('100.64.0.1')).toBe(true);
        expect(isPrivateIp('100.127.255.255')).toBe(true);
        // 100.128.0.1 is public
        expect(isPrivateIp('100.128.0.1')).toBe(false);
      });

      it('blocks multicast 224.0.0.0/4 and reserved 240.0.0.0/4', () => {
        expect(isPrivateIp('224.0.0.1')).toBe(true);
        expect(isPrivateIp('239.255.255.255')).toBe(true);
        expect(isPrivateIp('240.0.0.1')).toBe(true);
        expect(isPrivateIp('255.255.255.255')).toBe(true);
      });

      it('blocks test networks (RFC 5737)', () => {
        expect(isPrivateIp('192.0.2.1')).toBe(true);
        expect(isPrivateIp('198.51.100.1')).toBe(true);
        expect(isPrivateIp('203.0.113.1')).toBe(true);
      });

      it('allows legitimate public IPv4 addresses', () => {
        expect(isPrivateIp('8.8.8.8')).toBe(false); // Google DNS
        expect(isPrivateIp('1.1.1.1')).toBe(false); // Cloudflare DNS
        expect(isPrivateIp('93.184.216.34')).toBe(false); // example.com
        expect(isPrivateIp('54.239.28.85')).toBe(false); // AWS public IP
      });
    });

    describe('IPv6 Private & Reserved Ranges', () => {
      it('blocks IPv6 loopback (::1)', () => {
        expect(isPrivateIp('::1')).toBe(true);
        expect(isPrivateIp('0:0:0:0:0:0:0:1')).toBe(true);
      });

      it('blocks IPv6 unspecified (::)', () => {
        expect(isPrivateIp('::')).toBe(true);
      });

      it('blocks IPv6 ULA (fc00::/7)', () => {
        expect(isPrivateIp('fc00::1')).toBe(true);
        expect(isPrivateIp('fd12:3456:789a:1::1')).toBe(true);
      });

      it('blocks IPv6 link-local (fe80::/10)', () => {
        expect(isPrivateIp('fe80::1')).toBe(true);
        expect(isPrivateIp('febf::ffff')).toBe(true);
      });

      it('blocks IPv6 multicast (ff00::/8)', () => {
        expect(isPrivateIp('ff02::1')).toBe(true);
      });

      it('blocks IPv4-mapped IPv6 pointing to private addresses', () => {
        expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
        expect(isPrivateIp('::ffff:169.254.169.254')).toBe(true);
        expect(isPrivateIp('::ffff:10.0.0.1')).toBe(true);
        expect(isPrivateIp('::ffff:192.168.1.1')).toBe(true);
      });

      it('allows public IPv4-mapped IPv6', () => {
        expect(isPrivateIp('::ffff:8.8.8.8')).toBe(false);
      });

      it('allows legitimate public IPv6 addresses', () => {
        expect(isPrivateIp('2606:4700:4700::1111')).toBe(false); // Cloudflare DNS IPv6
        expect(isPrivateIp('2001:4860:4860::8888')).toBe(false); // Google DNS IPv6
      });
    });
  });

  describe('validateTargetUrl', () => {
    it('throws on invalid URL format', async () => {
      await expect(validateTargetUrl('not-a-url')).rejects.toThrow(
        SsrfBlockedError,
      );
    });

    it('rejects forbidden protocols (file, gopher, ftp, javascript)', async () => {
      await expect(validateTargetUrl('file:///etc/passwd')).rejects.toThrow(
        SsrfBlockedError,
      );
      await expect(validateTargetUrl('ftp://example.com/file')).rejects.toThrow(
        SsrfBlockedError,
      );
      await expect(validateTargetUrl('javascript:alert(1)')).rejects.toThrow(
        SsrfBlockedError,
      );
    });

    it('rejects HTTP when requireHttps is true', async () => {
      await expect(
        validateTargetUrl('http://example.com/video.mp4', {
          requireHttps: true,
        }),
      ).rejects.toThrow(SsrfBlockedError);
    });

    it('rejects non-standard ports (e.g., 6379, 22, 5432)', async () => {
      await expect(
        validateTargetUrl('https://example.com:6379/data', {
          requireHttps: false,
        }),
      ).rejects.toThrow(SsrfBlockedError);

      await expect(
        validateTargetUrl('http://example.com:22/data', {
          requireHttps: false,
        }),
      ).rejects.toThrow(SsrfBlockedError);
    });

    it('blocks local hostnames', async () => {
      await expect(
        validateTargetUrl('http://localhost:80/file', { requireHttps: false }),
      ).rejects.toThrow(/local or internal/);
      await expect(
        validateTargetUrl('http://sub.localhost/file', { requireHttps: false }),
      ).rejects.toThrow(/local or internal/);
      await expect(
        validateTargetUrl('http://myserver.local/file', {
          requireHttps: false,
        }),
      ).rejects.toThrow(/local or internal/);
      await expect(
        validateTargetUrl('http://service.internal/file', {
          requireHttps: false,
        }),
      ).rejects.toThrow(/local or internal/);
    });

    it('blocks single-label internal hostnames (e.g. metadata, redis)', async () => {
      await expect(
        validateTargetUrl('http://metadata/v1', { requireHttps: false }),
      ).rejects.toThrow(/internal/);
    });

    it('blocks private IP literals directly', async () => {
      await expect(
        validateTargetUrl('http://127.0.0.1/admin', { requireHttps: false }),
      ).rejects.toThrow(SsrfBlockedError);
      await expect(
        validateTargetUrl('http://169.254.169.254/latest/meta-data/', {
          requireHttps: false,
        }),
      ).rejects.toThrow(SsrfBlockedError);
      await expect(
        validateTargetUrl('http://10.0.0.5/api', { requireHttps: false }),
      ).rejects.toThrow(SsrfBlockedError);
    });

    it('blocks domains that resolve to private IPs via DNS lookup', async () => {
      const mockDns = vi
        .fn()
        .mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);

      await expect(
        validateTargetUrl('https://malicious-domain.com/audio.mp3', {
          requireHttps: true,
          dnsLookup: mockDns as any,
        }),
      ).rejects.toThrow(/resolved to private IP/);
    });

    it('blocks domains that resolve to metadata IP (169.254.169.254)', async () => {
      const mockDns = vi
        .fn()
        .mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);

      await expect(
        validateTargetUrl('https://evil-metadata.com/clip.mp4', {
          requireHttps: true,
          dnsLookup: mockDns as any,
        }),
      ).rejects.toThrow(/resolved to private IP/);
    });

    it('enforces domain allowlist when provided', async () => {
      const mockDns = vi
        .fn()
        .mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);

      // Allowed
      const valid = await validateTargetUrl(
        'https://cdn.circlesfera.com/sound.mp3',
        {
          requireHttps: true,
          allowedDomains: ['circlesfera.com'],
          dnsLookup: mockDns as any,
        },
      );
      expect(valid.hostname).toBe('cdn.circlesfera.com');

      // Not allowed domain
      await expect(
        validateTargetUrl('https://other-domain.com/sound.mp3', {
          requireHttps: true,
          allowedDomains: ['circlesfera.com'],
          dnsLookup: mockDns as any,
        }),
      ).rejects.toThrow(/not in the allowed domains list/);
    });

    it('passes for valid public target URL', async () => {
      const mockDns = vi
        .fn()
        .mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);

      const result = await validateTargetUrl('https://example.com/audio.mp3', {
        requireHttps: true,
        dnsLookup: mockDns as any,
      });

      expect(result.protocol).toBe('https:');
      expect(result.hostname).toBe('example.com');
    });
  });
});
