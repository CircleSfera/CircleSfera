import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto.js';

export class AgentTicketsQueryDto extends PaginationDto {
  @ApiProperty({ required: false, type: () => String })
  @IsOptional()
  @IsString()
  status?: string;

  // What the ticket is about.
  @ApiProperty({
    required: false,
    type: () => String,
    enum: ['ACCOUNT', 'PAYMENTS', 'CONTENT', 'OTHER'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['ACCOUNT', 'PAYMENTS', 'CONTENT', 'OTHER'])
  category?: string;

  @ApiProperty({
    required: false,
    type: () => String,
    enum: ['LOW', 'NORMAL', 'HIGH'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['LOW', 'NORMAL', 'HIGH'])
  priority?: string;

  // mine: the tickets of who asks. unassigned: the ones nobody has.
  @ApiProperty({
    required: false,
    type: () => String,
    enum: ['mine', 'unassigned'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['mine', 'unassigned'])
  assignment?: string;

  // past: only the open tickets past their target.
  @ApiProperty({ required: false, type: () => String, enum: ['past'] })
  @IsOptional()
  @IsString()
  @IsIn(['past'])
  target?: string;
}
