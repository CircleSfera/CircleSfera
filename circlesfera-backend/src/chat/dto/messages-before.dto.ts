import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

// Where to read further back from: the time and id of the oldest message
// the app has, both or neither.
export class MessagesBeforeDto {
  @ApiProperty({ required: false, type: () => String })
  @IsOptional()
  @IsISO8601()
  before?: string;

  @ApiProperty({ required: false, type: () => String, maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  beforeId?: string;
}
