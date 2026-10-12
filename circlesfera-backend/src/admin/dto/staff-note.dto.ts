import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class CreateStaffNoteDto {
  // What the staff member wants the rest of the staff to know.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 2000)
  body!: string;
}
