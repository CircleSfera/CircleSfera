import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class InviteCoHostDto {
  @IsUUID()
  @IsNotEmpty()
  coHostUserId!: string;
}
