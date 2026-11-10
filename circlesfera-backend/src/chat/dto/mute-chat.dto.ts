import {
  CHAT_MUTE_DURATIONS,
  type ChatMuteDuration,
} from '@circlesfera/shared';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class MuteChatDto {
  @ApiProperty({ enum: CHAT_MUTE_DURATIONS })
  @IsIn(CHAT_MUTE_DURATIONS)
  for!: ChatMuteDuration;
}
