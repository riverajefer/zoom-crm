import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateSedeDto } from './create-sede.dto';

/**
 * El código no se edita: es el prefijo de la numeración, y cambiarlo dejaría
 * los documentos viejos con un prefijo que ya no existe.
 */
export class UpdateSedeDto extends PartialType(OmitType(CreateSedeDto, ['code'] as const)) {}
