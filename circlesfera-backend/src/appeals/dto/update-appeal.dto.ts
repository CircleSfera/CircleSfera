import { AppealStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateAppealDto {
  @IsEnum(AppealStatus)
  status!: AppealStatus;

  @IsString()
  @IsOptional()
  adminNotes?: string;
}
