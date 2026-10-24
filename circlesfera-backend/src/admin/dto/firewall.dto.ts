import { ApiProperty } from '@nestjs/swagger';
import { RuleAction } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// The kinds of content a signature can stand for: the ones the panel offers.
export const SIGNATURE_CATEGORIES = [
  'SPAM',
  'HATE',
  'SEXUAL',
  'VIOLENCE',
  'SCAM',
] as const;

export class CreateFirewallRuleDto {
  // The exact phrase the rule stops.
  @ApiProperty({
    required: true,
    type: () => String,
    minLength: 2,
    maxLength: 200,
  })
  @Transform(trimmed)
  @IsString()
  @Length(2, 200)
  keyword!: string;

  @ApiProperty({ required: false, enum: ['BLOCK', 'FLAG', 'MUTE'] })
  @IsOptional()
  @IsEnum(RuleAction)
  action?: RuleAction;

  @ApiProperty({ required: false, type: () => Boolean })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateFirewallRuleDto {
  @ApiProperty({ required: false, enum: ['BLOCK', 'FLAG', 'MUTE'] })
  @IsOptional()
  @IsEnum(RuleAction)
  action?: RuleAction;

  @ApiProperty({ required: false, type: () => Boolean })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AddFirewallSignatureDto {
  // The text whose likeness is blocked.
  @ApiProperty({
    required: true,
    type: () => String,
    minLength: 3,
    maxLength: 2000,
  })
  @Transform(trimmed)
  @IsString()
  @Length(3, 2000)
  text!: string;

  @ApiProperty({ required: true, enum: SIGNATURE_CATEGORIES })
  @IsIn(SIGNATURE_CATEGORIES)
  category!: (typeof SIGNATURE_CATEGORIES)[number];
}
