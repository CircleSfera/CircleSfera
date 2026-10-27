import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

/** A page of a Profile's published recordings. */
export class ListPublishedRecordingsDto {
  @ApiProperty({ required: false, type: () => String })
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @ApiProperty({ required: false, type: () => Number, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
