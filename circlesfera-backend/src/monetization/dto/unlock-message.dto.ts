import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class UnlockMessageDto {
  @ApiProperty({ required: true, type: () => String })
  @ApiProperty({
    description: 'The ID of the message to unlock',
    example: 'msg_123',
  })
  @IsString()
  @IsNotEmpty()
  messageId!: string;

  @ApiProperty({ required: true, type: () => String, format: 'uri' })
  @ApiProperty({
    description: 'The URL to return to after Stripe checkout',
    example: 'https://circlesfera.com/chat/conversation_123',
  })
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  returnUrl!: string;

  // The buyer consents to start at once and acknowledges losing the right of
  // withdrawal; without it the purchase is refused.
  @ApiProperty({ required: true, type: () => Boolean })
  @Equals(true, { message: 'withdrawalConsent must be true' })
  withdrawalConsent!: true;
}
