import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto.js';

export class AdminDisputesQueryDto extends PaginationDto {
  // open: the provider still expects or reviews an answer. closed: decided.
  @ApiProperty({ required: false, enum: ['open', 'closed'] })
  @IsOptional()
  @IsIn(['open', 'closed'])
  state?: 'open' | 'closed';
}
