import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto.js';

/** DTO for retrieving posts with pagination and sorting. */
export class GetPostsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @IsIn(['latest', 'trending'])
  sort?: 'latest' | 'trending';
}
