import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsUUID, Min } from 'class-validator';

export class VotePollDto {
  @IsUUID()
  @IsNotEmpty()
  pollId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  optionIndex!: number;
}
