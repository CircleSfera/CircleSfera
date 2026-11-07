import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateStudioTemplateDto {
  @ApiProperty({ required: false, type: () => String, maxLength: 80 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false, type: () => Boolean })
  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;
}
