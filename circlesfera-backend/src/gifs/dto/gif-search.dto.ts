import {
  GIF_OFFSET_MAX,
  GIF_PAGE_SIZE,
  GIF_QUERY_MAX_LENGTH,
} from '@circlesfera/shared';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// Where in a list of GIFs a page starts.
export class GifPageDto {
  @ApiProperty({ required: false, minimum: 0, maximum: GIF_OFFSET_MAX })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(GIF_OFFSET_MAX - GIF_PAGE_SIZE)
  offset?: number;
}

// A search of GIFs: the words, and where the page starts.
export class GifSearchDto extends GifPageDto {
  @ApiProperty({ maxLength: GIF_QUERY_MAX_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(GIF_QUERY_MAX_LENGTH)
  q!: string;
}
