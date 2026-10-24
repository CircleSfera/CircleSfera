import { ApiProperty } from '@nestjs/swagger';
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
  @ApiProperty({
    required: true,
    enum: ['POST', 'USER', 'STORY', 'COMMENT', 'MESSAGE', 'PAYMENT', 'SYSTEM'],
  })
  @IsEnum(ReportTargetType)
  @IsNotEmpty()
  targetType!: ReportTargetType;

  @ApiProperty({ required: true, type: () => String })
  @IsString()
  @IsNotEmpty()
  targetId!: string;

  @ApiProperty({
    required: true,
    enum: [
      'VIOLENCE',
      'HATE_SPEECH',
      'HARASSMENT',
      'SCAM',
      'SPAM',
      'ILLEGAL_CONTENT',
      'IMPERSONATION',
      'CSAM',
      'SELF_HARM',
      'INTELLECTUAL_PROPERTY',
      'OTHER',
    ],
  })
  @IsEnum(ReportReason)
  @IsNotEmpty()
  reason!: ReportReason;

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  details?: string;

  // An intellectual-property report names who holds the right and the work
  // concerned; other reasons send neither.
  @ApiProperty({ required: false, type: () => String, maxLength: 200 })
  @ValidateIf((o: CreateReportDto) => o.reason === 'INTELLECTUAL_PROPERTY')
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  rightsHolder?: string;

  @ApiProperty({ required: false, type: () => String, maxLength: 500 })
  @ValidateIf((o: CreateReportDto) => o.reason === 'INTELLECTUAL_PROPERTY')
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  workConcerned?: string;
}
