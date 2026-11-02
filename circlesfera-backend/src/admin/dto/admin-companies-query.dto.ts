import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto.js';

export class AdminCompaniesQueryDto extends PaginationDto {
  // Part of the handle or the name of a Business Profile.
  @ApiProperty({ required: false, maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  search?: string;
}
