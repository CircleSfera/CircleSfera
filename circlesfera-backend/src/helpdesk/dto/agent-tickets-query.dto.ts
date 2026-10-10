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

  @IsOptional()
  @IsString()
  @IsIn(['LOW', 'NORMAL', 'HIGH'])
  priority?: string;

  // mine: the tickets of who asks. unassigned: the ones nobody has.
  @IsOptional()
  @IsString()
  @IsIn(['mine', 'unassigned'])
  assignment?: string;

  // past: only the open tickets past their target.
  @IsOptional()
  @IsString()
  @IsIn(['past'])
  target?: string;
}
