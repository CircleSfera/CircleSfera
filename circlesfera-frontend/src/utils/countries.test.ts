import { describe, expect, it } from 'vitest';
import { countryName, countryOptions } from './countries';

describe('countries', () => {
  it('names a country in the reader language', () => {
    expect(countryName('ES', 'en')).toBe('Spain');
    expect(countryName('DE', 'es')).toBe('Alemania');
  });

  it('lists every country of the closed list, in the order of their names', () => {
    const options = countryOptions('es');
    expect(options).toHaveLength(250);
    const names = options.map((o) => o.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'es')));
  });
});
