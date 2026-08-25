import { Type } from 'class-transformer';
import {
  Allow,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class PushSubscriptionKeysDto {
  @IsNotEmpty()
  @IsString()
  p256dh!: string;

  @IsNotEmpty()
  @IsString()
  auth!: string;
}

export class SubscribePushDto {
  @IsNotEmpty()
  @IsString()
  endpoint!: string;

  @IsNotEmpty()
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;

  /** Present on `PushSubscription.toJSON()`; ignored by persistence. */
  @IsOptional()
  @Allow()
  expirationTime?: number | null;
}
