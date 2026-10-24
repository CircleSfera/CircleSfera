import { ApiProperty } from '@nestjs/swagger';
import { PostType } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto.js';

export class FindPostsQueryDto extends PaginationDto {
  @ApiProperty({ required: false, enum: ['POST', 'FRAME'] })
  @IsOptional()
  @IsEnum(PostType)
  type?: PostType;
}
