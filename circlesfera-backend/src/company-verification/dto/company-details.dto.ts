import { ApiProperty } from '@nestjs/swagger';
import { $Enums } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { LEGAL_NAME_MAX } from '../company-verification.constants.js';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// The company of an application: its kind, legal name, Spanish tax ID and,
// for a company, its website's domain.
export class CompanyDetailsDto {
  @ApiProperty({ required: true, enum: $Enums.CompanyKind })
  @IsEnum($Enums.CompanyKind)
  kind!: $Enums.CompanyKind;

  @ApiProperty({ required: true, maxLength: LEGAL_NAME_MAX })
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(LEGAL_NAME_MAX)
  legalName!: string;

  @ApiProperty({ required: true, maxLength: 20 })
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  taxId!: string;

  @ApiProperty({ required: false, nullable: true, maxLength: 253 })
  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(253)
  domain?: string | null;
}
