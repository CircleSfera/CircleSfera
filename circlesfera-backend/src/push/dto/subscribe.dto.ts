import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  Allow,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class PushSubscriptionKeysDto {
  @ApiProperty({ required: true, type: () => String })
  @IsNotEmpty()
  @IsString()
  p256dh!: string;

  @ApiProperty({ required: true, type: () => String })
  @IsNotEmpty()
  @IsString()
  auth!: string;
}

export class SubscribePushDto {
  @ApiProperty({ required: true, type: () => String })
  @IsNotEmpty()
  @IsString()
  endpoint!: string;

  @ApiProperty({ required: true, type: () => PushSubscriptionKeysDto })
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;

  // Present on `PushSubscription.toJSON()`; ignored by persistence.
  @ApiProperty({ required: false, type: () => Number, nullable: true })
  @IsOptional()
  @Allow()
  expirationTime?: number | null;
}
