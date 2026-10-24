import { ApiProperty } from '@nestjs/swagger';
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
  @ApiProperty({ required: false, type: () => String, format: 'email' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: true, type: () => String, maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  subject!: string;

  @ApiProperty({ required: true, type: () => String, maxLength: 2000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;

  // What the ticket is about; a ticket without one is filed under OTHER.
  @ApiProperty({
    required: false,
    enum: ['OTHER', 'ACCOUNT', 'PAYMENTS', 'CONTENT'],
  })
  @IsOptional()
  @IsEnum(TicketCategory)
  category?: TicketCategory;

  @ApiProperty({ required: false, type: () => String })
  @IsOptional()
  @IsString()
  userId?: string;
}
