import { RiskCaseDecision } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveRiskCaseDto {
  @IsEnum(RiskCaseDecision)
  decision!: RiskCaseDecision;

  // Shown to the participant for a bot label; kept in the audit log.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
