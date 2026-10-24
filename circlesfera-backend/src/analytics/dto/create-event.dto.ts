import { ApiProperty } from '@nestjs/swagger';
import { UserEventType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class CreateEventDto {
  @ApiProperty({
    required: true,
    enum: [
      'COMMENT',
      'IMPRESSION',
      'VIEW_START',
      'VIEW_COMPLETE',
      'DWELL_TIME',
      'LIKE',
      'SAVE',
      'SHARE',
      'HIDE',
      'REPORT',
      'PROFILE_CLICK',
      'FOLLOW',
      'SUBSCRIPTION_CLICK',
      'SUBSCRIPTION_SUCCESS',
      'SPONSORED_PLACEMENT_CLICK',
    ],
  })
  @IsEnum(UserEventType)
  eventType!: UserEventType;

  @ApiProperty({ required: true, type: () => String })
  @IsString()
  targetId!: string;

  @ApiProperty({ required: true, type: () => String })
  @IsString()
  targetType!: string;

  @ApiProperty({ required: false, type: () => Number })
  @IsOptional()
  @IsInt()
  dwellTime?: number;
}

export class CreateEventBatchDto {
  @ApiProperty({ required: true, type: () => [CreateEventDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateEventDto)
  events!: CreateEventDto[];
}
