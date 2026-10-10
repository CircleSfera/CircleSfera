import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** What a reader asks the help centre for. */
export class HelpCentreQueryDto {
  // The language of the reader, as the browser names it.
  @IsOptional()
  @IsString()
  @MaxLength(10)
  locale?: string;

  // Words to look for.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(['ACCOUNT', 'PAYMENTS', 'CONTENT', 'OTHER'])
  topic?: 'ACCOUNT' | 'PAYMENTS' | 'CONTENT' | 'OTHER';
}
