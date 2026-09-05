import { IsIn, IsOptional } from 'class-validator';
import { MUTE_DURATIONS, type MuteDuration } from '../mute.util.js';

export class MuteUserDto {
  @IsOptional()
  @IsIn([...MUTE_DURATIONS])
  duration?: MuteDuration;
}
