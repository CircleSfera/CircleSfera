import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** A new saved reply: its title, its text, and whether the team shares it. */
export class CreateSavedReplyDto {
  @ApiProperty({ required: true, type: () => String, maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title!: string;

  // As long as an answer can be.
  @ApiProperty({ required: true, type: () => String, maxLength: 5000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body!: string;

  // Shared with the team instead of personal. Only who leads the team may.
  @ApiProperty({ required: false, type: () => Boolean })
  @IsOptional()
  @IsBoolean()
  shared?: boolean;
}

/** New words for a saved reply. Whose it is does not change. */
export class UpdateSavedReplyDto {
  @ApiProperty({ required: false, type: () => String, maxLength: 120 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title?: string;

  @ApiProperty({ required: false, type: () => String, maxLength: 5000 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body?: string;
}
