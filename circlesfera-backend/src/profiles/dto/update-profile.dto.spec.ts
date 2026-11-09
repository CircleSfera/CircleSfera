import { BUSINESS_CATEGORIES } from '@circlesfera/shared';
import { BusinessCategory } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { UpdateProfileDto } from './update-profile.dto.js';

const errorsFor = (body: Record<string, unknown>) =>
  validate(plainToInstance(UpdateProfileDto, body));

describe('UpdateProfileDto: profile colour', () => {
  it('accepts a colour of the closed list', async () => {
    expect(await errorsFor({ accentColor: 'teal' })).toEqual([]);
  });

  it('accepts null, which goes back to the colour of the app', async () => {
    expect(await errorsFor({ accentColor: null })).toEqual([]);
  });

  it.each(['#ff5757', 'coral', 'red', ''])(
    'refuses %s, which is not on the list',
    async (accentColor) => {
      const errors = await errorsFor({ accentColor });
      expect(errors.map((error) => error.property)).toEqual(['accentColor']);
    },
  );
});

describe('UpdateProfileDto: business presentation', () => {
  const place = {
    mapboxId: 'mb-1',
    name: 'Calle Mayor 1',
    latitude: 40.41,
    longitude: -3.7,
  };

  it('offers the same categories the database keeps', () => {
    expect([...BUSINESS_CATEGORIES].sort()).toEqual(
      Object.values(BusinessCategory).sort(),
    );
  });

  it('accepts a category, an email, a phone and an address', async () => {
    expect(
      await errorsFor({
        businessCategory: 'RESTAURANT_BAR',
        contactEmail: 'hola@shop.es',
        contactPhone: '+34600111222',
        businessPlace: place,
      }),
    ).toEqual([]);
  });

  it('accepts null for each, which removes it', async () => {
    expect(
      await errorsFor({
        businessCategory: null,
        contactEmail: null,
        contactPhone: null,
        businessPlace: null,
      }),
    ).toEqual([]);
  });

  it.each([
    ['businessCategory', 'BAKERY'],
    ['businessCategory', ''],
    ['contactEmail', 'not-an-email'],
    ['contactEmail', `${'a'.repeat(250)}@x.es`],
    ['contactPhone', '600111222'],
    ['contactPhone', '+0600111222'],
    ['contactPhone', '+34 600 111 222'],
    ['contactPhone', '+1234567'],
    ['contactPhone', '+1234567890123456'],
  ])('refuses %s %s', async (property, value) => {
    const errors = await errorsFor({ [property]: value });
    expect(errors.map((error) => error.property)).toEqual([property]);
  });

  it('refuses an address without coordinates', async () => {
    const errors = await errorsFor({
      businessPlace: { mapboxId: 'mb-1', name: 'Somewhere' },
    });
    expect(errors.map((error) => error.property)).toEqual(['businessPlace']);
  });
});
