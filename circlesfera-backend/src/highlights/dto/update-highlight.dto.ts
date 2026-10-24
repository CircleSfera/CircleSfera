import { PartialType } from '@nestjs/swagger';
import { CreateHighlightDto } from './create-highlight.dto.js';

export class UpdateHighlightDto extends PartialType(CreateHighlightDto) {}
