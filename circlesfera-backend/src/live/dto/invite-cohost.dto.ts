import { IsUUID, ValidateIf } from 'class-validator';

// Who is invited: the Profile named, or, from an older app, the first
// Profile of a person. One of the two is required, and each one given must
// be an id.
export class InviteCoHostDto {
  @ValidateIf(
    (o: InviteCoHostDto) =>
      o.coHostProfileId !== undefined || o.coHostUserId === undefined,
  )
  @IsUUID()
  coHostProfileId?: string;

  @ValidateIf(
    (o: InviteCoHostDto) =>
      o.coHostUserId !== undefined || o.coHostProfileId === undefined,
  )
  @IsUUID()
  coHostUserId?: string;
}
