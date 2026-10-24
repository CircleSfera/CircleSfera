import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Who gets the ticket. Without an agent, nobody has it. */
export class AgentAssignmentDto {
  @ApiProperty({
    required: false,
    type: () => String,
    nullable: true,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  agentRef?: string | null;
}
