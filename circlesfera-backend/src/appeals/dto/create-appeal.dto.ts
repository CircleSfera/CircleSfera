import { ApiProperty } from '@nestjs/swagger';
import { AppealTargetType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateAppealDto {
  @ApiProperty({
    required: true,
    enum: [
      'ACCOUNT_BAN',
      'POST_REMOVAL',
      'BOT_LABEL',
      'STRIKE',
      'RESTRICTION',
      'PROMOTION_REJECTION',
    ],
  })
  @IsEnum(AppealTargetType)
  targetType!: AppealTargetType;

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  targetId?: string;

  @ApiProperty({ required: true, type: () => String, minLength: 10 })
  @IsString()
  @MinLength(10, { message: 'El motivo debe tener al menos 10 caracteres' })
  reason!: string;
}
