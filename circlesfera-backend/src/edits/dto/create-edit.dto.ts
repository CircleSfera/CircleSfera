import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

export class CreateEditDto {
  @ApiProperty({ required: true, type: () => String })
  @IsString()
  mediaUrl!: string;

  @ApiProperty({ required: false, type: () => String, default: 'image' })
  @IsString()
  @IsOptional()
  mediaType?: string = 'image';

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: true, type: Object, additionalProperties: true })
  @IsObject()
  state!: Record<string, any>;
}
