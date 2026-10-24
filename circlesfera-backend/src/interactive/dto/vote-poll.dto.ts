import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsUUID, Min } from 'class-validator';

export class VotePollDto {
  @ApiProperty({ required: true, type: () => String, format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  pollId!: string;

  @ApiProperty({ required: true, type: () => Number, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  optionIndex!: number;
}
