import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateTicketDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  subject!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsString()
  userId?: string;
}
