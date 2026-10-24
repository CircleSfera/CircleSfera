import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateProfileDto {
  @ApiProperty({
    required: true,
    type: () => String,
    minLength: 3,
    maxLength: 30,
    pattern: '^[a-zA-Z0-9._]+$',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9._]+$/, {
    message: 'Username can only contain letters, numbers, dots and underscores',
  })
  username!: string;

  @ApiProperty({ required: false, type: () => String, maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  fullName?: string;

  @ApiProperty({ required: false, type: () => String, maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  bio?: string;

  @ApiProperty({ required: false, type: () => String, minLength: 1 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  avatar?: string;

  @ApiProperty({
    required: false,
    type: () => String,
    nullable: true,
    format: 'uri',
  })
  @IsOptional()
  @IsUrl()
  @ValidateIf(
    (o: CreateProfileDto) => o.website !== null && o.website !== undefined,
  )
  website?: string | null;

  @ApiProperty({
    required: false,
    type: () => String,
    nullable: true,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string | null;

  @ApiProperty({ required: false, enum: ['PERSONAL', 'CREATOR', 'BUSINESS'] })
  @IsOptional()
  @IsIn(['PERSONAL', 'CREATOR', 'BUSINESS'])
  accountType?: 'PERSONAL' | 'CREATOR' | 'BUSINESS';
}
