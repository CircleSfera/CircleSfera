import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** What the requester thought of the answer. */
export class RateTicketDto {
  @ApiProperty({ required: true, enum: ['GOOD', 'BAD'] })
  @IsIn(['GOOD', 'BAD'])
  score!: 'GOOD' | 'BAD';

  @ApiProperty({ required: false, type: () => String, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
