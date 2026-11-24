import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/**
 * What staff can change in a platform plan: whether it is on sale. What it
 * includes, its description and its price are the plan catalog's
 * (circlesfera-backend/scripts/plan-catalog.ts), set on every deploy by the
 * catalog sync, which would undo any other change made here.
 */
export class UpdatePlanDto {
  @ApiProperty({ type: () => Boolean })
  @IsBoolean()
  isActive!: boolean;
}
