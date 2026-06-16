import { Body, Controller, Inject, Post } from '@nestjs/common';
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
