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
  @Transform(trimmed)
  @IsString()
  @Length(2, 200)
  keyword!: string;

  @IsOptional()
  @IsEnum(RuleAction)
  action?: RuleAction;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateFirewallRuleDto {
  @IsOptional()
  @IsEnum(RuleAction)
  action?: RuleAction;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AddFirewallSignatureDto {
  // The text whose likeness is blocked.
  @Transform(trimmed)
  @IsString()
  @Length(3, 2000)
  text!: string;

  @IsIn(SIGNATURE_CATEGORIES)
  category!: (typeof SIGNATURE_CATEGORIES)[number];
}
