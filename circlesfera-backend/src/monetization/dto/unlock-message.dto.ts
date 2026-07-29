import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class UnlockMessageDto {
  @ApiProperty({
    description: 'The ID of the message to unlock',
    example: 'msg_123',
  })
  @IsString()
  @IsNotEmpty()
  messageId!: string;

  @ApiProperty({
    description: 'The URL to return to after Stripe checkout',
    example: 'https://circlesfera.com/chat/conversation_123',
  })
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  returnUrl!: string;
}
