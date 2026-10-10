import { IsIn, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto.js';

export class AdminDisputesQueryDto extends PaginationDto {
  // open: the provider still expects or reviews an answer. closed: decided.
  @IsOptional()
  @IsIn(['open', 'closed'])
  state?: 'open' | 'closed';
}
