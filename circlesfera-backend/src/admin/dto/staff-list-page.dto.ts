import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// A page of a staff list: enough to fill a screen a few times over.
export const STAFF_LIST_PAGE_DEFAULT = 30;
export const STAFF_LIST_PAGE_MAX = 50;

/** Where a page of a staff list starts, and how long it is. */
export class StaffListPageDto {
  @ApiProperty({ required: false, type: () => String, maxLength: 400 })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  cursor?: string;

  @ApiProperty({
    required: false,
    type: () => Number,
    minimum: 1,
    maximum: STAFF_LIST_PAGE_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(STAFF_LIST_PAGE_MAX)
  limit?: number;
}

/** A page of the blocked link domains, optionally only those matching. */
export class LinkDomainPageDto extends StaffListPageDto {
  @ApiProperty({ required: false, type: () => String, maxLength: 253 })
  @IsOptional()
  @IsString()
  @MaxLength(253)
  search?: string;
}
