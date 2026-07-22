import { IsOptional, IsString, MaxLength } from 'class-validator';

export class StartStreamDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
