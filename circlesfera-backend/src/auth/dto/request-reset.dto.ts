import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class RequestResetDto {
  @ApiProperty({ required: true, type: () => String, format: 'email' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}
