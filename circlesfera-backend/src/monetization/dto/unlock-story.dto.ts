import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UnlockStoryDto {
  @ApiProperty({ required: true, type: () => String })
  @IsString()
  @IsNotEmpty()
  storyId!: string;

  @ApiProperty({ required: true, type: () => String })
  @IsString()
  @IsNotEmpty()
  returnUrl!: string;

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  idempotencyKey?: string;

  // The buyer consents to start at once and acknowledges losing the right of
  // withdrawal; without it the purchase is refused.
  @ApiProperty({ required: true, type: () => Boolean })
  @Equals(true, { message: 'withdrawalConsent must be true' })
  withdrawalConsent!: true;
}
