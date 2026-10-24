import { ApiProperty } from '@nestjs/swagger';
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
  @ApiProperty({
    required: true,
    type: () => String,
    maxLength: 200,
    pattern: '^[0-9a-f]+$',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Matches(/^[0-9a-f]+$/i)
  token!: string;

  @ApiProperty({ required: true, enum: ['ios'] })
  @IsIn(['ios'])
  platform!: 'ios';
}
