import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WellKnownController } from './well-known.controller.js';

@Module({
  imports: [ConfigModule],
  controllers: [WellKnownController],
})
export class WellKnownModule {}
