import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

// Whose upcoming lives are asked for.
export class ScheduledLivesQueryDto {
  @ApiProperty({ type: () => String, format: 'uuid' })
  @IsUUID()
  profileId!: string;
}
