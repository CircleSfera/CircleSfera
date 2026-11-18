import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import {
  BUSINESS_STAT_KINDS,
  type BusinessStatKind,
} from '../business-stats.constants.js';

export class RecordBusinessStatDto {
  @ApiProperty({ enum: BUSINESS_STAT_KINDS })
  @IsIn(BUSINESS_STAT_KINDS)
  kind!: BusinessStatKind;
}
