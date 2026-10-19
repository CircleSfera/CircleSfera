import { IsUUID, ValidateIf } from 'class-validator';

// Who is invited: the Profile named, or, from an older app, the first
// Profile of a person. One of the two is required.
export class InviteCoHostDto {
  @ValidateIf((o: InviteCoHostDto) => !o.coHostUserId)
  @IsUUID()
  coHostProfileId?: string;

  @ValidateIf((o: InviteCoHostDto) => !o.coHostProfileId)
  @IsUUID()
  coHostUserId?: string;
}
