import { Global, Module } from '@nestjs/common';
import { AccountStateService } from './services/account-state.service.js';

@Global()
@Module({
  providers: [AccountStateService],
  exports: [AccountStateService],
})
export class AccountStateModule {}
