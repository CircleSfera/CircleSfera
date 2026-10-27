import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

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

  // The app understands notices from the app (someone became admin). An
  // older app does not send it and never receives them: it would draw one
  // as an empty message.
  @ApiProperty({ required: false, enum: ['true'] })
  @IsOptional()
  @IsIn(['true'])
  notices?: 'true';
}
