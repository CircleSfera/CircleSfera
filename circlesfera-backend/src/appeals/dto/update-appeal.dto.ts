import { ApiProperty } from '@nestjs/swagger';
import { AppealStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateAppealDto {
  @ApiProperty({ required: true, enum: ['PENDING', 'REJECTED', 'APPROVED'] })
  @IsEnum(AppealStatus)
  status!: AppealStatus;

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  adminNotes?: string;
}
