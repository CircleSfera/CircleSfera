import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class UpdateGroupDto {
  @ApiProperty({ required: false, type: () => String, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  // null takes the group's photo off.
  @ApiProperty({ required: false, type: () => String, format: 'uri' })
  @IsOptional()
  @IsString()
  @IsUrl({ require_tld: false })
  avatarUrl?: string | null;
}
