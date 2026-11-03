import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, ValidateIf } from 'class-validator';

// Who is invited to be a guest: the Profile named, or the first Profile of
// a person. One of the two is required, and each one given must be an id.
export class InviteGuestDto {
  @ApiProperty({ required: false, type: () => String, format: 'uuid' })
  @ValidateIf(
    (o: InviteGuestDto) => o.profileId !== undefined || o.userId === undefined,
  )
  @IsUUID()
  profileId?: string;

  @ApiProperty({ required: false, type: () => String, format: 'uuid' })
  @ValidateIf(
    (o: InviteGuestDto) => o.userId !== undefined || o.profileId === undefined,
  )
  @IsUUID()
  userId?: string;
}
