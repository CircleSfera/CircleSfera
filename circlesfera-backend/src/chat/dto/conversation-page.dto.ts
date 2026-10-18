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
  @IsOptional()
  @IsIn(['inbox', 'requests'])
  folder?: 'inbox' | 'requests';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CONVERSATION_PAGE_MAX)
  limit?: number;
}
