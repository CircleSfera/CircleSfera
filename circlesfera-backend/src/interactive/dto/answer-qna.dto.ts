import {
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class AnswerQnaDto {
  @IsUUID()
  @IsNotEmpty()
  qnaBoxId!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(2000)
  answerText!: string;
}
