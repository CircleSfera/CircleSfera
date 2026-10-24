import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { MUTE_DURATIONS, type MuteDuration } from '../mute.util.js';

export class MuteUserDto {
  @ApiProperty({ required: false, enum: [...MUTE_DURATIONS] })
  @IsOptional()
  @IsIn([...MUTE_DURATIONS])
  duration?: MuteDuration;
}
