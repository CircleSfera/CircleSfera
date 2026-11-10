import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

// A place of the map as the app sends it: chosen with the place search for a
// post, a story or a Business Profile's address.
export class PlaceTranslationDto {
  @ApiProperty({ required: true, enum: ['en', 'es'] })
  @IsIn(['en', 'es'])
  locale!: 'en' | 'es';

  @ApiProperty({ required: true, type: () => String, maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ required: false, type: () => String, maxLength: 300 })
  @IsString()
  @IsOptional()
  @MaxLength(300)
  fullName?: string;

  @ApiProperty({ required: false, type: () => String, maxLength: 120 })
  @IsString()
  @IsOptional()
  @MaxLength(120)
  country?: string;

  @ApiProperty({ required: false, type: () => String, maxLength: 120 })
  @IsString()
  @IsOptional()
  @MaxLength(120)
  region?: string;

  @ApiProperty({ required: false, type: () => String, maxLength: 120 })
  @IsString()
  @IsOptional()
  @MaxLength(120)
  locality?: string;
}

export class PlaceInputDto {
  @ApiProperty({ required: true, type: () => String })
  @IsString()
  @IsNotEmpty()
  mapboxId!: string;

  @ApiProperty({ required: true, type: () => String })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  fullName?: string;

  @ApiProperty({ required: true, type: () => Number })
  @IsNumber()
  latitude!: number;

  @ApiProperty({ required: true, type: () => Number })
  @IsNumber()
  longitude!: number;

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  region?: string;

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  locality?: string;

  // The same names per language, as the map provider gave them.
  @ApiProperty({
    required: false,
    type: () => [PlaceTranslationDto],
    maxItems: 2,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => PlaceTranslationDto)
  translations?: PlaceTranslationDto[];
}
