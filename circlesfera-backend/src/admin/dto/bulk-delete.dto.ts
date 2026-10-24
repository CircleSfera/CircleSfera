import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsString,
} from 'class-validator';

// How many items one request may delete: the limit Reports uses.
export const BULK_DELETE_LIMIT = 50;

export class BulkDeleteDto {
  @ApiProperty({
    required: true,
    type: () => [String],
    uniqueItems: true,
    minItems: 1,
    maxItems: BULK_DELETE_LIMIT,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BULK_DELETE_LIMIT)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  ids!: string[];
}
