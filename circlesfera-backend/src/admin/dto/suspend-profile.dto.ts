import { SuspensionCause } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const MIN_PROFILE_SUSPENSION_DAYS = 1;
export const MAX_PROFILE_SUSPENSION_DAYS = 30;

export class SuspendProfileDto {
  // One of the serious causes; there is no open "other".
  @IsEnum(SuspensionCause)
  cause!: SuspensionCause;

  @IsInt()
  @Min(MIN_PROFILE_SUSPENSION_DAYS)
  @Max(MAX_PROFILE_SUSPENSION_DAYS)
  days!: number;

  // What the staff member saw. Kept in the audit log, never shown to the Profile.
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  note!: string;
}
