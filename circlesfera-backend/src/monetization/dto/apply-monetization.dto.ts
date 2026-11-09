import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export const MONETIZATION_PITCH_MIN = 20;
export const MONETIZATION_PITCH_MAX = 500;

export class ApplyMonetizationDto {
  // What the Profile will sell or be tipped for, read by staff.
  @ApiProperty({
    minLength: MONETIZATION_PITCH_MIN,
    maxLength: MONETIZATION_PITCH_MAX,
  })
  @IsString()
  @MinLength(MONETIZATION_PITCH_MIN)
  @MaxLength(MONETIZATION_PITCH_MAX)
  pitch!: string;
}
