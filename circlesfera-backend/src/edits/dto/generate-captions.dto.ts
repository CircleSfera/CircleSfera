import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GenerateCaptionsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  clipId!: string;
}
