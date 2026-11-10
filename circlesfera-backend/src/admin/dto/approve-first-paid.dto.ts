import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

export class ApproveFirstPaidDto {
  @ApiPropertyOptional({
    description:
      'When the author last edited the post, as it was when staff opened it; empty if never edited',
    nullable: true,
  })
  @IsOptional()
  @IsISO8601()
  editedAt?: string | null;
}
