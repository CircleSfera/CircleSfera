import { TicketCategory } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateTicketDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  subject!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;

  // What the ticket is about; a ticket without one is filed under OTHER.
  @IsOptional()
  @IsEnum(TicketCategory)
  category?: TicketCategory;

  @IsOptional()
  @IsString()
  userId?: string;
}
