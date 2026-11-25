import { ApiProperty } from '@nestjs/swagger';
import { Equals } from 'class-validator';

// Starting the free year: the person accepts its terms, as the app shows
// them (FREE_YEAR_CONSENT_VERSION). A request without the acceptance is
// refused.
export class StartFreeYearDto {
  @ApiProperty({ required: true, enum: [true] })
  @Equals(true)
  accept!: true;
}
