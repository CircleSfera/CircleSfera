import { Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  cursor?: string;

  // Ranking snapshot timestamp for score-based feeds (DATA-003): the client
  // captures this from the first page's response and echoes it back on
  // subsequent pages so a ranking computed against "now" (e.g. time-decay)
  // stays frozen for the duration of one scroll session — a post created
  // after asOf cannot be inserted into an already-fetched page.
  @IsOptional()
  @IsISO8601()
  asOf?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    nextCursor?: string;
  };
}

export function createPaginatedResult<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
  nextCursor?: string,
): PaginatedResult<T> {
  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      nextCursor,
    },
  };
}
