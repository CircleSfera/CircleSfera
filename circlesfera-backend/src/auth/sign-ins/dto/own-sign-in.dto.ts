import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SignInProofDto } from './sign-in-proof.dto.js';

/** A Profile gets its own email and password. */
export class OwnSignInDto extends SignInProofDto {
  @ApiProperty({ required: true, type: () => String, format: 'uuid' })
  @IsUUID()
  profileId!: string;

  @ApiProperty({
    required: true,
    type: () => String,
    maxLength: 254,
    format: 'email',
  })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    required: true,
    type: () => String,
    minLength: 8,
    maxLength: 128,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
