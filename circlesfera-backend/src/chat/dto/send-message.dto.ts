import { ApiProperty } from '@nestjs/swagger';
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
  ValidateIf,
} from 'class-validator';
import { LOCAL_UPLOAD_URL } from '../../common/constants/local-upload.constants.js';

export class SendMessageDto {
  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  recipientId?: string;

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  conversationId?: string;

  @ApiProperty({ required: true, type: () => String, maxLength: 5000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content!: string;

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  tempId?: string;

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  mediaUrl?: string;

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  mediaType?: string;

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  postId?: string;

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  storyId?: string;

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  replyToId?: string;

  // A voice note: the address of the uploaded recording, its length and the
  // bars the app draws for it. The bounds are safety limits, not a product
  // limit on how long a note may be. The address is the one the upload
  // answered: /uploads/<uuid>.<ext> when the server keeps files on its disk,
  // as production does, or a full http(s) address from another storage.
  @ValidateIf(
    (dto: SendMessageDto) =>
      typeof dto.voiceUrl !== 'string' || !LOCAL_UPLOAD_URL.test(dto.voiceUrl),
  )
  @ApiProperty({
    required: false,
    type: () => String,
    maxLength: 2048,
    format: 'uri',
  })
  @IsUrl({ require_protocol: true, protocols: ['https', 'http'] })
  @MaxLength(2048)
  @IsOptional()
  voiceUrl?: string;

  @ApiProperty({
    required: false,
    type: () => Number,
    minimum: 1,
    maximum: 3600,
  })
  @IsInt()
  @Min(1)
  @Max(3600)
  @IsOptional()
  voiceDuration?: number;

  @ApiProperty({
    required: false,
    type: () => [Number],
    minimum: 0,
    maximum: 1,
    maxItems: 64,
  })
  @IsArray()
  @ArrayMaxSize(64)
  @IsNumber({}, { each: true })
  @Min(0, { each: true })
  @Max(1, { each: true })
  @IsOptional()
  voiceWaveform?: number[];

  @ApiProperty({ required: false, type: () => Boolean })
  @IsBoolean()
  @IsOptional()
  isLocked?: boolean;

  @ApiProperty({ required: false, type: () => Number, minimum: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  priceCents?: number;
}
