import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CONVERSATION_PAGE_MAX } from '../use-cases/queries/get-conversations.query.js';

// One page of the conversation list: the folder, where the page before
// ended (the cursor it returned) and how many to read.
export class ConversationPageDto {
  @ApiProperty({ required: false, enum: ['inbox', 'requests'] })
  @IsOptional()
  @IsIn(['inbox', 'requests'])
  folder?: 'inbox' | 'requests';

  @ApiProperty({ required: false, type: () => String, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @ApiProperty({
    required: false,
    type: () => Number,
    minimum: 1,
    maximum: CONVERSATION_PAGE_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CONVERSATION_PAGE_MAX)
  limit?: number;
}
