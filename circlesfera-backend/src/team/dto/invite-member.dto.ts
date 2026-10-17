import { $Enums } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

// The owner invites a person who has an account, named by the username of
// one of their Profiles, with a role.
export class InviteMemberDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(/^@/, '') : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9._]+$/)
  username!: string;

  @IsEnum($Enums.ProfileMemberRole)
  role!: $Enums.ProfileMemberRole;
}
