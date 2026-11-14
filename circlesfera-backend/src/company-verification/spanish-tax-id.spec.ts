import { describe, expect, it } from 'vitest';
import { isValidTaxId, normalizeTaxId } from './spanish-tax-id.js';

describe('Spanish tax IDs', () => {
  it('writes an ID without spaces, dots or dashes, in capitals', () => {
    expect(normalizeTaxId(' b-12.345 674 ')).toBe('B12345674');
  });

  it.each([
    // Companies: a CIF with its control digit or letter.
    ['B12345674', 'COMPANY', true],
    ['A58818501', 'COMPANY', true],
    ['Q2826000H', 'COMPANY', true],
    ['G12345674', 'COMPANY', true],
    ['G1234567D', 'COMPANY', true],
    ['B1234567D', 'COMPANY', false],
    ['Q28260008', 'COMPANY', false],
    ['B12345675', 'COMPANY', false],
    ['12345678Z', 'COMPANY', false],
    // Sole traders: the NIF or NIE of the person.
    ['12345678Z', 'SOLE_TRADER', true],
    ['12345678A', 'SOLE_TRADER', false],
    ['X1234567L', 'SOLE_TRADER', true],
    ['Y1234567X', 'SOLE_TRADER', true],
    ['Z1234567R', 'SOLE_TRADER', true],
    ['X1234567A', 'SOLE_TRADER', false],
    ['B12345674', 'SOLE_TRADER', false],
    ['', 'SOLE_TRADER', false],
  ] as const)('%s as %s is %s', (id, kind, valid) => {
    expect(isValidTaxId(id, kind)).toBe(valid);
  });
});
