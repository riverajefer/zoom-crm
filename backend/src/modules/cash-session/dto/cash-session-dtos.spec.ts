import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CloseCashSessionDto } from './close-cash-session.dto';
import { OpenCashSessionDto } from './open-cash-session.dto';

describe('DTOs de sesión de caja', () => {
  it('se puede abrir sin fondo de apertura (lista de denominaciones vacía)', async () => {
    const dto = plainToInstance(OpenCashSessionDto, { cashRegisterId: 'caja-1', denominations: [] });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('se puede cerrar en $0 si todo el efectivo se retiró', async () => {
    const dto = plainToInstance(CloseCashSessionDto, { denominations: [] });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('las denominaciones siguen siendo obligatorias como lista', async () => {
    const dto = plainToInstance(CloseCashSessionDto, {});
    expect((await validate(dto)).map((e) => e.property)).toContain('denominations');
  });
});
