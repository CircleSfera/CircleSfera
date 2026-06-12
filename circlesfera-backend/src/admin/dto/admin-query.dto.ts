import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto.js';

export class AdminQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  @IsIn(['POST', 'FRAME', 'STORY', 'COMMENT'])
  type?: string;

  @IsOptional()
  @IsString()
  moderationStatus?: string;
}
