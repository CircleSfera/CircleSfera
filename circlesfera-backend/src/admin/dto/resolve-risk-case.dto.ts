import { ApiProperty } from '@nestjs/swagger';
import { RiskCaseDecision } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveRiskCaseDto {
  @ApiProperty({
    required: true,
    enum: ['SUSPENDED', 'BANNED', 'BOT_LABEL', 'DISMISSED', 'RESTRICTED'],
  })
  @IsEnum(RiskCaseDecision)
  decision!: RiskCaseDecision;

  // Shown to the participant for a bot label; kept in the audit log.
  @ApiProperty({ required: false, type: () => String, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
