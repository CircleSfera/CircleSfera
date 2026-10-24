import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/** Whether an article of the help centre helped its reader. */
export class ArticleFeedbackDto {
  @ApiProperty({ required: true, type: () => Boolean })
  @IsBoolean()
  useful!: boolean;
}
