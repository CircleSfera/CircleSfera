import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class InviteCollaboratorDto {
  // The username of the Profile invited to author the post too.
  @ApiProperty({ type: () => String, maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  username!: string;
}
