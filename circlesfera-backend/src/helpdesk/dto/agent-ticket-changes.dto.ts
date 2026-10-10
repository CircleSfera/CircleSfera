import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** What an agent changes of a ticket without writing in it. */
export class AgentTicketChangesDto {
  @IsOptional()
  @IsIn(['OPEN', 'WAITING', 'RESOLVED', 'CLOSED'])
  status?: 'OPEN' | 'WAITING' | 'RESOLVED' | 'CLOSED';

  // Kept for app versions still open in a browser: an answer sent this way
  // becomes a message of the conversation.
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  reply?: string;

  @IsOptional()
  @IsIn(['LOW', 'NORMAL', 'HIGH'])
  priority?: 'LOW' | 'NORMAL' | 'HIGH';

  // The topic, when the requester chose the wrong one.
  @IsOptional()
  @IsIn(['ACCOUNT', 'PAYMENTS', 'CONTENT', 'OTHER'])
  category?: 'ACCOUNT' | 'PAYMENTS' | 'CONTENT' | 'OTHER';
}
