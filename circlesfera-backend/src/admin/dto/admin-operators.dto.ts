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
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(12)
  password!: string;

  @IsString()
  @MinLength(1)
  displayName!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  roleIds!: string[];
}

export class UpdateAdminOperatorStatusDto {
  @IsEnum(AdminIdentityStatus)
  status!: AdminIdentityStatus;
}

export class ReplaceAdminOperatorRolesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  roleIds!: string[];
}

export class ResetAdminOperatorPasswordDto {
  @IsString()
  @MinLength(12)
  password!: string;
}

export class ListAdminOperatorsQueryDto {
  @IsOptional()
  page?: string;

  @IsOptional()
  limit?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
