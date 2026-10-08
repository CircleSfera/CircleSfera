import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** What a requester adds to their own ticket. */
export class RequesterMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body!: string;
}
