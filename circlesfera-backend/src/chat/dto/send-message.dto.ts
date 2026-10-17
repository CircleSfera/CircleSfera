import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SendMessageDto {
  @IsString()
  @IsOptional()
  recipientId?: string;

  @IsString()
  @IsOptional()
  conversationId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content!: string;

  @IsString()
  @IsOptional()
  tempId?: string;

  @IsString()
  @IsOptional()
  mediaUrl?: string;

  @IsString()
  @IsOptional()
  mediaType?: string;

  @IsString()
  @IsOptional()
  postId?: string;

  @IsString()
  @IsOptional()
  storyId?: string;

  @IsString()
  @IsOptional()
  replyToId?: string;

  // A voice note: the address of the uploaded recording, its length and the
  // bars the app draws for it. The bounds are safety limits, not a product
  // limit on how long a note may be.
  @IsUrl({ require_protocol: true, protocols: ['https', 'http'] })
  @MaxLength(2048)
  @IsOptional()
  voiceUrl?: string;

  @IsInt()
  @Min(1)
  @Max(3600)
  @IsOptional()
  voiceDuration?: number;

  @IsArray()
  @ArrayMaxSize(64)
  @IsNumber({}, { each: true })
  @Min(0, { each: true })
  @Max(1, { each: true })
  @IsOptional()
  voiceWaveform?: number[];

  @IsBoolean()
  @IsOptional()
  isLocked?: boolean;

  @IsInt()
  @Min(0)
  @IsOptional()
  priceCents?: number;
}
