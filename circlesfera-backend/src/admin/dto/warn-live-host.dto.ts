import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class WarnLiveHostDto {
  // What the host is told, as the staff member wrote it.
  @ApiProperty({
    required: true,
    type: () => String,
    minLength: 3,
    maxLength: 500,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(3, 500)
  reason!: string;
}
