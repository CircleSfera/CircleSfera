import { describe, expect, it } from 'vitest';
import {
  parseCspReports,
  toBlockedOrigin,
  toPagePath,
} from './csp-report.util.js';

describe('CSP report parsing', () => {
  it('reads the legacy report-uri format and drops query strings', () => {
    const [v] = parseCspReports({
      'csp-report': {
        'document-uri': 'https://circlesfera.com/reset-password?token=secret',
        'violated-directive': 'script-src-elem',
        'effective-directive': 'script-src-elem',
        'blocked-uri': 'https://evil.example.com/x.js?k=secret',
        disposition: 'report',
      },
    });

    expect(v).toEqual({
      directive: 'script-src-elem',
      blocked: 'https://evil.example.com',
      page: '/reset-password',
      disposition: 'report',
    });
    expect(JSON.stringify(v)).not.toContain('secret');
  });

  it('reads the Reporting API format and ignores other report types', () => {
    const reports = parseCspReports([
      {
        type: 'csp-violation',
        body: {
          documentURL: 'https://circlesfera.com/explore?q=x',
          effectiveDirective: 'connect-src',
          blockedURL: 'wss://other.example.com/socket',
          disposition: 'report',
        },
      },
      { type: 'deprecation', body: { message: 'x' } },
    ]);

    expect(reports).toEqual([
      {
        directive: 'connect-src',
        blocked: 'wss://other.example.com',
        page: '/explore',
        disposition: 'report',
      },
    ]);
  });

  it('keeps CSP keywords and rejects malformed input', () => {
    expect(toBlockedOrigin('inline')).toBe('inline');
    expect(toBlockedOrigin('data:image/png;base64,AAAA')).toBe('data');
    expect(toBlockedOrigin(undefined)).toBe('unknown');
    expect(toPagePath('not a url')).toBe('unknown');
    expect(parseCspReports('nonsense')).toEqual([]);
    expect(parseCspReports(null)).toEqual([]);
  });

  it('caps the number of reports processed per request', () => {
    const many = Array.from({ length: 50 }, () => ({
      type: 'csp-violation',
      body: { effectiveDirective: 'img-src' },
    }));
    expect(parseCspReports(many)).toHaveLength(20);
  });
});
