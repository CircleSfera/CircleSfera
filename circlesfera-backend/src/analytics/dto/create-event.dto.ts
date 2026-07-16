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
  @IsEnum(UserEventType)
  eventType!: UserEventType;

  @IsString()
  targetId!: string;

  @IsString()
  targetType!: string;

  @IsOptional()
  @IsInt()
  dwellTime?: number;
}

export class CreateEventBatchDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateEventDto)
  events!: CreateEventDto[];
}
