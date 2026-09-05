import { IsNotEmpty, IsString } from 'class-validator';

export class StoryReactionDto {
  @IsString()
  @IsNotEmpty()
  reaction!: string; // Emoji e.g. "❤️"
}
