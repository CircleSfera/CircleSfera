import { IsUUID } from 'class-validator';

export class ReassignReportDto {
  @IsUUID()
  toAdminId!: string;
}
