import { IsNotEmpty, IsObject, IsString } from 'class-validator';

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
  @IsObject()
  keys!: PushSubscriptionKeysDto;
}
