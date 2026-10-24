import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateCommentDto {
  @ApiProperty({ required: true, type: () => String, maxLength: 1000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  content!: string;
}
