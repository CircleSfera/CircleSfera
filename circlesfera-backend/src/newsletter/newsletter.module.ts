import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module.js';
import { NewsletterController } from './newsletter.controller.js';

@Module({
  imports: [EmailModule],
  controllers: [NewsletterController],
})
export class NewsletterModule {}
