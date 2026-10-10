import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Who gets the ticket. Without an agent, nobody has it. */
export class AgentAssignmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  agentRef?: string | null;
}
