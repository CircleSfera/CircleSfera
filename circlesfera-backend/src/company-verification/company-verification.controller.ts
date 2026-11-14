import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UploadedFile as UploadedFileDecorator,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { MAX_DOCUMENT_BYTES } from './company-verification.constants.js';
import { CompanyVerificationService } from './company-verification.service.js';
import { CompanyDetailsDto } from './dto/company-details.dto.js';
import { ConfirmEmailCodeDto, SendEmailCodeDto } from './dto/email-code.dto.js';

// The company verification of the Business Profile in use, by its owner
// only: no route here opens to a team member's session.
@Controller('company-verification')
@UseGuards(JwtAuthGuard)
export class CompanyVerificationController {
  constructor(private readonly service: CompanyVerificationService) {}

  @Get()
  @ApiResponse({ status: 200 })
  status(@CurrentUser() user: CurrentUserData) {
    return this.service.status(user.userId, user.profileId);
  }

  @Put()
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  @ApiResponse({ status: 200 })
  saveDetails(
    @CurrentUser() user: CurrentUserData,
    @Body() body: CompanyDetailsDto,
  ) {
    return this.service.saveDetails(user.userId, user.profileId, body);
  }

  @Post('domain/check')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  @ApiResponse({ status: 200 })
  checkDomain(@CurrentUser() user: CurrentUserData) {
    return this.service.checkDomain(user.userId, user.profileId);
  }

  @Post('domain/email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 3, ttl: 15 * 60_000 } })
  @ApiResponse({ status: 200 })
  sendEmailCode(
    @CurrentUser() user: CurrentUserData,
    @Body() body: SendEmailCodeDto,
  ) {
    return this.service.sendEmailCode(
      user.userId,
      user.profileId,
      body.localPart,
    );
  }

  @Post('domain/email/confirm')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  @ApiResponse({ status: 200 })
  confirmEmailCode(
    @CurrentUser() user: CurrentUserData,
    @Body() body: ConfirmEmailCodeDto,
  ) {
    return this.service.confirmEmailCode(
      user.userId,
      user.profileId,
      body.code,
    );
  }

  @Post('documents')
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1, fields: 0, parts: 2 },
    }),
  )
  @ApiResponse({ status: 201 })
  addDocument(
    @CurrentUser() user: CurrentUserData,
    @UploadedFileDecorator()
    file: { originalname: string; size: number; buffer: Buffer } | undefined,
  ) {
    return this.service.addDocument(user.userId, user.profileId, file);
  }

  @Delete('documents/:id')
  @ApiResponse({ status: 200 })
  removeDocument(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.removeDocument(user.userId, user.profileId, id);
  }

  @Post('submit')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200 })
  submit(@CurrentUser() user: CurrentUserData) {
    return this.service.submit(user.userId, user.profileId);
  }

  @Post('withdraw')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200 })
  withdraw(@CurrentUser() user: CurrentUserData) {
    return this.service.withdraw(user.userId, user.profileId);
  }
}
