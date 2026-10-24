import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateGroupDto {
  @ApiProperty({ required: true, type: () => [String] })
  @IsArray()
  @IsNotEmpty()
  participantIds!: string[];

  @ApiProperty({ required: false, type: () => String })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false, type: () => Boolean, default: true })
  @IsBoolean()
  @IsOptional()
  isGroup?: boolean = true;
}
