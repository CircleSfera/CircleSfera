import { describe, expect, it } from 'vitest';
import * as contracts from './helpdesk-host.contracts.js';

describe('host contract tokens', () => {
  const tokens: symbol[] = Object.values(contracts).filter(
    (value) => typeof value === 'symbol',
  );

  it('names each of the nine contracts', () => {
    expect(tokens).toHaveLength(9);
  });

  it('gives every contract its own token, so no implementation can stand in for another', () => {
    expect(new Set(tokens).size).toBe(tokens.length);
    expect(new Set(tokens.map((token) => token.description)).size).toBe(
      tokens.length,
    );
  });
});
