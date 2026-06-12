import { $Enums } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

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
}
