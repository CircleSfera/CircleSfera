import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** What a reader asks the help centre for. */
export class HelpCentreQueryDto {
  // The language of the reader, as the browser names it.
  @ApiProperty({ required: false, type: () => String, maxLength: 10 })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  locale?: string;

  // Words to look for.
  @ApiProperty({ required: false, type: () => String, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiProperty({
    required: false,
    enum: ['ACCOUNT', 'PAYMENTS', 'CONTENT', 'OTHER'],
  })
  @IsOptional()
  @IsIn(['ACCOUNT', 'PAYMENTS', 'CONTENT', 'OTHER'])
  topic?: 'ACCOUNT' | 'PAYMENTS' | 'CONTENT' | 'OTHER';
}
