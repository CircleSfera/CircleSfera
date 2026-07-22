import { IsNotEmpty, IsString, IsUrl, MaxLength } from 'class-validator';

export class GenerateAltTextDto {
  @IsString()
  @IsNotEmpty()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  imageUrl!: string;
}
