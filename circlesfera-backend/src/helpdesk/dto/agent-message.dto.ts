import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** What an agent adds to a ticket: an answer or an internal note. */
export class AgentMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body!: string;

  // PUBLIC: an answer the requester receives. INTERNAL: a note only agents see.
  @IsIn(['PUBLIC', 'INTERNAL'])
  visibility!: 'PUBLIC' | 'INTERNAL';

  // The state an answer leaves the ticket in. Without one the ticket is
  // solved. A note never changes the state.
  @IsOptional()
  @IsIn(['OPEN', 'RESOLVED'])
  status?: 'OPEN' | 'RESOLVED';
}
