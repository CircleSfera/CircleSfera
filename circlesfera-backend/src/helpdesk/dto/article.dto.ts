import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const TOPICS = ['ACCOUNT', 'PAYMENTS', 'CONTENT', 'OTHER'] as const;

/** The words of an article in one language. Either may still be empty in a draft. */
export class ArticleTextDto {
  @ApiProperty({
    required: true,
    type: () => String,
    pattern: '^[a-z]{2}(-[A-Z]{2})?$',
  })
  @IsString()
  @Matches(/^[a-z]{2}(-[A-Z]{2})?$/)
  locale!: string;

  @ApiProperty({ required: true, type: () => String, maxLength: 150 })
  @IsString()
  @MaxLength(150)
  title!: string;

  @ApiProperty({ required: true, type: () => String, maxLength: 20000 })
  @IsString()
  @MaxLength(20000)
  body!: string;
}

export class CreateArticleDto {
  // Its name in its address: lowercase letters, numbers and hyphens.
  @ApiProperty({
    required: true,
    type: () => String,
    maxLength: 120,
    pattern: '^[a-z0-9]+(-[a-z0-9]+)*$',
  })
  @IsString()
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  slug!: string;

  @ApiProperty({ required: true, enum: TOPICS })
  @IsIn(TOPICS)
  topic!: (typeof TOPICS)[number];

  @ApiProperty({
    required: false,
    type: () => Number,
    minimum: 0,
    maximum: 9999,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  position?: number;

  @ApiProperty({ required: true, type: () => [ArticleTextDto], maxItems: 10 })
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ArticleTextDto)
  texts!: ArticleTextDto[];
}

/** New topic, place or words. The address of an article does not change. */
export class UpdateArticleDto {
  @ApiProperty({ required: false, enum: TOPICS })
  @IsOptional()
  @IsIn(TOPICS)
  topic?: (typeof TOPICS)[number];

  @ApiProperty({
    required: false,
    type: () => Number,
    minimum: 0,
    maximum: 9999,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  position?: number;

  @ApiProperty({ required: false, type: () => [ArticleTextDto], maxItems: 10 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ArticleTextDto)
  texts?: ArticleTextDto[];
}
