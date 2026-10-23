import {
  IsIn,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

// The device token Apple gave the iOS app on this device. The Android app has
// no push, so only iOS registers.
export class SubscribeNativeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Matches(/^[0-9a-f]+$/i)
  token!: string;

  @IsIn(['ios'])
  platform!: 'ios';
}
