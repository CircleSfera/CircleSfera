import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { REQUIRES_PLAN_KEY, RequiresPlan } from './requires-plan.decorator.js';

describe('RequiresPlan', () => {
  it('marks a route with the plan it asks for, where the plan guard reads it', () => {
    class Routes {
      @RequiresPlan('Business')
      forBusiness() {}
      open() {}
    }
    const reflector = new Reflector();

    expect(reflector.get(REQUIRES_PLAN_KEY, Routes.prototype.forBusiness)).toBe(
      'Business',
    );
    expect(
      reflector.get(REQUIRES_PLAN_KEY, Routes.prototype.open),
    ).toBeUndefined();
  });
});
