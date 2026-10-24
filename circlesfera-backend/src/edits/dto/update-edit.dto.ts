import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateEditDto {
  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false, type: Object, additionalProperties: true })
  @IsObject()
  @IsOptional()
  state?: Record<string, any>;
}
