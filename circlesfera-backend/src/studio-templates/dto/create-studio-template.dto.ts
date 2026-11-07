import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateStudioTemplateDto {
  @ApiProperty({ required: true, type: () => String, maxLength: 80 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  /** The template's slots, effects and library song; rebuilt by the server. */
  @ApiProperty({ required: true, type: Object, additionalProperties: true })
  @IsObject()
  structure!: Record<string, unknown>;

  /** The author's own Frame it is offered from. */
  @ApiProperty({ required: false, type: () => String })
  @IsUUID()
  @IsOptional()
  postId?: string;

  /** Whether people who can see that Frame may use it. */
  @ApiProperty({ required: false, type: () => Boolean })
  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;
}
