import { $Enums } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

type ReportReason = $Enums.ReportReason;
const ReportReason = $Enums.ReportReason;
type ReportTargetType = $Enums.ReportTargetType;
const ReportTargetType = $Enums.ReportTargetType;

export { ReportReason, ReportTargetType };

export class CreateReportDto {
  @IsEnum(ReportTargetType)
  @IsNotEmpty()
  targetType!: ReportTargetType;

  @IsString()
  @IsNotEmpty()
  targetId!: string;

  @IsEnum(ReportReason)
  @IsNotEmpty()
  reason!: ReportReason;

  @IsString()
  @IsOptional()
  details?: string;

  // An intellectual-property report names who holds the right and the work
  // concerned; other reasons send neither.
  @ValidateIf((o: CreateReportDto) => o.reason === 'INTELLECTUAL_PROPERTY')
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  rightsHolder?: string;

  @ValidateIf((o: CreateReportDto) => o.reason === 'INTELLECTUAL_PROPERTY')
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  workConcerned?: string;
}
