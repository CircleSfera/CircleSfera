import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsOptional } from 'class-validator';

/**
 * Fields that app versions from before paid content was removed still send
 * when publishing or messaging. They are accepted only as "not for sale" and
 * never read, so an older app that has not reloaded keeps working; anything
 * else is refused. They go when the paid-content columns are dropped.
 */
export function LegacyNotForSaleFlag(): PropertyDecorator {
  return applyDecorators(
    ApiProperty({
      required: false,
      type: Boolean,
      enum: [false],
      deprecated: true,
      description: 'Sent by older app versions; only false is accepted.',
    }),
    IsOptional(),
    Equals(false),
  );
}

/** As {@link LegacyNotForSaleFlag}, for a price: only 0 is accepted. */
export function LegacyNotForSalePrice(): PropertyDecorator {
  return applyDecorators(
    ApiProperty({
      required: false,
      type: Number,
      enum: [0],
      deprecated: true,
      description: 'Sent by older app versions; only 0 is accepted.',
    }),
    IsOptional(),
    Equals(0),
  );
}
