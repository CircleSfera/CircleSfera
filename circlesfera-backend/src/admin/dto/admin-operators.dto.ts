import { ApiProperty } from '@nestjs/swagger';
import { AdminIdentityStatus } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateAdminOperatorDto {
  @ApiProperty({ required: true, type: () => String, format: 'email' })
  @IsEmail()
  email!: string;

  @ApiProperty({ required: true, type: () => String, minLength: 1 })
  @IsString()
  @MinLength(1)
  displayName!: string;

  @ApiProperty({ required: true, type: () => [String], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  roleIds!: string[];
}

export class UpdateAdminOperatorStatusDto {
  @ApiProperty({ required: true, enum: ['ACTIVE', 'DISABLED'] })
  @IsEnum(AdminIdentityStatus)
  status!: AdminIdentityStatus;
}

export class ReplaceAdminOperatorRolesDto {
  @ApiProperty({ required: true, type: () => [String], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  roleIds!: string[];
}

export class ListAdminOperatorsQueryDto {
  @ApiProperty({ required: false, type: () => String })
  @IsOptional()
  page?: string;

  @ApiProperty({ required: false, type: () => String })
  @IsOptional()
  limit?: string;

  @ApiProperty({ required: false, type: () => String })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, type: () => String })
  @IsOptional()
  @IsString()
  status?: string;
}
