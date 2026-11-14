import { ApiProperty } from '@nestjs/swagger';
import { $Enums } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export const REJECTION_NOTE_MAX = 500;

// A decision on a company verification: approved, or rejected with a
// reason and an optional note the person reads.
export class DecideCompanyDto {
  @ApiProperty({ required: true })
  @IsBoolean()
  approve!: boolean;

  @ApiProperty({ required: false, enum: $Enums.CompanyRejectionReason })
  @ValidateIf((dto: DecideCompanyDto) => dto.approve === false)
  @IsEnum($Enums.CompanyRejectionReason)
  reason?: $Enums.CompanyRejectionReason;

  @ApiProperty({ required: false, maxLength: REJECTION_NOTE_MAX })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(REJECTION_NOTE_MAX)
  note?: string;
}
