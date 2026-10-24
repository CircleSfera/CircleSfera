import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class TypingEventDto {
  @ApiProperty({ required: true, type: () => String, maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  conversationId!: string;

  @ApiProperty({ required: true, type: () => String, maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  recipientId!: string;
}

export class SendReactionDto {
  @ApiProperty({ required: true, type: () => String, maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  messageId!: string;

  @ApiProperty({ required: true, type: () => String, maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  conversationId!: string;

  @ApiProperty({ required: true, type: () => String, maxLength: 32 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  reaction!: string;
}

export class MarkReadDto {
  @ApiProperty({ required: true, type: () => String, maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  conversationId!: string;

  @ApiProperty({ required: true, type: () => String, maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  recipientId!: string;
}

export class CallInviteDto {
  @ApiProperty({ required: false, type: () => String, maxLength: 64 })
  @IsString()
  @IsOptional()
  @MaxLength(64)
  targetId?: string;

  @ApiProperty({ required: false, type: () => String, maxLength: 64 })
  @IsString()
  @IsOptional()
  @MaxLength(64)
  recipientId?: string;

  @ApiProperty({ required: false, enum: ['audio', 'video'] })
  @IsOptional()
  @IsIn(['audio', 'video'])
  type?: 'audio' | 'video';
}

export class CallAcceptDeclineDto {
  @ApiProperty({ required: true, type: () => String, maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  callerId!: string;
}

export class CallSignalDto {
  @ApiProperty({ required: true, type: () => String, maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  targetId!: string;

  @ApiProperty({ required: true, type: () => Object })
  signal!: unknown;
}

export class CallHangupDto {
  @ApiProperty({ required: true, type: () => String, maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  targetId!: string;
}

export class LiveStreamIdDto {
  @ApiProperty({ required: true, type: () => String, maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  streamId!: string;
}

export class LiveChatDto {
  @ApiProperty({ required: true, type: () => String, maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  streamId!: string;

  @ApiProperty({ required: true, type: () => String, maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  message!: string;
}

export class LivePinCommentDto {
  @ApiProperty({ required: true, type: () => String, maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  streamId!: string;

  @ApiProperty({ required: true, type: () => String, maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  commentId!: string;

  @ApiProperty({ required: true, type: () => String, maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  message!: string;

  @ApiProperty({ required: true, type: () => String, maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username!: string;

  @ApiProperty({ required: false, type: () => String, maxLength: 2048 })
  @IsString()
  @IsOptional()
  @MaxLength(2048)
  avatar?: string;
}

export class LiveReactionDto {
  @ApiProperty({ required: true, type: () => String, maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  streamId!: string;

  @ApiProperty({ required: false, type: () => String, maxLength: 32 })
  @IsString()
  @IsOptional()
  @MaxLength(32)
  reaction?: string;
}

export class LiveAskQuestionDto {
  @ApiProperty({ required: true, type: () => String, maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  streamId!: string;

  @ApiProperty({ required: true, type: () => String, maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  question!: string;

  @ApiProperty({ required: true, type: () => String, maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username!: string;

  @ApiProperty({ required: false, type: () => String, maxLength: 2048 })
  @IsString()
  @IsOptional()
  @MaxLength(2048)
  avatar?: string;
}

export class LiveHighlightQuestionDto {
  @ApiProperty({ required: true, type: () => String, maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  streamId!: string;

  @ApiProperty({ required: true, type: () => String, maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  questionId!: string;

  @ApiProperty({ required: true, type: () => String, maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  question!: string;

  @ApiProperty({ required: true, type: () => String, maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username!: string;

  @ApiProperty({ required: false, type: () => String, maxLength: 2048 })
  @IsString()
  @IsOptional()
  @MaxLength(2048)
  avatar?: string;
}

export class LiveSetGoalDto {
  @ApiProperty({ required: true, type: () => String, maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  streamId!: string;

  @ApiProperty({ required: true, type: () => String, maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title!: string;

  @ApiProperty({
    required: true,
    type: () => Number,
    minimum: 1,
    maximum: 1000000,
  })
  @IsNumber()
  @Min(1)
  @Max(1000000)
  target!: number;
}
