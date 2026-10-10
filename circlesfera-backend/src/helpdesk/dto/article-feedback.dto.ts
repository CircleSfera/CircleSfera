import { IsBoolean } from 'class-validator';

/** Whether an article of the help centre helped its reader. */
export class ArticleFeedbackDto {
  @IsBoolean()
  useful!: boolean;
}
