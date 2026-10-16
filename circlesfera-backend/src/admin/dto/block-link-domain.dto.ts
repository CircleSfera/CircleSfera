import { IsOptional, IsString, MaxLength } from 'class-validator';

/** A domain staff block for links on stories, and why. */
export class BlockLinkDomainDto {
  @IsString()
  @MaxLength(253)
  domain!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
