import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class AnswerQnaDto {
  @ApiProperty({ required: true, type: () => String, format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  qnaBoxId!: string;

  @ApiProperty({
    required: true,
    type: () => String,
    minLength: 1,
    maxLength: 2000,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(2000)
  answerText!: string;
}
