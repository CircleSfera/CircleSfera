import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** A domain staff block for links on stories, and why. */
export class BlockLinkDomainDto {
  @ApiProperty({ required: true, type: () => String, maxLength: 253 })
  @IsString()
  @MaxLength(253)
  domain!: string;

  @ApiProperty({ required: false, type: () => String, maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
