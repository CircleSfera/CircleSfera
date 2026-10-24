import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetHashtagHiddenDto {
  // True hides the hashtag from people; false shows it again.
  @ApiProperty({ required: true, type: () => Boolean })
  @IsBoolean()
  hidden!: boolean;
}
