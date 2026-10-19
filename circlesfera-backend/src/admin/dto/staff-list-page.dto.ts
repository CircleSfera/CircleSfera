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
  @IsOptional()
  @IsString()
  @MaxLength(400)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(STAFF_LIST_PAGE_MAX)
  limit?: number;
}

/** A page of the blocked link domains, optionally only those matching. */
export class LinkDomainPageDto extends StaffListPageDto {
  @IsOptional()
  @IsString()
  @MaxLength(253)
  search?: string;
}
