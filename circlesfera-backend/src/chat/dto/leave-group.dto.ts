import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

// Leaving a group: an admin may name the member who becomes admin after
// them, a Profile id. Without one the group still gets an admin.
export class LeaveGroupDto {
  @ApiProperty({ required: false, type: () => String, maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  successorId?: string;
}

// Deleting a conversation removes it from the caller's inbox only; in a
// group it is leaving it, with the same optional successor. The mode is
// kept for the apps that send it.
export class DeleteConversationDto extends LeaveGroupDto {
  @ApiProperty({ required: false, enum: ['me', 'both'] })
  @IsOptional()
  @IsIn(['me', 'both'])
  mode?: 'me' | 'both';
}
