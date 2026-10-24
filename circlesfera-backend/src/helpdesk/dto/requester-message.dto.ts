import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** What a requester adds to their own ticket. */
export class RequesterMessageDto {
  @ApiProperty({ required: true, type: () => String, maxLength: 5000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body!: string;
}
