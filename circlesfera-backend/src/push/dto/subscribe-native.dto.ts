import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

// The token Firebase Cloud Messaging gave the native app on this device.
export class SubscribeNativeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  token!: string;

  @IsIn(['ios', 'android'])
  platform!: 'ios' | 'android';
}
