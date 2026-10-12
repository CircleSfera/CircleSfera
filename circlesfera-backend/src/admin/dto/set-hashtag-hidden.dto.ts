import { IsBoolean } from 'class-validator';

export class SetHashtagHiddenDto {
  // True hides the hashtag from people; false shows it again.
  @IsBoolean()
  hidden!: boolean;
}
