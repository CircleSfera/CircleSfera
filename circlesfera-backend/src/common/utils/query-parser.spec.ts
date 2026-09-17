import qs from 'qs';
import { describe, expect, it } from 'vitest';

function parseQuery(str: string): Record<string, unknown> {
  const boundedStr =
    typeof str === 'string' && str.length > 4096 ? str.slice(0, 4096) : str;
  return qs.parse(boundedStr, {
    depth: 5,
    parameterLimit: 100,
    arrayLimit: 50,
    allowPrototypes: false,
  }) as Record<string, unknown>;
}

describe('Query Parser Bounds', () => {
  it('bounds query string length to 4096 characters', () => {
    const longParam = 'a'.repeat(5000);
    const result = parseQuery(`key=${longParam}`);
    expect((result.key as string).length).toBe(4092); // "key=".length is 4, 4096 - 4 = 4092
  });

  it('strictly blocks prototype pollution', () => {
    const result = parseQuery(
      '__proto__[polluted]=true&constructor[prototype][admin]=true',
    );
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
    expect(Object.hasOwn(Object.prototype, 'admin')).toBe(false);
    expect((result as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('bounds nested object depth to 5 levels', () => {
    // 7 levels deep: a[b][c][d][e][f][g]=val
    const result = parseQuery('a[b][c][d][e][f][g]=val') as {
      a: { b: { c: { d: { e: { f: Record<string, unknown> } } } } };
    };
    expect(result.a.b.c.d.e.f).toBeDefined();
    // After depth 5, remaining nested keys become literal bracketed strings
    expect(result.a.b.c.d.e.f['[g]']).toBe('val');
  });

  it('bounds array elements to arrayLimit (50)', () => {
    // Attempt to allocate sparse array at index 100
    const result = parseQuery('arr[100]=val') as Record<string, unknown>;
    // Since 100 > arrayLimit (50), qs treats it as an object with key '100', preventing sparse array DoS
    expect(Array.isArray(result.arr)).toBe(false);
    expect((result.arr as Record<string, string>)['100']).toBe('val');
  });

  it('bounds parameter count to parameterLimit (100)', () => {
    const params: string[] = [];
    for (let i = 0; i < 150; i++) {
      params.push(`p${i}=val${i}`);
    }
    const result = parseQuery(params.join('&'));
    expect(Object.keys(result).length).toBe(100);
  });
});
