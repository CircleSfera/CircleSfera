import type { LoginDto as ILoginDto } from '@circlesfera/shared';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto implements ILoginDto {
  @ApiProperty({ required: true, type: () => String })
  @IsString()
  @Transform(({ value }) => value?.trim().toLowerCase())
  identifier!: string;

  @ApiProperty({ required: true, type: () => String, minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ required: false, type: () => String })
  @IsOptional()
  @IsString()
  twoFactorCode?: string;

  @ApiProperty({ required: false, type: () => String })
  @IsOptional()
  @IsString()
  captchaToken?: string;

  @ApiProperty({ required: false, type: () => String })
  @IsOptional()
  @IsString()
  visitorId?: string;
}
