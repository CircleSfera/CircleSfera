import { IsIn, IsOptional } from 'class-validator';

/** The period of the figures: the last 7 days, or the last 30. */
export class FiguresQueryDto {
  @IsOptional()
  @IsIn(['7', '30'])
  days?: '7' | '30';
}
