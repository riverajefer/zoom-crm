import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AttachExpenseItemReceiptDto {
  @ApiProperty({ description: 'ID del archivo comprobante de pago (UploadedFile)' })
  @IsUUID('all', { message: 'El comprobante debe ser un archivo válido' })
  receiptFileId: string;
}
