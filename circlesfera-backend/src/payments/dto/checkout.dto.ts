import { IsIn, IsNotEmpty, IsUUID } from 'class-validator';

export class CheckoutDto {
  @IsUUID()
  @IsNotEmpty()
  planId!: string;

  @IsIn(['MONTHLY', 'YEARLY'])
  billingCycle: 'MONTHLY' | 'YEARLY' = 'MONTHLY';
}
