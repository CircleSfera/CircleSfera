import { PostType } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto.js';

export class FindPostsQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(PostType)
  type?: PostType;
}
