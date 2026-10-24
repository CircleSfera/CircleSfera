import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ required: true, type: () => String })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ required: true, type: () => String, minLength: 8 })
  @IsString()
  @IsNotEmpty()
  // The same minimum as registration and every other password.
  @MinLength(8)
  newPassword!: string;
}
