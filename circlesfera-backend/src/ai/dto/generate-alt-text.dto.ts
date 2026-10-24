import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { LOCAL_UPLOAD_URL } from '../../common/constants/local-upload.constants.js';

export class GenerateAltTextDto {
  // The address the upload answered: /uploads/<uuid>.<ext> when the server
  // keeps files on its disk, as production does, or a full address.
  @ValidateIf(
    (dto: GenerateAltTextDto) =>
      typeof dto.imageUrl !== 'string' || !LOCAL_UPLOAD_URL.test(dto.imageUrl),
  )
  @ApiProperty({
    required: true,
    type: () => String,
    maxLength: 2048,
    format: 'uri',
  })
  @IsString()
  @IsNotEmpty()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  imageUrl!: string;
}
