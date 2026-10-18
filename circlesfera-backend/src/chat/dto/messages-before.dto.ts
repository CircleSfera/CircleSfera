import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

// Where to read further back from: the time and id of the oldest message
// the app has, both or neither.
export class MessagesBeforeDto {
  @IsOptional()
  @IsISO8601()
  before?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  beforeId?: string;
}
