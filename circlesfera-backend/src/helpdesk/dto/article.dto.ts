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
  @IsString()
  @Matches(/^[a-z]{2}(-[A-Z]{2})?$/)
  locale!: string;

  @IsString()
  @MaxLength(150)
  title!: string;

  @IsString()
  @MaxLength(20000)
  body!: string;
}

export class CreateArticleDto {
  // Its name in its address: lowercase letters, numbers and hyphens.
  @IsString()
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  slug!: string;

  @IsIn(TOPICS)
  topic!: (typeof TOPICS)[number];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  position?: number;

  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ArticleTextDto)
  texts!: ArticleTextDto[];
}

/** New topic, place or words. The address of an article does not change. */
export class UpdateArticleDto {
  @IsOptional()
  @IsIn(TOPICS)
  topic?: (typeof TOPICS)[number];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  position?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ArticleTextDto)
  texts?: ArticleTextDto[];
}
