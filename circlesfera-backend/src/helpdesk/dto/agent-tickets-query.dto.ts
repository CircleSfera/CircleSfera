import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto.js';

export class AgentTicketsQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  status?: string;

  // What the ticket is about.
  @IsOptional()
  @IsString()
  @IsIn(['ACCOUNT', 'PAYMENTS', 'CONTENT', 'OTHER'])
  category?: string;
}
