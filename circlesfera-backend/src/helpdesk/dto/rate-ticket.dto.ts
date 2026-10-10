import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** What the requester thought of the answer. */
export class RateTicketDto {
  @IsIn(['GOOD', 'BAD'])
  score!: 'GOOD' | 'BAD';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
