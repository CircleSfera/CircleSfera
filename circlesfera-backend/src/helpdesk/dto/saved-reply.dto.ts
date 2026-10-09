import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** A new saved reply: its title, its text, and whether the team shares it. */
export class CreateSavedReplyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title!: string;

  // As long as an answer can be.
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body!: string;

  // Shared with the team instead of personal. Only who leads the team may.
  @IsOptional()
  @IsBoolean()
  shared?: boolean;
}

/** New words for a saved reply. Whose it is does not change. */
export class UpdateSavedReplyDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body?: string;
}
