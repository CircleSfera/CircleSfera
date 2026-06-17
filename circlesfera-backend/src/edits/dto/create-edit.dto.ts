import { IsObject, IsOptional, IsString } from 'class-validator';

export class CreateEditDto {
  @IsString()
  mediaUrl!: string;

  @IsString()
  @IsOptional()
  mediaType?: string = 'image';

  @IsString()
  @IsOptional()
  name?: string;

  @IsObject()
  state!: Record<string, any>;
}
