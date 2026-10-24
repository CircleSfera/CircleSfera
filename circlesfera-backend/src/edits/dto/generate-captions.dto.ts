import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GenerateCaptionsDto {
  @ApiProperty({ required: true, type: () => String, maxLength: 128 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  clipId!: string;
}
