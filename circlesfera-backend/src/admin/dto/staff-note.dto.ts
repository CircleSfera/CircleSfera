import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class CreateStaffNoteDto {
  // What the staff member wants the rest of the staff to know.
  @ApiProperty({
    required: true,
    type: () => String,
    minLength: 1,
    maxLength: 2000,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 2000)
  body!: string;
}
