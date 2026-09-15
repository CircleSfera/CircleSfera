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
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  conversationId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  recipientId!: string;
}

export class SendReactionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  messageId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  conversationId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  reaction!: string;
}

export class MarkReadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  conversationId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  recipientId!: string;
}

export class CallInviteDto {
  @IsString()
  @IsOptional()
  @MaxLength(64)
  targetId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  recipientId?: string;

  @IsOptional()
  @IsIn(['audio', 'video'])
  type?: 'audio' | 'video';
}

export class CallAcceptDeclineDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  callerId!: string;
}

export class CallSignalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  targetId!: string;

  signal!: unknown;
}

export class CallHangupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  targetId!: string;
}

export class LiveStreamIdDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  streamId!: string;
}

export class LiveChatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  streamId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  message!: string;
}

export class LivePinCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  streamId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  commentId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  message!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username!: string;

  @IsString()
  @IsOptional()
  @MaxLength(2048)
  avatar?: string;
}

export class LiveReactionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  streamId!: string;

  @IsString()
  @IsOptional()
  @MaxLength(32)
  reaction?: string;
}

export class LiveAskQuestionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  streamId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  question!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username!: string;

  @IsString()
  @IsOptional()
  @MaxLength(2048)
  avatar?: string;
}

export class LiveHighlightQuestionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  streamId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  questionId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  question!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username!: string;

  @IsString()
  @IsOptional()
  @MaxLength(2048)
  avatar?: string;
}

export class LiveSetGoalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  streamId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title!: string;

  @IsNumber()
  @Min(1)
  @Max(1000000)
  target!: number;
}
