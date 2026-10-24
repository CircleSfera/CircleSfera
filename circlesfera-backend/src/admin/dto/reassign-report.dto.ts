import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ReassignReportDto {
  @ApiProperty({ required: true, type: () => String, format: 'uuid' })
  @IsUUID()
  toAdminId!: string;
}
