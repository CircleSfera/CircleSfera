import { FOUNDING_CREATOR_NOTE_MAX_LENGTH } from '@circlesfera/shared';
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

// A decision on an application to be a founding creator: approved, or
// declined with a reason and an optional note the person reads.
export class DecideFoundingCreatorDto {
  @ApiProperty({ required: true })
  @IsBoolean()
  approve!: boolean;

  @ApiProperty({ required: false, enum: $Enums.FoundingCreatorDeclineReason })
  @ValidateIf((dto: DecideFoundingCreatorDto) => dto.approve === false)
  @IsEnum($Enums.FoundingCreatorDeclineReason)
  reason?: $Enums.FoundingCreatorDeclineReason;

  @ApiProperty({ required: false, maxLength: FOUNDING_CREATOR_NOTE_MAX_LENGTH })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(FOUNDING_CREATOR_NOTE_MAX_LENGTH)
  note?: string;
}
