import { applyDecorators } from '@nestjs/common';
import { ApiHideProperty } from '@nestjs/swagger';
import { Equals, IsOptional } from 'class-validator';

/**
 * Fields that app versions from before paid content was removed still send
 * when publishing or messaging. They are accepted only as "not for sale" and
 * never read, so an older app that has not reloaded keeps working; anything
 * else is refused. They go when the paid-content columns are dropped.
 */
export function LegacyNotForSaleFlag(): PropertyDecorator {
  return applyDecorators(ApiHideProperty(), IsOptional(), Equals(false));
}

/** As {@link LegacyNotForSaleFlag}, for a price: only 0 is accepted. */
export function LegacyNotForSalePrice(): PropertyDecorator {
  return applyDecorators(ApiHideProperty(), IsOptional(), Equals(0));
}
