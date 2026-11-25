import {
  FOUNDING_CREATOR_CITY_MAX_LENGTH,
  FOUNDING_CREATOR_CITY_MIN_LENGTH,
  FOUNDING_CREATOR_LINK_MAX_LENGTH,
  FOUNDING_CREATOR_LINKS_MAX,
  FOUNDING_CREATOR_LINKS_MIN,
  FOUNDING_CREATOR_NOTE_MAX_LENGTH,
} from '@circlesfera/shared';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// An application to be a founding creator: 1 to 3 links to the Profile's
// work (web addresses with http or https), its city and a short note.
export class ApplyFoundingCreatorDto {
  @ApiProperty({
    type: [String],
    minItems: FOUNDING_CREATOR_LINKS_MIN,
    maxItems: FOUNDING_CREATOR_LINKS_MAX,
  })
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((link) => (typeof link === 'string' ? link.trim() : link))
      : value,
  )
  @IsArray()
  @ArrayMinSize(FOUNDING_CREATOR_LINKS_MIN)
  @ArrayMaxSize(FOUNDING_CREATOR_LINKS_MAX)
  @IsString({ each: true })
  @MaxLength(FOUNDING_CREATOR_LINK_MAX_LENGTH, { each: true })
  @IsUrl(
    {
      protocols: ['http', 'https'],
      require_protocol: true,
      require_tld: true,
      allow_underscores: true,
    },
    { each: true },
  )
  links!: string[];

  @ApiProperty({
    minLength: FOUNDING_CREATOR_CITY_MIN_LENGTH,
    maxLength: FOUNDING_CREATOR_CITY_MAX_LENGTH,
  })
  @Transform(trimmed)
  @IsString()
  @MinLength(FOUNDING_CREATOR_CITY_MIN_LENGTH)
  @MaxLength(FOUNDING_CREATOR_CITY_MAX_LENGTH)
  city!: string;

  @ApiProperty({ required: false, maxLength: FOUNDING_CREATOR_NOTE_MAX_LENGTH })
  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(FOUNDING_CREATOR_NOTE_MAX_LENGTH)
  note?: string;
}
