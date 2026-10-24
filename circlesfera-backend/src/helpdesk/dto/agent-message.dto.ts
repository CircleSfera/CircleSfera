import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** What an agent adds to a ticket: an answer or an internal note. */
export class AgentMessageDto {
  @ApiProperty({ required: true, type: () => String, maxLength: 5000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body!: string;

  // PUBLIC: an answer the requester receives. INTERNAL: a note only agents see.
  @ApiProperty({ required: true, enum: ['PUBLIC', 'INTERNAL'] })
  @IsIn(['PUBLIC', 'INTERNAL'])
  visibility!: 'PUBLIC' | 'INTERNAL';

  // The state an answer leaves the ticket in: open, waiting for the
  // requester, or solved. Without one the ticket is solved. A note never
  // changes the state.
  @ApiProperty({ required: false, enum: ['OPEN', 'WAITING', 'RESOLVED'] })
  @IsOptional()
  @IsIn(['OPEN', 'WAITING', 'RESOLVED'])
  status?: 'OPEN' | 'WAITING' | 'RESOLVED';
}
