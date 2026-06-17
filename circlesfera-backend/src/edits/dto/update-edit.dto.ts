import { IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateEditDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsObject()
  @IsOptional()
  state?: Record<string, any>;
}
