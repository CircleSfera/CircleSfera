import { AppealTargetType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateAppealDto {
  @IsEnum(AppealTargetType)
  targetType!: AppealTargetType;

  @IsString()
  @IsOptional()
  targetId?: string;

  @IsString()
  @MinLength(10, { message: 'El motivo debe tener al menos 10 caracteres' })
  reason!: string;
}
