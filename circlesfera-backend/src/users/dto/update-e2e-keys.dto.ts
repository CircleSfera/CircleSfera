import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateE2EKeysDto {
  @IsString()
  @IsNotEmpty()
  publicKey!: string;

  @IsString()
  @IsNotEmpty()
  privateKeyEncrypted!: string;
}
