import { Body, Controller, Inject, Post } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS requires value import for metadata reflection
import { CreateWhitelistEntryDto } from './dto/create-whitelist-entry.dto.js';
import { WhitelistService } from './whitelist.service.js';

@Controller('whitelist')
export class WhitelistController {
  constructor(
    @Inject(WhitelistService)
    private readonly whitelistService: WhitelistService,
  ) {}

  @Post('signup')
  create(@Body() createWhitelistEntryDto: CreateWhitelistEntryDto) {
    return this.whitelistService.create(createWhitelistEntryDto);
  }
}
