import { IsNotEmpty, IsString } from 'class-validator';

export class StoryReactionDto {
  @IsString()
  @IsNotEmpty()
  reaction!: string; // emoji e.g. "❤️"
}
