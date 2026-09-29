import { describe, expect, it } from 'vitest';
import { COMPANY_INFO, pdfContactLines } from './pdfConstants';

describe('pdfContactLines', () => {
  it('imprime la dirección y el teléfono de la sede, con la ciudad y el correo comunes', () => {
    const lines = pdfContactLines({ address: 'Cra 28 #10-86 Edificio Fénix (Local 104)', phone: '(+57) 321 201 6229' });

    expect(lines.address).toBe(`Cra 28 #10-86 Edificio Fénix (Local 104), ${COMPANY_INFO.city}`);
    expect(lines.contact).toBe(`Tel: (+57) 321 201 6229 | ${COMPANY_INFO.email}`);
  });

  it('una sede sin dirección ni teléfono (la Matriz) o sin sede imprime solo la ciudad y el correo', () => {
    expect(pdfContactLines({ address: null, phone: null })).toEqual({
      address: COMPANY_INFO.city,
      contact: COMPANY_INFO.email,
    });
    expect(pdfContactLines(undefined, '  |  ').contact).toBe(COMPANY_INFO.email);
  });

  it('usa el separador pedido entre el teléfono y el correo', () => {
    expect(pdfContactLines({ phone: '123' }, '  |  ').contact).toBe(`Tel: 123  |  ${COMPANY_INFO.email}`);
  });
});
