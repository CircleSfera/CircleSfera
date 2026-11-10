import { CHAT_FORWARD_MAX } from '@circlesfera/shared';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  MaxLength,
} from 'class-validator';

export class ForwardMessageDto {
  @ApiProperty({ type: [String], minItems: 1, maxItems: CHAT_FORWARD_MAX })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CHAT_FORWARD_MAX)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  conversationIds!: string[];
}
