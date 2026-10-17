import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class DecideIllegalNoticeDto {
  @IsIn(['ACTIONED', 'NO_ACTION'])
  outcome!: 'ACTIONED' | 'NO_ACTION';

  // The reasons, sent to the notifier as written.
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  reasons!: string;
}
