import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class DecideIllegalNoticeDto {
  @ApiProperty({ required: true, enum: ['ACTIONED', 'NO_ACTION'] })
  @IsIn(['ACTIONED', 'NO_ACTION'])
  outcome!: 'ACTIONED' | 'NO_ACTION';

  // The reasons, sent to the notifier as written.
  @ApiProperty({
    required: true,
    type: () => String,
    minLength: 10,
    maxLength: 5000,
  })
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  reasons!: string;
}
